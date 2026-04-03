from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
import uuid
import json
import re

from database import get_db
from middleware.auth import get_current_user
from chatbot.llm_client import chat_completion
from chatbot.system_prompt import build_system_prompt
from chatbot.command_parser import parse_command, extract_intent_from_natural_language, ParsedCommand
from chatbot.intent_classifier import classify_intent
from chatbot.context_builder import ContextBuilder
from chatbot.page_index import ReportIndex
from chatbot.action_executor import ActionExecutor

router = APIRouter()

EXEC_ROLES = {"ceo", "coo"}

# Commands that perform write operations
ACTION_COMMANDS = {
    "create-team", "add-member", "remove-member", "create-project",
    "create-task", "update-task", "update-progress", "assign-task",
    "create-user", "mark-blocked", "mark-unblocked", "delete-user",
    "submit-report", "edit-project", "cancel-project",
    "edit-team", "delete-team", "edit-task", "add-project-member",
    "log-hours", "comment-task", "review-report", "mark-read", "update-user",
    # new
    "change-password", "delete-report", "activate-user", "remove-project-member",
}


def require_exec(current_user: dict):
    """Raise 403 if caller is not CEO or COO."""
    if current_user.get("primary_role") not in EXEC_ROLES:
        raise HTTPException(status_code=403, detail="Access restricted to CEO and COO only.")


class ChatMessage(BaseModel):
    message: str
    session_id: str = None


# ─────────────────────────────────────────────────────────────────────────────
#  Own chat
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/message")
async def chatbot_message(
    body: ChatMessage,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    user_message = body.message.strip()
    session_id = body.session_id or str(uuid.uuid4())
    role = current_user.get("primary_role", "manager")

    # Load or create session — ALWAYS scoped to the caller's own user_id
    session = await db.chatbot_sessions.find_one({
        "user_id": current_user["_id"],
        "session_id": session_id,
    })
    history = session["messages"] if session else []
    session_context = session.get("context", {}) if session else {}

    # --- Command Parsing ---
    # 1. Explicit slash command typed by the user
    command = parse_command(user_message)

    if not command:
        # 2. LLM intent classifier — understands any natural-language phrasing
        #    and extracts entities (names, percentages, statuses) in one pass.
        classified = await classify_intent(user_message)
        if classified:
            command = parse_command(classified)

    if not command:
        # 3. Keyword-based NLP fallback (fast, no LLM call needed)
        keyword_intent = extract_intent_from_natural_language(user_message)
        if keyword_intent:
            command = parse_command(keyword_intent)

    # 4. Session context carry-over: if user says "it"/"this"/"that" and we
    #    detected a command for a project/team/employee but no specific name,
    #    inject the name from the previous session context.
    if command and not command.args:
        active_name = session_context.get("active_project") or session_context.get("active_team")
        if active_name and command.command in ("project", "edit-project", "cancel-project",
                                               "update-progress", "commits", "contributor-stats",
                                               "team", "edit-team", "delete-team"):
            command = ParsedCommand(command=command.command, args=[active_name], raw=command.raw)

    # --- Context Building ---
    context_str = ""
    context_builder = ContextBuilder(db)

    if not command:
        context_str = await context_builder.build_context_for_command(
            "_general", [], current_user
        )

    if command:
        # ── Action commands (write operations) ─────────────────────────────
        if command.command in ACTION_COMMANDS:
            executor = ActionExecutor(db, current_user)
            raw_arg = command.args[0] if command.args else ""
            result = await _route_action(executor, command.command, raw_arg, command.args)
            context_str = f"ACTION RESULT:\n{json.dumps(result, indent=2, default=str)}"

        elif command.command == "message":
            if len(command.args) >= 2:
                target_name = command.args[0]
                msg_text = command.args[1]
                target_user = await db.users.find_one(
                    {"full_name": {"$regex": target_name, "$options": "i"}}
                )
                if target_user:
                    room = await db.chat_rooms.find_one({
                        "type": "direct",
                        "participants": {"$all": [current_user["_id"], target_user["_id"]]},
                    })
                    if not room:
                        doc = {
                            "type": "direct",
                            "participants": [current_user["_id"], target_user["_id"]],
                            "created_by": current_user["_id"],
                            "last_message_at": datetime.now(timezone.utc),
                            "last_message_preview": msg_text[:100],
                            "is_active": True,
                            "created_at": datetime.now(timezone.utc),
                        }
                        room_result = await db.chat_rooms.insert_one(doc)
                        room_id = str(room_result.inserted_id)
                    else:
                        room_id = str(room["_id"])

                    await db.chat_messages.insert_one({
                        "room_id": ObjectId(room_id),
                        "sender_id": current_user["_id"],
                        "content": msg_text,
                        "message_type": "text",
                        "is_deleted": False,
                        "read_by": [current_user["_id"]],
                        "sent_at": datetime.now(timezone.utc),
                    })
                    return {
                        "session_id": session_id,
                        "response": f"Message sent to {target_user['full_name']}: \"{msg_text}\"",
                        "command": "message",
                        "action_taken": True,
                    }

        elif command.command == "reports":
            report_index = ReportIndex(db)
            index = await report_index.build_index(days=14)
            context_str = await report_index.query_index(index, user_message)
            context_str = f"RELEVANT REPORT DATA (via PageIndex):\n{context_str}"

        elif command.command == "help":
            context_str = await context_builder.build_context_for_command(
                "help", command.args, current_user
            )
        elif command.command in ("dashboard", "notifications", "commits", "missing-reports",
                                  "analytics", "contributor-stats"):
            context_str = await context_builder.build_context_for_command(
                command.command, command.args, current_user
            )
        else:
            context_str = await context_builder.build_context_for_command(
                command.command, command.args, current_user
            )

    # --- Build LLM messages ---
    user_name = current_user.get("full_name", "User")
    system_prompt = build_system_prompt(role, user_name)

    # Inject active session context so the LLM can resolve pronoun references
    if session_context:
        ctx_lines = []
        if session_context.get("active_project"):
            ctx_lines.append(f"Active project in conversation: {session_context['active_project']}")
        if session_context.get("active_team"):
            ctx_lines.append(f"Active team in conversation: {session_context['active_team']}")
        if session_context.get("active_employee"):
            ctx_lines.append(f"Active employee in conversation: {session_context['active_employee']}")
        if ctx_lines:
            system_prompt += "\n\n[SESSION CONTEXT]\n" + "\n".join(ctx_lines)

    messages = [{"role": "system", "content": system_prompt}]
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})

    user_content = user_message
    if context_str:
        user_content = f"{user_message}\n\n[CONTEXT DATA]\n{context_str}"
    messages.append({"role": "user", "content": user_content})

    try:
        response_text = await chat_completion(messages, temperature=0.3, max_tokens=1024)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {str(e)}")

    # ── Update session context (active project/team/employee for follow-ups) ────
    if command and command.args:
        if command.command in ("project", "edit-project", "cancel-project",
                               "update-progress", "commits", "contributor-stats"):
            session_context["active_project"] = command.args[0]
            session_context.pop("active_team", None)
        elif command.command in ("team", "edit-team", "delete-team"):
            session_context["active_team"] = command.args[0]
            session_context.pop("active_project", None)
        elif command.command in ("employee",):
            session_context["active_employee"] = command.args[0]

    # Persist session — scoped to caller only
    new_history = history + [
        {"role": "user", "content": user_message,
         "timestamp": datetime.now(timezone.utc).isoformat(),
         "command": command.command if command else None},
        {"role": "assistant", "content": response_text,
         "timestamp": datetime.now(timezone.utc).isoformat()},
    ]
    await db.chatbot_sessions.update_one(
        {"user_id": current_user["_id"], "session_id": session_id},
        {"$set": {
            "messages": new_history[-50:],
            "context": session_context,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    # Build structured data for interactive frontend cards
    structured_data = None
    if command and command.command not in ACTION_COMMANDS and command.command != "message":
        try:
            structured_data = await context_builder.get_structured_data(
                command.command, command.args, current_user
            )
        except Exception:
            pass  # non-fatal

    return {
        "session_id": session_id,
        "response": response_text,
        "command": command.command if command else None,
        "action_taken": command.command in ACTION_COMMANDS if command else False,
        "structured_data": structured_data,
    }


async def _route_action(executor: ActionExecutor, cmd: str, raw_arg: str, all_args: list) -> dict:
    """
    Parse the raw argument string and dispatch to the correct ActionExecutor method.
    Keeps parsing simple — the executor handles validation.
    """
    tokens = raw_arg.split() if raw_arg else []

    if cmd == "create-team":
        # Format: <team name> [--lead <name>] [--pm <name>] [--members <n1>, <n2>]
        lead_m = re.search(r"--lead\s+(.*?)(?=\s+--|$)", raw_arg)
        pm_m = re.search(r"--pm\s+(.*?)(?=\s+--|$)", raw_arg)
        members_m = re.search(r"--members\s+(.*?)(?=\s+--|$)", raw_arg)

        lead_name = lead_m.group(1).strip() if lead_m else None
        pm_name = pm_m.group(1).strip() if pm_m else None
        if members_m:
            member_names = [m.strip() for m in re.split(r",|\s+and\s+", members_m.group(1)) if m.strip()]
        else:
            member_names = []

        # Team name is everything before the first --flag
        name_part = re.split(r"\s+--\w+", raw_arg)[0].strip()

        return await executor.create_team(
            name=name_part,
            lead_name=lead_name,
            pm_name=pm_name,
            member_names=member_names,
        )

    if cmd == "add-member":
        # /add-member <team_name> <user_name>  (team name may be multi-word)
        # Try to split: last two tokens = user (first name + last name), rest = team
        if len(tokens) >= 2:
            # Heuristic: last 1-2 tokens = person name, everything before = team
            user_name = " ".join(tokens[-2:]) if len(tokens) >= 3 else tokens[-1]
            team_name = " ".join(tokens[:-2]) if len(tokens) >= 3 else " ".join(tokens[:-1])
            if not team_name:
                team_name = tokens[0]
                user_name = " ".join(tokens[1:])
        else:
            team_name = raw_arg
            user_name = raw_arg
        return await executor.add_member(team_name=team_name, member_name=user_name)

    if cmd == "remove-member":
        # /remove-member <team_name> <user_name>
        if len(tokens) >= 2:
            user_name = " ".join(tokens[-2:]) if len(tokens) >= 3 else tokens[-1]
            team_name = " ".join(tokens[:-2]) if len(tokens) >= 3 else " ".join(tokens[:-1])
            if not team_name:
                team_name = tokens[0]
                user_name = " ".join(tokens[1:])
        else:
            team_name = raw_arg
            user_name = raw_arg
        return await executor.remove_member(team_name=team_name, member_name=user_name)

    if cmd == "create-project":
        # /create-project <name> [--desc text] [--priority high] [--due date]
        #                        [--repo url] [--figma url] [--tags t1,t2]
        #                        [--members n1,n2] [--teams t1,t2]
        desc_m      = re.search(r"--desc(?:ription)?\s+(.*?)(?=\s+--|$)", raw_arg)
        priority_m  = re.search(r"--priority\s+(\w+)", raw_arg)
        due_m       = re.search(r"--due\s+(\S+)", raw_arg)
        repo_m      = re.search(r"--repo\s+(\S+)", raw_arg)
        figma_m     = re.search(r"--figma\s+(\S+)", raw_arg)
        tags_m      = re.search(r"--tags?\s+(.*?)(?=\s+--|$)", raw_arg)
        members_m   = re.search(r"--members?\s+(.*?)(?=\s+--|$)", raw_arg)
        teams_m     = re.search(r"--teams?\s+(.*?)(?=\s+--|$)", raw_arg)
        name_part   = re.split(r"\s+--\w+", raw_arg)[0].strip()
        member_names = [m.strip() for m in re.split(r",", members_m.group(1)) if m.strip()] if members_m else []
        team_names   = [t.strip() for t in re.split(r",", teams_m.group(1))   if t.strip()] if teams_m   else []
        tag_list     = [t.strip() for t in re.split(r",", tags_m.group(1))    if t.strip()] if tags_m    else []
        return await executor.create_project(
            name=name_part,
            description=desc_m.group(1).strip() if desc_m else "",
            priority=priority_m.group(1) if priority_m else "medium",
            due_date_str=due_m.group(1) if due_m else None,
            repo_url=repo_m.group(1) if repo_m else "",
            figma_url=figma_m.group(1) if figma_m else "",
            member_names=member_names,
            team_names=team_names,
            tags=tag_list,
        )

    if cmd == "create-task":
        # /create-task <task title>  (optional second arg = project name)
        task_title = all_args[0] if all_args else raw_arg
        project_name = all_args[1] if len(all_args) > 1 else ""
        if not project_name and len(tokens) >= 2:
            # Heuristic: last token may be project shorthand — keep full title
            task_title = raw_arg
            project_name = ""
        return await executor.create_task(title=task_title, project_name=project_name)

    if cmd == "update-task":
        # /update-task <task title> <status>  — last token is the status
        if len(tokens) >= 2:
            new_status = tokens[-1]
            task_title = " ".join(tokens[:-1])
        else:
            task_title = raw_arg
            new_status = "done"
        return await executor.update_task_status(task_title=task_title, new_status=new_status)

    if cmd == "update-progress":
        # /update-progress <project name> <percentage>  — last token is the number
        if len(tokens) >= 2:
            pct_str = tokens[-1].replace("%", "")
            project_name = " ".join(tokens[:-1])
            try:
                progress = int(pct_str)
            except ValueError:
                progress = 0
        else:
            project_name = raw_arg
            progress = 0
        return await executor.update_project_progress(project_name=project_name, progress=progress)

    if cmd == "assign-task":
        # /assign-task <task title> <user name>  — last 1-2 tokens = user
        if len(tokens) >= 2:
            user_name = " ".join(tokens[-2:]) if len(tokens) >= 3 else tokens[-1]
            task_title = " ".join(tokens[:-2]) if len(tokens) >= 3 else tokens[0]
        else:
            task_title = raw_arg
            user_name = raw_arg
        return await executor.assign_task(task_title=task_title, user_name=user_name)

    if cmd == "create-user":
        # /create-user <name> <email> <password> <department> <role>
        # Support both --flag style and positional args
        name_m  = re.search(r"--name\s+(.*?)(?=\s+--|$)", raw_arg)
        email_m = re.search(r"--email\s+(\S+)", raw_arg)
        pass_m  = re.search(r"--password\s+(\S+)", raw_arg)
        dept_m  = re.search(r"--dept\s+(.*?)(?=\s+--|$)", raw_arg)
        role_m  = re.search(r"--role\s+(\S+)", raw_arg)

        if name_m or email_m:
            # Flag-based parsing
            full_name  = name_m.group(1).strip()  if name_m  else ""
            email      = email_m.group(1).strip() if email_m else ""
            password   = pass_m.group(1).strip()  if pass_m  else "changeme123"
            department = dept_m.group(1).strip()  if dept_m  else ""
            role_name  = role_m.group(1).strip()  if role_m  else "employee"
        else:
            # Positional: try to detect email in tokens and split around it
            email_idx = next((i for i, t in enumerate(tokens) if "@" in t), -1)
            if email_idx > 0:
                full_name  = " ".join(tokens[:email_idx])
                email      = tokens[email_idx]
                password   = tokens[email_idx + 1] if email_idx + 1 < len(tokens) else "changeme123"
                department = tokens[email_idx + 2] if email_idx + 2 < len(tokens) else ""
                role_name  = tokens[email_idx + 3] if email_idx + 3 < len(tokens) else "employee"
            elif len(tokens) >= 2:
                full_name  = tokens[0]
                email      = tokens[1]
                password   = tokens[2] if len(tokens) > 2 else "changeme123"
                department = tokens[3] if len(tokens) > 3 else ""
                role_name  = tokens[4] if len(tokens) > 4 else "employee"
            else:
                return {
                    "success": False,
                    "message": (
                        "Please provide all required details:\n"
                        "**Option 1 (flags):** `/create-user --name \"John Smith\" --email john@company.com --role employee --dept Engineering`\n"
                        "**Option 2 (positional):** `/create-user \"John Smith\" john@company.com secret123 Engineering employee`"
                    ),
                    "data": {},
                }
        return await executor.create_user_action(
            full_name=full_name,
            email=email,
            password=password,
            department=department,
            role_name=role_name,
        )

    if cmd == "mark-blocked":
        # /mark-blocked <task title> [reason...]
        if len(tokens) >= 2:
            # First token(s) = task, but we can't easily separate from reason.
            # Convention: entire raw_arg = task title (reason can be given separately)
            task_title = raw_arg
            reason = ""
        else:
            task_title = raw_arg
            reason = ""
        return await executor.mark_blocked(task_title=task_title, blocked=True, reason=reason)

    if cmd == "mark-unblocked":
        return await executor.mark_blocked(task_title=raw_arg, blocked=False, reason="")

    if cmd == "delete-user":
        return await executor.deactivate_user(user_name=raw_arg)

    if cmd == "submit-report":
        # /submit-report [hours] [--project name] [--tasks t1,t2] [--planned t1,t2]
        #                [--blockers b1] [--mood good] [--notes text]
        hours = 8.0
        tasks_done = []
        tasks_planned = []
        blockers = []
        mood = "good"
        notes = ""
        project_name = ""
        h_m = re.search(r"(\d+(?:\.\d+)?)\s*h(?:ours?)?", raw_arg)
        if h_m:
            try:
                hours = float(h_m.group(1))
            except ValueError:
                pass
        proj_m = re.search(r"--project\s+(.*?)(?=\s+--|$)", raw_arg)
        if proj_m:
            project_name = proj_m.group(1).strip()
        tasks_m = re.search(r"--tasks\s+(.*?)(?=\s+--|$)", raw_arg)
        if tasks_m:
            tasks_done = [t.strip() for t in tasks_m.group(1).split(",") if t.strip()]
        planned_m = re.search(r"--planned\s+(.*?)(?=\s+--|$)", raw_arg)
        if planned_m:
            tasks_planned = [t.strip() for t in planned_m.group(1).split(",") if t.strip()]
        blockers_m = re.search(r"--blockers?\s+(.*?)(?=\s+--|$)", raw_arg)
        if blockers_m:
            blockers = [b.strip() for b in blockers_m.group(1).split(",") if b.strip()]
        mood_m = re.search(r"--mood\s+(\w+)", raw_arg)
        if mood_m:
            mood = mood_m.group(1)
        notes_m = re.search(r"--notes?\s+(.*?)(?=\s+--|$)", raw_arg)
        if notes_m:
            notes = notes_m.group(1).strip()
        return await executor.submit_report(
            tasks_done=tasks_done, tasks_planned=tasks_planned,
            blockers=blockers, hours=hours, mood=mood,
            notes=notes, project_name=project_name,
        )

    if cmd == "edit-project":
        # /edit-project <name> [--status active] [--priority high] [--progress 50] [--due date]
        #                      [--desc text] [--repo url] [--figma url] [--pm name]
        #                      [--add-members n1,n2] [--remove-members n1,n2]
        status_m        = re.search(r"--status\s+(\w+)", raw_arg)
        priority_m      = re.search(r"--priority\s+(\w+)", raw_arg)
        progress_m      = re.search(r"--progress\s+(\d+)", raw_arg)
        due_m           = re.search(r"--due\s+(\S+)", raw_arg)
        desc_m          = re.search(r"--desc(?:ription)?\s+(.*?)(?=\s+--|$)", raw_arg)
        repo_m          = re.search(r"--repo\s+(\S+)", raw_arg)
        figma_m         = re.search(r"--figma\s+(\S+)", raw_arg)
        pm_m            = re.search(r"--pm\s+(.*?)(?=\s+--|$)", raw_arg)
        add_members_m   = re.search(r"--add-members?\s+(.*?)(?=\s+--|$)", raw_arg)
        rm_members_m    = re.search(r"--remove-members?\s+(.*?)(?=\s+--|$)", raw_arg)
        name_part       = re.split(r"\s+--\w+", raw_arg)[0].strip()
        add_names = [m.strip() for m in re.split(r",", add_members_m.group(1)) if m.strip()] if add_members_m else []
        rm_names  = [m.strip() for m in re.split(r",", rm_members_m.group(1))  if m.strip()] if rm_members_m  else []
        return await executor.edit_project(
            project_name=name_part,
            status=status_m.group(1) if status_m else None,
            priority=priority_m.group(1) if priority_m else None,
            progress=int(progress_m.group(1)) if progress_m else None,
            due_date_str=due_m.group(1) if due_m else None,
            description=desc_m.group(1).strip() if desc_m else None,
            repo_url=repo_m.group(1) if repo_m else None,
            figma_url=figma_m.group(1) if figma_m else None,
            pm_name=pm_m.group(1).strip() if pm_m else None,
            add_member_names=add_names,
            remove_member_names=rm_names,
        )

    if cmd == "cancel-project":
        return await executor.cancel_project(project_name=raw_arg)

    if cmd == "edit-team":
        # /edit-team <name> [--name new] [--dept dept] [--lead name] [--pm name]
        new_name_m = re.search(r"--name\s+(.*?)(?=\s+--|$)", raw_arg)
        dept_m = re.search(r"--dept\s+(.*?)(?=\s+--|$)", raw_arg)
        lead_m = re.search(r"--lead\s+(.*?)(?=\s+--|$)", raw_arg)
        pm_m = re.search(r"--pm\s+(.*?)(?=\s+--|$)", raw_arg)
        name_part = re.split(r"\s+--\w+", raw_arg)[0].strip()
        return await executor.edit_team(
            team_name=name_part,
            new_name=new_name_m.group(1).strip() if new_name_m else None,
            department=dept_m.group(1).strip() if dept_m else None,
            lead_name=lead_m.group(1).strip() if lead_m else None,
            pm_name=pm_m.group(1).strip() if pm_m else None,
        )

    if cmd == "delete-team":
        return await executor.delete_team(team_name=raw_arg)

    if cmd == "edit-task":
        # /edit-task <title> [--title new] [--priority high] [--due date] [--assignees a,b]
        new_title_m = re.search(r"--title\s+(.*?)(?=\s+--|$)", raw_arg)
        priority_m = re.search(r"--priority\s+(\w+)", raw_arg)
        due_m = re.search(r"--due\s+(\S+)", raw_arg)
        assignees_m = re.search(r"--assignees?\s+(.*?)(?=\s+--|$)", raw_arg)
        name_part = re.split(r"\s+--\w+", raw_arg)[0].strip()
        assignee_names = [a.strip() for a in assignees_m.group(1).split(",")] if assignees_m else []
        return await executor.edit_task(
            task_title=name_part,
            new_title=new_title_m.group(1).strip() if new_title_m else None,
            priority=priority_m.group(1) if priority_m else None,
            due_date_str=due_m.group(1) if due_m else None,
            assignee_names=assignee_names,
        )

    if cmd == "add-project-member":
        # /add-project-member <project> <user>  — last 2 tokens = user, rest = project
        if len(tokens) >= 2:
            user_name = " ".join(tokens[-2:]) if len(tokens) >= 3 else tokens[-1]
            project_name = " ".join(tokens[:-2]) if len(tokens) >= 3 else tokens[0]
        else:
            return {"success": False, "message": "Usage: /add-project-member <project name> <user name>", "data": {}}
        return await executor.add_project_member(project_name=project_name, user_name=user_name)

    if cmd == "log-hours":
        # /log-hours <task title> <hours>  — last token = hours
        if len(tokens) >= 2:
            try:
                hours = float(tokens[-1])
                task_title = " ".join(tokens[:-1])
            except ValueError:
                task_title = raw_arg
                hours = 1.0
        else:
            return {"success": False, "message": "Usage: /log-hours <task title> <hours>", "data": {}}
        return await executor.log_hours(task_title=task_title, hours=hours)

    if cmd == "comment-task":
        # /comment-task <task title> -- <comment>  or last N tokens after title
        parts = re.split(r"\s+--\s+", raw_arg, maxsplit=1)
        if len(parts) == 2:
            task_title, comment = parts[0].strip(), parts[1].strip()
        elif len(tokens) >= 3:
            task_title = " ".join(tokens[:2])
            comment = " ".join(tokens[2:])
        else:
            return {"success": False, "message": "Usage: /comment-task <task title> -- <your comment>", "data": {}}
        return await executor.comment_task(task_title=task_title, comment=comment)

    if cmd == "review-report":
        # /review-report <employee name> [-- comment]
        parts = re.split(r"\s+--\s+", raw_arg, maxsplit=1)
        employee_name = parts[0].strip()
        comment = parts[1].strip() if len(parts) > 1 else ""
        return await executor.review_report(employee_name=employee_name, comment=comment)

    if cmd == "mark-read":
        return await executor.mark_notifications_read()

    if cmd == "update-user":
        # /update-user <name> [--name new] [--dept dept] [--phone +1234]
        new_name_m = re.search(r"--name\s+(.*?)(?=\s+--|$)", raw_arg)
        dept_m     = re.search(r"--dept\s+(.*?)(?=\s+--|$)", raw_arg)
        phone_m    = re.search(r"--phone\s+(\S+)", raw_arg)
        name_part  = re.split(r"\s+--\w+", raw_arg)[0].strip()
        return await executor.update_user(
            user_name=name_part,
            full_name=new_name_m.group(1).strip() if new_name_m else None,
            department=dept_m.group(1).strip() if dept_m else None,
            phone=phone_m.group(1).strip() if phone_m else None,
        )

    if cmd == "change-password":
        # /change-password <old_password> <new_password>
        parts = raw_arg.split()
        if len(parts) >= 2:
            return await executor.change_password(old_password=parts[0], new_password=parts[1])
        # Also support --old and --new flags
        old_m = re.search(r"--old\s+(\S+)", raw_arg)
        new_m = re.search(r"--new\s+(\S+)", raw_arg)
        if old_m and new_m:
            return await executor.change_password(old_password=old_m.group(1), new_password=new_m.group(1))
        return {"success": False, "message": "Usage: /change-password <current_password> <new_password>", "data": {}}

    if cmd == "delete-report":
        # /delete-report [date]  — defaults to today
        return await executor.delete_report(date_str=raw_arg.strip() or None)

    if cmd == "activate-user":
        return await executor.activate_user(user_name=raw_arg)

    if cmd == "remove-project-member":
        # /remove-project-member <project name> <user name>  — last 2 tokens = user
        if len(tokens) >= 2:
            user_name = " ".join(tokens[-2:]) if len(tokens) >= 3 else tokens[-1]
            project_name = " ".join(tokens[:-2]) if len(tokens) >= 3 else tokens[0]
        else:
            return {"success": False, "message": "Usage: /remove-project-member <project name> <user name>", "data": {}}
        return await executor.remove_project_member(project_name=project_name, user_name=user_name)

    return {"success": False, "message": f"Unknown action command: {cmd}", "data": {}}


@router.get("/sessions")
async def list_my_sessions(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """List the caller's own chatbot sessions. Every user sees only their own."""
    cursor = db.chatbot_sessions.find(
        {"user_id": current_user["_id"]},
        {"session_id": 1, "updated_at": 1, "messages": {"$slice": -1}}
    ).sort("updated_at", -1).limit(20)

    sessions = []
    async for s in cursor:
        s["id"] = str(s.pop("_id"))
        s["user_id"] = str(s.get("user_id", ""))
        sessions.append(s)
    return {"sessions": sessions}


# ─────────────────────────────────────────────────────────────────────────────
#  CEO / COO monitoring endpoints  (403 for everyone else)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/monitor/users")
async def monitor_list_users(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    CEO / COO only.
    Returns every user who has at least one chatbot session,
    along with their session count and last activity time.
    """
    require_exec(current_user)

    pipeline = [
        {"$group": {
            "_id": "$user_id",
            "session_count": {"$sum": 1},
            "last_active": {"$max": "$updated_at"},
        }},
        {"$sort": {"last_active": -1}},
        {"$limit": 100},
    ]
    rows = await db.chatbot_sessions.aggregate(pipeline).to_list(100)

    users = []
    for row in rows:
        uid = row["_id"]
        # Skip the caller themselves (they see their own chat normally)
        if uid == current_user["_id"]:
            continue
        user = await db.users.find_one({"_id": uid}, {
            "full_name": 1, "department": 1, "primary_role": 1,
        })
        if not user:
            continue
        users.append({
            "user_id": str(uid),
            "full_name": user.get("full_name", "Unknown"),
            "department": user.get("department", ""),
            "role": user.get("primary_role", ""),
            "session_count": row["session_count"],
            "last_active": row["last_active"].isoformat() if row.get("last_active") else None,
        })

    return {"users": users}


@router.get("/monitor/sessions/{user_id}")
async def monitor_user_sessions(
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    CEO / COO only.
    Returns the list of chatbot sessions for a specific user.
    """
    require_exec(current_user)

    try:
        target_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    target = await db.users.find_one({"_id": target_oid}, {
        "full_name": 1, "department": 1, "primary_role": 1,
    })
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    cursor = db.chatbot_sessions.find(
        {"user_id": target_oid},
        {"session_id": 1, "updated_at": 1, "messages": {"$slice": -1}}
    ).sort("updated_at", -1).limit(30)

    sessions = []
    async for s in cursor:
        last_msg = s.get("messages", [{}])
        last_msg = last_msg[-1] if last_msg else {}
        sessions.append({
            "session_id": s["session_id"],
            "updated_at": s["updated_at"].isoformat() if s.get("updated_at") else None,
            "last_message": last_msg.get("content", "")[:120],
            "last_role": last_msg.get("role", ""),
        })

    return {
        "user": {
            "id": user_id,
            "full_name": target.get("full_name", ""),
            "department": target.get("department", ""),
            "role": target.get("primary_role", ""),
        },
        "sessions": sessions,
    }


@router.get("/monitor/messages/{session_id}")
async def monitor_session_messages(
    session_id: str,
    user_id: str,          # required query param to identify the target user
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    CEO / COO only.
    Returns the full message history of a specific chatbot session
    belonging to a specific user.
    """
    require_exec(current_user)

    try:
        target_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    session = await db.chatbot_sessions.find_one({
        "session_id": session_id,
        "user_id": target_oid,
    })
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    target = await db.users.find_one({"_id": target_oid}, {"full_name": 1, "primary_role": 1})

    messages = []
    for m in session.get("messages", []):
        messages.append({
            "role": m["role"],
            "content": m["content"],
            "timestamp": m.get("timestamp", ""),
            "command": m.get("command"),
        })

    return {
        "session_id": session_id,
        "user": {
            "id": user_id,
            "full_name": target.get("full_name", "") if target else "Unknown",
            "role": target.get("primary_role", "") if target else "",
        },
        "messages": messages,
        "total": len(messages),
    }
