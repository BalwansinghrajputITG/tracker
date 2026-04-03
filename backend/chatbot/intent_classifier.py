"""
LLM-powered intent classifier for the chatbot.

Replaces keyword-only NLP matching with a single structured LLM call that:
  - Understands any natural-language phrasing the keyword lists miss
  - Extracts all relevant entities (names, percentages, statuses) in one pass
  - Returns a slash-command string consumed by the existing parse_command() router
  - Falls back to keyword-based matching (command_parser.py) if the LLM fails

Flow:
  User message
    → classify_intent()  [this module — LLM]
        → slash-command string   (e.g. "/project Alpha")
        → parse_command()        (existing router, unchanged)
    → fallback: extract_intent_from_natural_language()  (keyword NLP, existing)
"""

import json
import logging
import re
from typing import Optional

from chatbot.llm_client import chat_completion

logger = logging.getLogger(__name__)


# ─── Greeting / small-talk detection (skip LLM for these) ────────────────────

_GREETING_PATTERNS = re.compile(
    r"^\s*(?:hi|hello|hey|good\s*(?:morning|afternoon|evening|day)|howdy|"
    r"salaam|salam|assalam|namaste|hola|bonjour|greetings|sup|"
    r"what'?s\s+up|how\s+are\s+you|how\s+r\s+u|how(?:'s|\s+is)\s+it\s+going|"
    r"thanks?|thank\s+you|thx|ty|bye|goodbye|ok|okay|alright|sure|got\s+it|"
    r"cool|great|nice|awesome|perfect|sounds\s+good)\s*[!.?]*\s*$",
    re.IGNORECASE,
)


# ─── Intent → command template map ───────────────────────────────────────────
# Placeholders like {project_name} are filled from the entities dict returned
# by the LLM.  Any unfilled placeholder is stripped before parsing.

_INTENT_TEMPLATES: dict[str, Optional[str]] = {
    # ── Read-only ──────────────────────────────────────────────────────────────
    "list_projects":         "/project",
    "project_detail":        "/project {project_name}",
    "list_tasks":            "/tasks",
    "task_detail":           "/tasks {task_title}",
    "list_teams":            "/team",
    "team_detail":           "/team {team_name}",
    "list_employees":        "/employees",
    "employee_detail":       "/employee {employee_name}",
    "delayed_projects":      "/delayed",
    "blockers":              "/blockers",
    "reports":               "/reports {employee_name}",
    "stats":                 "/stats",
    "analytics":             "/analytics",
    "missing_reports":       "/missing-reports",
    "contributor_stats":     "/contributor-stats {project_name}",
    "send_message":          "/message {recipient_name} {message_text}",
    "commits":               "/commits {project_name}",
    "employee_commits":      "/commits {project_name} --author {employee_name}",
    "dashboard":             "/dashboard",
    "notifications":         "/notifications",
    "help":                  "/help",
    # ── Actions (write operations) ─────────────────────────────────────────────
    "create_team":           "/create-team {team_name}",
    "add_member":            "/add-member {team_name} {member_name}",
    "remove_member":         "/remove-member {team_name} {member_name}",
    "create_project":        "/create-project {project_name}",
    "create_task":           "/create-task {task_title}",
    "update_task":           "/update-task {task_title} {status}",
    "update_progress":       "/update-progress {project_name} {percentage}",
    "assign_task":           "/assign-task {task_title} {user_name}",
    "create_user":           "/create-user",
    "mark_blocked":          "/mark-blocked {task_title}",
    "mark_unblocked":        "/mark-unblocked {task_title}",
    "delete_user":           "/delete-user {user_name}",
    "activate_user":         "/activate-user {user_name}",
    "submit_report":         "/submit-report",
    "edit_project":          "/edit-project {project_name} --status {status} --priority {priority} --progress {percentage} --due {due_date}",
    "cancel_project":        "/cancel-project {project_name}",
    "edit_team":             "/edit-team {team_name} --name {new_name} --dept {department} --lead {lead_name} --pm {pm_name}",
    "delete_team":           "/delete-team {team_name}",
    "edit_task":             "/edit-task {task_title} --priority {priority} --due {due_date} --assignees {assignee_names}",
    "add_project_member":    "/add-project-member {project_name} {user_name}",
    "remove_project_member": "/remove-project-member {project_name} {user_name}",
    "log_hours":             "/log-hours {task_title} {hours}",
    "comment_task":          "/comment-task {task_title} -- {comment}",
    "review_report":         "/review-report {employee_name} -- {comment}",
    "mark_read":             "/mark-read",
    "update_user":           "/update-user {user_name} --dept {department}",
    "change_password":       "/change-password",
    "delete_report":         "/delete-report",
    # General fallthrough — no command, let LLM answer from context
    "general":               None,
}


_CLASSIFIER_SYSTEM = """\
You are an intent classifier for a project management chatbot.
Read the user's message and return ONLY a JSON object — no markdown, no explanation, no extra text.

IMPORTANT: If the message is a greeting (hi, hello, hey, good morning, salaam, thanks, bye, etc.)
or small talk with NO actionable intent, return: {"intent": "general", "entities": {}, "confidence": 1.0}

Available intents:

READ-ONLY INTENTS
  list_projects         User wants all/multiple projects
  project_detail        Specific project info            → project_name
  list_tasks            User wants tasks                 → project_name (opt), status (opt)
  task_detail           Specific task info               → task_title
  list_teams            User wants all teams
  team_detail           Specific team info               → team_name
  list_employees        User wants all employees / staff list
  employee_detail       Specific employee profile        → employee_name
  delayed_projects      Overdue / delayed / behind-schedule projects
  blockers              Blocked tasks / impediments
  reports               Daily reports / compliance       → employee_name (opt)
  stats                 Company KPIs, quick summary
  analytics             Full company analytics, detailed metrics, project health
  missing_reports       Who hasn't submitted today's report
  contributor_stats     Per-contributor commit counts for a project → project_name (opt)
  commits               All commit history for a project repo      → project_name (opt)
  employee_commits      Commits by a specific person on a project  → project_name, employee_name
  dashboard             User's role-specific dashboard
  notifications         User's notifications
  send_message          Send chat message to someone    → recipient_name, message_text
  help                  Help or available commands

ACTION INTENTS (write operations)
  create_team           Create a new team               → team_name, lead_name (opt), pm_name (opt), member_names (opt)
  add_member            Add someone to a team           → team_name, member_name
  remove_member         Remove someone from a team      → team_name, member_name
  create_project        Create a new project            → project_name
  create_task           Create a new task               → task_title, project_name (opt)
  update_task           Change task status              → task_title, status (todo|in_progress|review|done|blocked)
  update_progress       Set project progress %          → project_name, percentage (number only)
  assign_task           Assign a task to someone        → task_title, user_name
  create_user           Create a new user account       → full_name (opt), email (opt), role (opt), department (opt)
  mark_blocked          Mark a task as blocked          → task_title, reason (opt)
  mark_unblocked        Unblock a task                  → task_title
  delete_user           Deactivate a user account       → user_name
  activate_user         Reactivate a deactivated user   → user_name
  submit_report         Submit today's daily report     → hours (opt), project_name (opt), tasks_done (opt, comma-sep), blockers (opt), mood (opt: great|good|neutral|stressed|burned_out), notes (opt)
  edit_project          Update a project's fields       → project_name, status (opt), priority (opt), percentage (opt), due_date (opt)
  cancel_project        Cancel / close a project        → project_name
  edit_team             Update a team's fields          → team_name, new_name (opt), department (opt), lead_name (opt), pm_name (opt)
  delete_team           Delete / disband a team         → team_name
  edit_task             Update a task's fields          → task_title, priority (opt), due_date (opt), assignee_names (opt)
  add_project_member    Add a user to a project         → project_name, user_name
  remove_project_member Remove a user from a project   → project_name, user_name
  log_hours             Log hours worked on a task      → task_title, hours (number)
  comment_task          Add a comment to a task         → task_title, comment
  review_report         Mark an employee's report as reviewed → employee_name, comment (opt)
  mark_read             Mark all notifications as read
  update_user           Update a user's profile         → user_name, department (opt), new_name (opt)
  change_password       Change own password             → (no entities needed; let user provide interactively)
  delete_report         Delete own daily report
  general               None of the above / unclear / conversational follow-up

Rules:
- Use "general" for greetings, follow-ups, unclear messages, or when the user refers to
  something from the conversation without specifying what ("it", "this", "that").
- Use "employee_commits" when the user asks about commits BY a specific person (e.g.
  "show john's commits", "what did ali push to alpha", "john's github activity on beta").
  Both project_name AND employee_name are required; if project is missing use "employee_detail".
- Use "commits" when asking about all commits on a project with no specific person mentioned.
- Use "employee_detail" when asking about a person's profile, tasks, or reports (not commits).
- Extract entity values EXACTLY as written by the user (do not paraphrase).
- For "percentage" extract only the number (e.g. "75" not "75%").
- For "status" normalise to one of: todo, in_progress, review, done, blocked.
- For "priority" normalise to one of: low, medium, high, critical.
- For "mood" normalise to one of: great, good, neutral, stressed, burned_out.
- Omit an entity key if the value is not present in the message.
- Confidence 0.9+ = very clear intent. 0.7 = likely. 0.5 = possible. <0.45 = unclear → use general.

Respond with ONLY this JSON (no other text):
{"intent": "<intent>", "entities": {}, "confidence": <0.0-1.0>}
"""


async def classify_intent(user_message: str) -> Optional[str]:
    """
    Classify the user's intent via LLM and return a slash-command string,
    or None if the message is general / classification fails.

    The returned string is fed directly into parse_command() so the existing
    routing logic requires zero changes.
    """
    # Fast-path: detect greetings/small-talk before calling the LLM
    if _GREETING_PATTERNS.match(user_message.strip()):
        logger.info("Intent classifier → greeting/small-talk detected, skipping LLM")
        return None

    try:
        messages = [
            {"role": "system", "content": _CLASSIFIER_SYSTEM},
            {"role": "user",   "content": user_message},
        ]
        raw = await chat_completion(messages, temperature=0.0, max_tokens=200)

        # Strip markdown code fences the model may add despite instructions
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()

        result = json.loads(raw)

        intent: str     = result.get("intent", "general")
        entities: dict  = result.get("entities") or {}
        confidence: float = float(result.get("confidence", 0.0))

        logger.info(
            "Intent classifier → intent=%r  confidence=%.2f  entities=%s",
            intent, confidence, entities,
        )

        # Low-confidence or general → let downstream handlers decide
        if confidence < 0.45 or intent == "general":
            return None

        # ── Special-case builders for intents with complex flag syntax ──────────

        if intent == "edit_project":
            name = (entities.get("project_name") or "").strip()
            if not name:
                return None
            parts = [f"/edit-project {name}"]
            if entities.get("status", "").strip():
                parts.append(f"--status {entities['status'].strip()}")
            if entities.get("priority", "").strip():
                parts.append(f"--priority {entities['priority'].strip()}")
            if entities.get("percentage"):
                parts.append(f"--progress {str(entities['percentage']).strip()}")
            if entities.get("due_date", "").strip():
                parts.append(f"--due {entities['due_date'].strip()}")
            return " ".join(parts)

        if intent == "edit_team":
            name = (entities.get("team_name") or "").strip()
            if not name:
                return None
            parts = [f"/edit-team {name}"]
            if entities.get("new_name", "").strip():
                parts.append(f"--name {entities['new_name'].strip()}")
            if entities.get("department", "").strip():
                parts.append(f"--dept {entities['department'].strip()}")
            if entities.get("lead_name", "").strip():
                parts.append(f"--lead {entities['lead_name'].strip()}")
            if entities.get("pm_name", "").strip():
                parts.append(f"--pm {entities['pm_name'].strip()}")
            return " ".join(parts)

        if intent == "edit_task":
            name = (entities.get("task_title") or "").strip()
            if not name:
                return None
            parts = [f"/edit-task {name}"]
            if entities.get("priority", "").strip():
                parts.append(f"--priority {entities['priority'].strip()}")
            if entities.get("due_date", "").strip():
                parts.append(f"--due {entities['due_date'].strip()}")
            if entities.get("assignee_names", "").strip():
                parts.append(f"--assignees {entities['assignee_names'].strip()}")
            return " ".join(parts)

        if intent == "create_team":
            team_name = (entities.get("team_name") or "").strip() or "New Team"
            parts = [f"/create-team {team_name}"]
            if entities.get("lead_name", "").strip():
                parts.append(f"--lead {entities['lead_name'].strip()}")
            if entities.get("pm_name", "").strip():
                parts.append(f"--pm {entities['pm_name'].strip()}")
            if entities.get("member_names", "").strip():
                parts.append(f"--members {entities['member_names'].strip()}")
            return " ".join(parts)

        if intent == "submit_report":
            parts = ["/submit-report"]
            if entities.get("hours"):
                parts.append(f"{entities['hours']}h")
            if entities.get("project_name", "").strip():
                parts.append(f"--project {entities['project_name'].strip()}")
            if entities.get("tasks_done", "").strip():
                parts.append(f"--tasks {entities['tasks_done'].strip()}")
            if entities.get("blockers", "").strip():
                parts.append(f"--blockers {entities['blockers'].strip()}")
            if entities.get("mood", "").strip():
                parts.append(f"--mood {entities['mood'].strip()}")
            if entities.get("notes", "").strip():
                parts.append(f"--notes {entities['notes'].strip()}")
            return " ".join(parts)

        if intent == "comment_task":
            name = (entities.get("task_title") or "").strip()
            comment = (entities.get("comment") or "").strip()
            if name and comment:
                return f"/comment-task {name} -- {comment}"
            if name:
                return f"/comment-task {name}"
            return None

        if intent == "review_report":
            emp = (entities.get("employee_name") or "").strip()
            comment = (entities.get("comment") or "").strip()
            if emp and comment:
                return f"/review-report {emp} -- {comment}"
            if emp:
                return f"/review-report {emp}"
            return None

        # ── Generic template fill ───────────────────────────────────────────────
        template = _INTENT_TEMPLATES.get(intent)
        if template is None:
            return None

        cmd = template
        for key, val in entities.items():
            if val is not None and str(val).strip():
                cmd = cmd.replace(f"{{{key}}}", str(val).strip())

        # Remove any unfilled placeholders
        cmd = re.sub(r"\s*\{[^}]+\}", "", cmd).strip()

        return cmd if cmd else None

    except Exception as exc:
        logger.warning("Intent classifier error: %s", exc)
        return None
