import re
from dataclasses import dataclass
from typing import Optional
from difflib import get_close_matches


# ─── Fuzzy typo correction for slash commands ─────────────────────────────────

_ALL_COMMANDS = [
    "/project", "/projects", "/tasks", "/task", "/team", "/teams",
    "/employee", "/employees", "/delayed", "/blockers", "/reports",
    "/stats", "/analytics", "/dashboard", "/notifications", "/help",
    "/missing-reports", "/commits", "/contributor-stats", "/message",
    "/create-project", "/edit-project", "/cancel-project", "/update-progress",
    "/add-project-member", "/remove-project-member",
    "/create-task", "/update-task", "/edit-task", "/assign-task",
    "/mark-blocked", "/mark-unblocked", "/log-hours", "/comment-task",
    "/create-team", "/edit-team", "/delete-team", "/add-member", "/remove-member",
    "/create-user", "/update-user", "/delete-user", "/activate-user",
    "/submit-report", "/review-report", "/delete-report",
    "/change-password", "/mark-read",
]


def _fuzzy_correct_command(text: str) -> Optional[str]:
    """
    If the text starts with '/' but doesn't match any known command exactly,
    try to find a close match (handles typos like '/projcts', '/tassk').
    Returns corrected text or None.
    """
    text = text.strip()
    if not text.startswith("/"):
        return None
    # Extract the command word (everything up to first space)
    parts = text.split(" ", 1)
    cmd_word = parts[0].lower()
    rest = (" " + parts[1]) if len(parts) > 1 else ""

    if cmd_word in _ALL_COMMANDS:
        return None  # no correction needed

    matches = get_close_matches(cmd_word, _ALL_COMMANDS, n=1, cutoff=0.75)
    if matches:
        corrected = matches[0] + rest
        return corrected
    return None


@dataclass
class ParsedCommand:
    command: str
    args: list[str]
    raw: str


COMMAND_PATTERNS = {
    # ── Read-only commands ────────────────────────────────────────────────────
    "reports":   r"^/reports?\s*(.*)",
    "project":   r"^/projects?\s*(.*)",
    "delayed":   r"^/delayed",
    "team":      r"^/teams?\s*(.*)",
    "employees": r"^/employees?\s*$",          # list all employees (no arg)
    "employee":  r"^/employees?\s+(\S.*)",     # single employee by name
    "message":   r"^/message\s+(\S+)\s+(.*)",
    "stats":     r"^/stats?\s*(.*)",
    "blockers":  r"^/blockers?",
    "tasks":     r"^/tasks?\s*(.*)",
    "help":      r"^/help",

    # ── Action commands (write operations) ────────────────────────────────────
    "create-team":     r"^/create-team\s+(.*)",
    "add-member":      r"^/add-member\s+(\S.*?)\s+to\s+(.*)|^/add-member\s+(.*)",
    "remove-member":   r"^/remove-member\s+(.*)",
    "create-project":  r"^/create-project\s+(.*)",
    "create-task":     r"^/create-task\s+(.*)",
    "update-task":     r"^/update-task\s+(.*)",
    "update-progress": r"^/update-progress\s+(.*)",
    "assign-task":     r"^/assign-task\s+(.*)",
    "create-user":     r"^/create-user\s+(.*)",
    "mark-blocked":    r"^/mark-blocked\s+(.*)",
    "mark-unblocked":  r"^/mark-unblocked\s+(.*)",
    "delete-user":     r"^/delete-user\s+(.*)",

    # Reads
    "dashboard":              r"^/dashboard",
    "notifications":          r"^/notifications?\s*(.*)",
    "commits":                r"^/commits?\s+(.*)",
    "missing-reports":        r"^/missing-reports?\s*(.*)",
    "analytics":              r"^/analytics?\s*(.*)",
    "contributor-stats":      r"^/contributor-stats?\s*(.*)",

    # Actions
    "submit-report":          r"^/submit-report\s*(.*)",
    "edit-project":           r"^/edit-project\s+(.*)",
    "cancel-project":         r"^/cancel-project\s+(.*)",
    "edit-team":              r"^/edit-team\s+(.*)",
    "delete-team":            r"^/delete-team\s+(.*)",
    "edit-task":              r"^/edit-task\s+(.*)",
    "add-project-member":     r"^/add-project-member\s+(.*)",
    "remove-project-member":  r"^/remove-project-member\s+(.*)",
    "log-hours":              r"^/log-hours\s+(.*)",
    "comment-task":           r"^/comment-task\s+(.*)",
    "review-report":          r"^/review-report\s+(.*)",
    "mark-read":              r"^/mark-read",
    "update-user":            r"^/update-user\s+(.*)",
    "change-password":        r"^/change-password\s*(.*)",
    "delete-report":          r"^/delete-report\s*(.*)",
    "activate-user":          r"^/activate-user\s+(.*)",
}


def parse_command(text: str) -> Optional[ParsedCommand]:
    text = text.strip()
    if not text.startswith("/"):
        return None

    for cmd, pattern in COMMAND_PATTERNS.items():
        match = re.match(pattern, text, re.IGNORECASE)
        if match:
            args = [g.strip() for g in match.groups() if g]
            return ParsedCommand(command=cmd, args=args, raw=text)

    # Fuzzy typo correction — try to match if user typed a close variant
    corrected = _fuzzy_correct_command(text)
    if corrected and corrected != text:
        for cmd, pattern in COMMAND_PATTERNS.items():
            match = re.match(pattern, corrected, re.IGNORECASE)
            if match:
                args = [g.strip() for g in match.groups() if g]
                return ParsedCommand(command=cmd, args=args, raw=text)

    return None


# ─── keyword groups used by the NLP matcher ────────────────────────────────

_EMPLOYEE_LIST_KW = [
    "all employee", "employee list", "list of employee", "show employee",
    "all staff", "staff list", "list of staff", "show staff",
    "all user", "user list", "list of user", "show all user",
    "who are the employee", "who are employee", "how many employee",
    "give me employee", "get employee", "fetch employee",
    "employees in company", "company employee", "all member",
    "team member list", "list member", "show member",
    "all people", "people in company", "who work", "who works here",
    "show people", "list people",
    # Additional natural phrasings
    "show me the team", "who is on the team", "who's on the team",
    "company members", "everyone in the company", "list all people",
    "workforce", "headcount", "all workers", "show workers",
    "all colleagues", "colleagues list", "show colleagues",
    "company staff", "all personnel", "personnel list",
]

_PROJECT_KW = [
    "all project", "project list", "list of project", "show project",
    "give me project", "get project", "fetch project",
    "project status", "project progress", "project detail",
    "active project", "ongoing project", "running project",
    "my project", "which project", "what project",
    "how many project",
    # Additional
    "show me project", "list project", "view project",
    "current project", "open project", "in-progress project",
    "what are the project", "what projects", "projects we have",
    "all our project", "company project", "project overview",
    "projects overview", "projects summary", "all initiative",
]

_TASK_KW = [
    "all task", "task list", "list of task", "show task",
    "give me task", "get task", "fetch task",
    "my task", "open task", "pending task", "task status",
    "task in review", "task in progress", "tasks in progress",
    "unfinished task", "incomplete task", "what task",
    "which task", "how many task", "todo",
    # Additional
    "show me task", "list task", "view task",
    "assigned task", "current task", "active task",
    "what are my task", "what tasks", "tasks for me",
    "my to-do", "my todo", "things to do", "work items",
    "backlog", "task board", "kanban", "work queue",
]

_TEAM_KW = [
    "all team", "team list", "list of team", "show team",
    "give me team", "get team", "fetch team",
    "team detail", "team info", "team member",
    "which team", "what team", "how many team",
    # Additional
    "show me team", "list team", "view team",
    "our team", "company team", "team overview",
    "department team", "all departments", "team structure",
    "what teams", "teams we have",
]

_DELAYED_KW = [
    "delayed", "behind schedule", "late project", "overdue",
    "not on track", "behind on", "which project is late",
    "projects delayed", "delay", "past due",
    # Additional
    "falling behind", "running late", "slipping", "at risk",
    "off track", "deadline missed", "behind deadline",
    "late deliverable", "delinquent", "pending overdue",
    "which projects are late", "show late project",
    "overdue project", "delayed work", "problem project",
]

_REPORT_KW = [
    "all report", "daily report", "report list", "show report",
    "submitted report", "who submitted", "report from",
    "missing report", "report compliance", "who reported",
    "didn't submit", "did not submit", "report status",
    "give me report", "get report", "fetch report",
    # Additional
    "show me report", "view report", "list report",
    "work report", "activity report", "progress report",
    "daily update", "daily log", "daily entry",
    "who has submitted", "report compliance rate",
    "eod report", "end of day report", "standup report",
    "team report", "submission status",
]

_BLOCKER_KW = [
    "blocker", "blocked task", "stuck task", "impediment",
    "what is blocked", "blocking", "all blocker",
    "show blocker", "list blocker", "which task is blocked",
    # Additional
    "blocking issue", "blocked item", "stuck item",
    "impediments", "obstacles", "show obstacles",
    "what's blocked", "whats blocked", "show blocked",
    "list blocked", "blocked work", "stopped task",
    "things blocking", "dependencies blocking",
]

_STATS_KW = [
    "company stats", "overall stats", "productivity",
    "performance overview", "how many project", "total project",
    "total employee", "company overview", "kpi", "metrics",
    "statistics", "report compliance rate", "company summary",
    "overview", "summary",
    # Additional
    "quick stats", "company metric", "health score",
    "overall performance", "how is company", "how are we doing",
    "productivity score", "completion rate", "efficiency",
    "company health", "org stats", "organization stats",
    "high level", "bird's eye", "birds eye view",
]

# ── Action keyword groups ──────────────────────────────────────────────────────

_CREATE_TEAM_KW = [
    "create team", "make team", "new team", "add team", "form team",
    "build team", "set up team", "create a team", "make a team",
    # Additional
    "start a team", "establish team", "launch team", "organize team",
    "put together team", "assemble team", "setup team", "initiate team",
]

_ADD_MEMBER_KW = [
    "add member", "add to team", "add user to", "put in team",
    "include in team", "assign to team", "join team", "add employee to",
    "add someone to", "add person to",
    # Additional
    "onboard to team", "bring into team", "include in the team",
    "add them to", "add him to", "add her to", "put them in",
    "move to team", "transfer to team", "assign member",
]

# Regex: "add <person> to [team] <team_name>"
_ADD_MEMBER_RE = re.compile(
    r"add\s+([a-zA-Z ]+?)\s+to\s+(?:the\s+)?(?:team\s+)?([a-zA-Z0-9 ]+?)(?:\s+team)?$",
    re.IGNORECASE,
)

_REMOVE_MEMBER_KW = [
    "remove member", "remove from team", "kick from team",
    "delete from team", "take out of team",
]

_CREATE_PROJECT_KW = [
    "create project", "new project", "make project", "add project",
    "start project", "launch project", "create a project", "new project called",
]

_CREATE_TASK_KW = [
    "create task", "new task", "add task", "make task",
    "create a task", "add a task",
]

_UPDATE_TASK_KW = [
    "mark task", "update task", "change task status", "set task",
    "move task", "complete task", "finish task", "mark as done",
    "mark as complete", "set status", "task is done", "task completed",
]

_UPDATE_PROGRESS_KW = [
    "update progress", "set progress", "change progress", "progress to",
    "percent complete", "% complete", "percent done", "update percentage",
    "set project", "set the project",
]

_ASSIGN_TASK_KW = [
    "assign task", "give task", "assign to", "task to user", "task for user",
]

_CREATE_USER_KW = [
    "create user", "add user", "new user", "register user", "invite user",
    "create account", "add employee", "new employee", "create employee", "onboard",
]

_MARK_BLOCKED_KW = [
    "mark blocked", "block task", "task is blocked", "mark as blocked", "set blocked",
    "mark it as blocked",
]

_MARK_UNBLOCKED_KW = [
    "unblock task", "mark unblocked", "remove block", "task unblocked", "resolve block",
    "unblock", "unblocked",
]

_DELETE_USER_KW = [
    "delete user", "remove user", "deactivate user", "disable user",
    "delete employee", "remove employee", "deactivate employee",
    "fire user", "terminate user", "offboard user",
    "delete account", "remove account", "deactivate account",
    "delete the user", "remove the user",
]

_SUBMIT_REPORT_KW = [
    "submit report", "submit my report", "add report", "file report",
    "daily report", "report today", "log report", "my report for today",
    "submit daily", "send report",
]

_EDIT_PROJECT_KW = [
    "edit project", "update project", "change project status",
    "set project status", "set project priority", "update project status",
    "change project priority", "modify project",
]

_CANCEL_PROJECT_KW = [
    "cancel project", "delete project", "close project",
    "end project", "terminate project", "archive project",
]

_EDIT_TEAM_KW = [
    "edit team", "update team", "change team", "rename team",
    "modify team", "update team name", "change team lead",
    "update team lead", "change team department",
]

_DELETE_TEAM_KW = [
    "delete team", "remove team", "disband team", "close team", "archive team",
]

_EDIT_TASK_KW = [
    "edit task", "change task priority", "update task priority",
    "rename task", "change task name", "modify task", "update task details",
    "change task due date", "set task priority",
]

_ADD_PROJECT_MEMBER_KW = [
    "add member to project", "add to project", "add user to project",
    "include in project", "assign user to project", "add employee to project",
]

_LOG_HOURS_KW = [
    "log hours", "log time", "record hours", "track hours",
    "spent hours on", "worked on task", "hours on task", "time on task",
    "log my hours",
]

_COMMENT_TASK_KW = [
    "comment on task", "add comment", "comment task",
    "add note to task", "leave comment", "write comment on",
]

_REVIEW_REPORT_KW = [
    "review report", "approve report", "mark report reviewed",
    "check report", "review daily report", "mark reviewed",
]

_MARK_READ_KW = [
    "mark all read", "mark notifications read", "clear notifications",
    "dismiss notifications", "read all notifications", "mark read",
]

_UPDATE_USER_KW = [
    "update user", "edit user", "change user", "modify user",
    "update employee", "change department of", "update profile",
]

_DASHBOARD_KW = [
    "dashboard", "my dashboard", "show dashboard", "home",
    "overview", "my overview", "what is my status",
]

_NOTIFICATIONS_KW = [
    "notification", "my notification", "show notification",
    "unread notification", "any notification", "check notification",
]

_COMMITS_KW = [
    "commits", "git commits", "show commits", "project commits",
    "commit history", "git history", "recent commits", "how many commits",
]

_MISSING_REPORTS_KW = [
    "missing report", "who hasn't reported", "who didn't report",
    "missing daily report", "not submitted", "didn't submit report",
    "who has not submitted", "report compliance",
]

_ANALYTICS_KW = [
    "analytics", "company analytics", "full analytics", "detailed analytics",
    "show analytics", "company performance", "performance report",
    "project health", "kpi report", "company kpi", "company metrics",
    "detailed stats", "all metrics", "full stats", "company report",
    "how is company doing", "company overview report",
    # Additional
    "detailed report", "full performance", "department analytics",
    "task analytics", "report analytics", "deep dive",
    "comprehensive stats", "complete overview", "advanced metrics",
    "business intelligence", "bi report", "performance data",
    "show full analytics", "give me analytics", "fetch analytics",
    "show me all the data", "complete analysis",
]

_CONTRIBUTOR_STATS_KW = [
    "contributor stats", "contributor activity", "contribution stats",
    "who contributed", "how many commits per person", "commits by person",
    "commits per employee", "developer activity", "code contribution",
    "contributor report", "lines of code per person", "github stats",
    "gitlab stats", "repo contributor", "who pushed", "who wrote code",
]

_CHANGE_PASSWORD_KW = [
    "change password", "update password", "reset password",
    "change my password", "new password", "set password",
]

_DELETE_REPORT_KW = [
    "delete report", "remove report", "delete my report",
    "delete today report", "remove today report",
]

_ACTIVATE_USER_KW = [
    "activate user", "reactivate user", "enable user", "restore user",
    "activate account", "reactivate account", "enable account",
    "un-deactivate", "restore account", "bring back user",
]

_REMOVE_PROJECT_MEMBER_KW = [
    "remove from project", "remove user from project", "kick from project",
    "remove member from project", "delete from project",
]

_SINGLE_EMPLOYEE_RE = re.compile(
    r"(?:show|get|find|fetch|tell me about|details of|info of|profile of|who is)\s+([a-zA-Z]+(?: [a-zA-Z]+)?)",
    re.IGNORECASE,
)

_SINGLE_PROJECT_RE = re.compile(
    r"(?:show|get|find|fetch|tell me about|status of|progress of|details of)\s+(?:project\s+)?(?!all\b|list\b|every\b)([a-zA-Z0-9][\w ]+?)(?:\s+project)?$",
    re.IGNORECASE,
)

_SINGLE_TEAM_RE = re.compile(
    r"(?:show|get|find|fetch|tell me about|details of|info of)\s+(?:team\s+)?(?!all\b|list\b|every\b|me\b|the\b)([a-zA-Z0-9][\w ]+?)(?:\s+team)?$",
    re.IGNORECASE,
)

_MESSAGE_RE = re.compile(
    r"(?:message|send message to|notify|ping|tell|inform)\s+([a-zA-Z]+(?:\s[a-zA-Z]+)?)\s+(?:about|that|regarding|:|to say|saying)?\s*(.+)",
    re.IGNORECASE,
)


def _match_any(text: str, keywords: list[str]) -> bool:
    return any(k in text for k in keywords)


def extract_intent_from_natural_language(text: str) -> Optional[str]:
    """
    Map conversational human language to slash commands.
    Action commands are checked first (before read-only commands).
    """
    t = text.lower().strip()

    # ── Actions (checked first) ────────────────────────────────────────────────

    if _match_any(t, _CREATE_TEAM_KW):
        name_m = re.search(r"(?:called|named|name[d]?|:)\s+(['\"]?[\w\s]+['\"]?)", text, re.I)
        name = name_m.group(1).strip().strip("'\"") if name_m else "New Team"

        lead_m = re.search(r"(?:led by|lead(?:er)?\s*:)\s*([a-zA-Z]+(?: [a-zA-Z]+)?)", text, re.I)
        lead_part = f" --lead {lead_m.group(1).strip()}" if lead_m else ""

        pm_m = re.search(r"(?:managed by|pm\s*:)\s*([a-zA-Z]+(?: [a-zA-Z]+)?)", text, re.I)
        pm_part = f" --pm {pm_m.group(1).strip()}" if pm_m else ""

        members_m = re.search(r"members?\s*:?\s*([a-zA-Z][^.]+?)(?:\s*\.|\s*$)", text, re.I)
        if members_m:
            raw_mems = re.split(r"\s+(?:led|managed|with\s+lead)", members_m.group(1), flags=re.I)[0].strip()
            mems = [m.strip() for m in re.split(r",|\s+and\s+", raw_mems) if m.strip()]
            members_part = f" --members {', '.join(mems)}" if mems else ""
        else:
            members_part = ""

        return f"/create-team {name}{lead_part}{pm_part}{members_part}"

    # "add <person> to [the] [team] <team_name>" — use regex directly (keyword has gap words)
    _am = _ADD_MEMBER_RE.search(text)
    if _am or _match_any(t, _ADD_MEMBER_KW):
        if _am:
            return f"/add-member {_am.group(2).strip()} {_am.group(1).strip()}"
        return "/add-member"

    # "remove <person> from [the] [team] <team_name>"
    _rm = re.search(
        r"remove\s+([a-zA-Z ]+?)\s+from\s+(?:the\s+)?(?:team\s+)?([a-zA-Z0-9][\w ]+?)(?:\s+team)?$",
        text, re.I
    )
    if _rm or _match_any(t, _REMOVE_MEMBER_KW):
        if _rm:
            return f"/remove-member {_rm.group(2).strip()} {_rm.group(1).strip()}"
        return "/remove-member"

    if _match_any(t, _CREATE_PROJECT_KW):
        m = re.search(r"(?:called|named|:)\s+(['\"]?[\w\s]+['\"]?)", text, re.I)
        name = m.group(1).strip().strip("'\"") if m else "New Project"
        return f"/create-project {name}"

    if _match_any(t, _CREATE_TASK_KW):
        m = re.search(r"(?:called|named|:)\s+(['\"]?[\w\s]+['\"]?)", text, re.I)
        name = m.group(1).strip().strip("'\"") if m else "New Task"
        return f"/create-task {name}"

    if _match_any(t, _UPDATE_TASK_KW):
        status_words = {
            "done": "done", "complete": "done", "completed": "done",
            "finish": "done", "finished": "done",
            "in progress": "in_progress", "in_progress": "in_progress",
            "review": "review", "todo": "todo",
        }
        found_status = next((v for k, v in status_words.items() if k in t), None)
        # "blocked" in update-task context → route to mark-blocked instead
        if "blocked" in t:
            m = re.search(
                r"(?:mark|update|set|move|change)\s+(?:task\s+)?['\"]?([\w][\w\s]*?)['\"]?\s+(?:as|to|status\s+to)",
                text, re.I
            )
            task_name = m.group(1).strip() if m else ""
            return f"/mark-blocked {task_name}" if task_name else None
        m = re.search(
            r"(?:mark|update|set|move|change|complete|finish)\s+(?:task\s+)?['\"]?([\w][\w\s]*?)['\"]?\s+(?:as|to|status\s+to)",
            text, re.I
        )
        task_name = m.group(1).strip() if m else ""
        if task_name and found_status:
            return f"/update-task {task_name} {found_status}"
        return None

    if _match_any(t, _UPDATE_PROGRESS_KW):
        m_pct = re.search(r"(\d+)\s*%?(?:\s+percent)?", text, re.I)
        # Broader project name capture: after "project" keyword or "of/for"
        m_proj = re.search(
            r"(?:project\s+|of\s+|for\s+)([a-zA-Z0-9][\w\s]*?)(?:\s+to\s+|\s+progress|\s+at\s+|\s*$)",
            text, re.I
        )
        if m_pct and m_proj:
            return f"/update-progress {m_proj.group(1).strip()} {m_pct.group(1)}"
        # Fallback: "set X to N%"
        m2 = re.search(r"set\s+([a-zA-Z0-9][\w\s]+?)\s+to\s+(\d+)\s*%", text, re.I)
        if m2:
            return f"/update-progress {m2.group(1).strip()} {m2.group(2)}"
        return None

    if _match_any(t, _ASSIGN_TASK_KW):
        m = re.search(
            r"assign\s+(?:task\s+)?(['\"]?[\w\s]+?['\"]?)\s+to\s+([a-zA-Z ]+)$",
            text, re.I
        )
        if m:
            return f"/assign-task {m.group(1).strip().strip(chr(39)+chr(34))} {m.group(2).strip()}"
        return None

    if _match_any(t, _CREATE_USER_KW):
        return "/create-user"  # let LLM guide the conversation

    # Unblocked MUST be checked before blocked (otherwise "unblock" matches "block")
    if _match_any(t, _MARK_UNBLOCKED_KW):
        m = re.search(r"(?:unblock)\s+(?:task\s+)?(['\"]?[\w\s]+['\"]?)", text, re.I)
        name = m.group(1).strip().strip("'\"") if m else ""
        return f"/mark-unblocked {name}" if name else None

    if _match_any(t, _MARK_BLOCKED_KW):
        m = re.search(r"(?:block|blocked)\s+(?:task\s+)?(['\"]?[\w\s]+['\"]?)", text, re.I)
        name = m.group(1).strip().strip("'\"") if m else ""
        return f"/mark-blocked {name}" if name else None

    if _match_any(t, _DELETE_USER_KW):
        m = re.search(
            r"(?:delete|remove|deactivate|disable|fire|terminate|offboard)\s+(?:user\s+|employee\s+|account\s+)?([a-zA-Z][\w ]+?)(?:\s+user|\s+account|\s+employee)?$",
            text, re.I
        )
        name = m.group(1).strip() if m else ""
        return f"/delete-user {name}" if name else "/delete-user"

    if _match_any(t, _SUBMIT_REPORT_KW):
        return "/submit-report"

    if _match_any(t, _CANCEL_PROJECT_KW):
        m = re.search(r"(?:cancel|delete|close|end|terminate|archive)\s+(?:the\s+)?(?:project\s+)?([a-zA-Z0-9][\w\s]+?)(?:\s+project)?$", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/cancel-project {name}" if name else "/cancel-project"

    if _match_any(t, _EDIT_PROJECT_KW):
        m = re.search(r"(?:edit|update|change|set|modify)\s+(?:the\s+)?(?:project\s+)?([a-zA-Z0-9][\w\s]+?)(?:\s+project)?(?:\s+status|\s+priority)?", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/edit-project {name}" if name else "/edit-project"

    if _match_any(t, _DELETE_TEAM_KW):
        m = re.search(r"(?:delete|remove|disband|close|archive)\s+(?:the\s+)?(?:team\s+)?([a-zA-Z0-9][\w\s]+?)(?:\s+team)?$", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/delete-team {name}" if name else "/delete-team"

    if _match_any(t, _EDIT_TEAM_KW):
        m = re.search(r"(?:edit|update|change|rename|modify)\s+(?:the\s+)?(?:team\s+)?([a-zA-Z0-9][\w\s]+?)(?:\s+team)?", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/edit-team {name}" if name else "/edit-team"

    if _match_any(t, _REMOVE_PROJECT_MEMBER_KW):
        return "/remove-project-member"

    if _match_any(t, _ADD_PROJECT_MEMBER_KW):
        return "/add-project-member"

    if _match_any(t, _EDIT_TASK_KW):
        m = re.search(r"(?:edit|change|rename|modify|update)\s+(?:task\s+)?(['\"]?[\w\s]+?['\"]?)(?:\s+priority|\s+name|\s+due|\s+title)?$", text, re.I)
        name = m.group(1).strip().strip("'\"") if m else ""
        return f"/edit-task {name}" if name else "/edit-task"

    if _match_any(t, _LOG_HOURS_KW):
        m_h = re.search(r"(\d+(?:\.\d+)?)\s*h(?:ours?)?", text, re.I)
        m_t = re.search(r"(?:on|for|task)\s+(['\"]?[\w\s]+['\"]?)$", text, re.I)
        if m_h and m_t:
            return f"/log-hours {m_t.group(1).strip().strip(chr(39)+chr(34))} {m_h.group(1)}"
        return "/log-hours"

    if _match_any(t, _COMMENT_TASK_KW):
        return "/comment-task"

    if _match_any(t, _REVIEW_REPORT_KW):
        m = re.search(r"(?:review|approve)\s+(?:report\s+(?:by|of|from)\s+|report\s+for\s+)?([a-zA-Z]+(?: [a-zA-Z]+)?)", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/review-report {name}" if name else "/review-report"

    if _match_any(t, _MARK_READ_KW):
        return "/mark-read"

    if _match_any(t, _UPDATE_USER_KW):
        m = re.search(r"(?:update|edit|change|modify)\s+(?:user\s+|employee\s+)?([a-zA-Z]+(?: [a-zA-Z]+)?)", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/update-user {name}" if name else "/update-user"

    if _match_any(t, _CHANGE_PASSWORD_KW):
        return "/change-password"

    if _match_any(t, _DELETE_REPORT_KW):
        return "/delete-report"

    if _match_any(t, _ACTIVATE_USER_KW):
        m = re.search(r"(?:activate|reactivate|enable|restore)\s+(?:user\s+|account\s+)?([a-zA-Z]+(?: [a-zA-Z]+)?)", text, re.I)
        name = m.group(1).strip() if m else ""
        return f"/activate-user {name}" if name else "/activate-user"

    # ── Read-only commands ─────────────────────────────────────────────────────

    if _match_any(t, _DELAYED_KW):
        return "/delayed"

    if _match_any(t, _BLOCKER_KW):
        return "/blockers"

    if _match_any(t, _STATS_KW):
        return "/stats"

    if _match_any(t, _REPORT_KW):
        return "/reports"

    if _match_any(t, _EMPLOYEE_LIST_KW):
        return "/employees"

    if _match_any(t, _TASK_KW):
        return "/tasks"

    if _match_any(t, _TEAM_KW):
        m = _SINGLE_TEAM_RE.search(text)
        if m:
            return f"/team {m.group(1).strip()}"
        return "/team"

    if _match_any(t, _PROJECT_KW):
        m = _SINGLE_PROJECT_RE.search(text)
        if m:
            return f"/project {m.group(1).strip()}"
        return "/project"

    if any(k in t for k in ["employee", "staff", "worker", "colleague"]):
        m = _SINGLE_EMPLOYEE_RE.search(text)
        if m:
            return f"/employee {m.group(1).strip()}"

    if any(k in t for k in ["message", "send message", "notify", "ping", "tell", "inform"]):
        m = _MESSAGE_RE.search(text)
        if m:
            name = m.group(1).strip()
            msg = m.group(2).strip() or "Hi"
            return f"/message {name} {msg}"

    if _match_any(t, _DASHBOARD_KW):
        return "/dashboard"

    if _match_any(t, _NOTIFICATIONS_KW):
        return "/notifications"

    if _match_any(t, _COMMITS_KW):
        m = _SINGLE_PROJECT_RE.search(text)
        if m:
            return f"/commits {m.group(1).strip()}"
        return "/commits"

    if _match_any(t, _MISSING_REPORTS_KW):
        return "/missing-reports"

    if _match_any(t, _ANALYTICS_KW):
        return "/analytics"

    if _match_any(t, _CONTRIBUTOR_STATS_KW):
        m = _SINGLE_PROJECT_RE.search(text)
        if m:
            return f"/contributor-stats {m.group(1).strip()}"
        return "/contributor-stats"

    return None
