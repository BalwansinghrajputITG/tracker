"""
HR reports (hr.md §39).

Nine report types, CSV or Excel. Each is scoped exactly like the module it
reports on — an export is one of the easiest ways for data to leave a system, so
it must not be a wider door than the screen it came from.

Row cap: 5000. Beyond that the plan calls for async generation via the Phase 3
job runner; the cap is enforced and REPORTED rather than silently truncating,
because a report that quietly stops at 5000 rows reads as complete.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from database import get_db
from middleware.permissions import has_permission, require_permission
from routers.hr.common import aware, iso, oid, parse_date, user_map, utcnow
from routers.hr.dates import COMPANY_UTC_OFFSET_MINUTES, day_key
from services.audit_service import audit
from utils.excel_export import build_workbook, xlsx_headers
from utils.export import csv_filename, csv_headers, stream_csv
from utils.team_scope import scoped_user_filter, scoped_user_ids

router = APIRouter()

MAX_ROWS = 5000

REPORT_TYPES = {
    "employees":   "employee.read",
    "attendance":  "attendance.read",
    "leave":       "leave.read",
    "recruitment": "candidate.read",
    "documents":   "document.read",
    "performance": "performance.read",
    "tickets":     "ticket.read",
    "onboarding":  "onboarding.read",
    "departments": "department.read",
}


@router.get("/types")
async def list_report_types(
    current_user=Depends(require_permission("analytics.hr_read")),
):
    """Which reports this caller may run — the UI builds its picker from this,
    so it never offers an export that will 403."""
    return {
        "reports": [
            {"key": key, "label": key.replace("_", " ").title(), "permission": perm}
            for key, perm in REPORT_TYPES.items()
            if has_permission(current_user, perm)
        ],
        "formats": ["csv", "xlsx"],
        "max_rows": MAX_ROWS,
    }


async def _employees_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    query: dict = {}
    allowed = await scoped_user_ids(db, current_user)
    if allowed is not None:
        query["user_id"] = {"$in": allowed}
    if params.get("department_id"):
        query["department_id"] = oid(params["department_id"], "department_id")

    rows = await db.hr_employees.find(query).sort("employee_code", 1).to_list(MAX_ROWS)
    users = await user_map(db, {r["user_id"] for r in rows} | {r.get("manager_user_id") for r in rows})
    depts = {str(d["_id"]): d.get("name", "") async for d in db.departments.find({}, {"name": 1})}
    desigs = {str(d["_id"]): d.get("title", "") async for d in db.hr_designations.find({}, {"title": 1})}

    headers = ["Employee Code", "Name", "Email", "Designation", "Department", "Reports To",
               "Employment Type", "Work Mode", "Status", "Probation", "Joining Date"]
    data = [[
        r.get("employee_code", ""),
        users.get(str(r["user_id"]), {}).get("full_name", ""),
        users.get(str(r["user_id"]), {}).get("email", ""),
        desigs.get(str(r.get("designation_id")), ""),
        depts.get(str(r.get("department_id")), ""),
        users.get(str(r.get("manager_user_id")), {}).get("full_name", ""),
        r.get("employment_type", ""), r.get("work_mode", ""),
        r.get("employment_status", ""), r.get("probation_status", ""),
        aware(r.get("joining_date")).strftime("%Y-%m-%d") if r.get("joining_date") else "",
    ] for r in rows]
    return headers, data, "employees"


async def _attendance_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    scope = await scoped_user_filter(db, current_user, params.get("user_id"))
    if scope is None:
        raise HTTPException(status_code=403, detail="That employee is outside your scope.")
    if has_permission(current_user, "attendance.read_all") and not params.get("user_id"):
        scope = {}

    query = dict(scope)
    if params.get("date_from"):
        query.setdefault("date", {})["$gte"] = day_key(parse_date(params["date_from"], "date_from"))
    if params.get("date_to"):
        query.setdefault("date", {})["$lte"] = day_key(parse_date(params["date_to"], "date_to"))

    rows = await db.hr_attendance.find(query).sort("date", -1).to_list(MAX_ROWS)
    users = await user_map(db, {r["user_id"] for r in rows})

    def local(v):
        dt = aware(v)
        return (dt + timedelta(minutes=COMPANY_UTC_OFFSET_MINUTES)).strftime("%H:%M") if dt else ""

    headers = ["Date", "Employee", "Status", "Check In", "Check Out",
               "Worked (h)", "Overtime (h)", "Late (min)", "Source"]
    data = [[
        aware(r["date"]).strftime("%Y-%m-%d"),
        users.get(str(r["user_id"]), {}).get("full_name", ""),
        r.get("status", ""), local(r.get("check_in")), local(r.get("check_out")),
        round(r.get("worked_minutes", 0) / 60, 2), round(r.get("overtime_minutes", 0) / 60, 2),
        r.get("late_minutes", 0), r.get("source", ""),
    ] for r in rows]
    return headers, data, "attendance"


async def _leave_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    scope = await scoped_user_filter(db, current_user, params.get("user_id"))
    if scope is None:
        raise HTTPException(status_code=403, detail="That employee is outside your scope.")
    if has_permission(current_user, "leave.read_all") and not params.get("user_id"):
        scope = {}

    rows = await db.hr_leave_requests.find(dict(scope)).sort("start_date", -1).to_list(MAX_ROWS)
    users = await user_map(db, {r["user_id"] for r in rows} | {r.get("manager_id") for r in rows})
    types = {str(t["_id"]): t.get("name", "") async for t in db.hr_leave_types.find({}, {"name": 1})}

    headers = ["Employee", "Leave Type", "From", "To", "Days", "Status",
               "Manager", "Reason", "Requested On"]
    data = [[
        users.get(str(r["user_id"]), {}).get("full_name", ""),
        types.get(str(r.get("leave_type_id")), ""),
        aware(r["start_date"]).strftime("%Y-%m-%d") if r.get("start_date") else "",
        aware(r["end_date"]).strftime("%Y-%m-%d") if r.get("end_date") else "",
        r.get("days", 0), r.get("status", ""),
        users.get(str(r.get("manager_id")), {}).get("full_name", ""),
        r.get("reason", ""),
        aware(r["created_at"]).strftime("%Y-%m-%d") if r.get("created_at") else "",
    ] for r in rows]
    return headers, data, "leave"


async def _recruitment_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    rows = await db.hr_applications.find({}).sort("applied_at", -1).to_list(MAX_ROWS)
    candidates = {str(c["_id"]): c async for c in db.hr_candidates.find({})}
    jobs = {str(j["_id"]): j async for j in db.hr_jobs.find({})}

    headers = ["Candidate", "Email", "Job", "Stage", "Status", "Source",
               "Experience (yrs)", "Applied On", "Days in Pipeline"]
    data = []
    for r in rows:
        c = candidates.get(str(r.get("candidate_id")), {})
        applied = aware(r.get("applied_at"))
        data.append([
            c.get("full_name", ""), c.get("email", ""),
            jobs.get(str(r.get("job_id")), {}).get("title", ""),
            r.get("stage", ""), r.get("status", ""), c.get("source", ""),
            c.get("total_experience_years", 0),
            applied.strftime("%Y-%m-%d") if applied else "",
            (utcnow() - applied).days if applied else "",
        ])
    return headers, data, "recruitment"


async def _documents_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    query: dict = {"deleted_at": None, "is_current": True}
    if not has_permission(current_user, "document.read_all"):
        query["user_id"] = current_user["_id"]
        query["is_confidential"] = {"$ne": True}

    rows = await db.hr_documents.find(query).sort("created_at", -1).to_list(MAX_ROWS)
    users = await user_map(db, {r.get("user_id") for r in rows} | {r.get("uploaded_by") for r in rows})

    headers = ["Employee", "Title", "Type", "Version", "Size (KB)",
               "Expires", "Confidential", "Uploaded By", "Uploaded On"]
    data = [[
        users.get(str(r.get("user_id")), {}).get("full_name", ""),
        r.get("title", ""), r.get("doc_type", ""), r.get("version", 1),
        round(r.get("size_bytes", 0) / 1024, 1),
        aware(r["expires_at"]).strftime("%Y-%m-%d") if r.get("expires_at") else "",
        "Yes" if r.get("is_confidential") else "No",
        users.get(str(r.get("uploaded_by")), {}).get("full_name", ""),
        aware(r["created_at"]).strftime("%Y-%m-%d") if r.get("created_at") else "",
    ] for r in rows]
    return headers, data, "documents"


async def _performance_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    query: dict = {}
    if not has_permission(current_user, "performance.read_all"):
        allowed = await scoped_user_ids(db, current_user)
        if allowed is not None:
            query["user_id"] = {"$in": allowed}

    rows = await db.hr_reviews.find(query).to_list(MAX_ROWS)
    users = await user_map(db, {r["user_id"] for r in rows} | {r.get("manager_user_id") for r in rows})
    cycles = {str(c["_id"]): c.get("name", "") async for c in db.hr_review_cycles.find({}, {"name": 1})}

    headers = ["Employee", "Cycle", "Manager", "Status", "Objective Score",
               "Goal Completion %", "Composite Score", "Self", "Manager Review", "HR", "Peers"]
    data = [[
        users.get(str(r["user_id"]), {}).get("full_name", ""),
        cycles.get(str(r.get("cycle_id")), ""),
        users.get(str(r.get("manager_user_id")), {}).get("full_name", ""),
        r.get("status", ""), r.get("objective_score"), r.get("goal_completion"),
        r.get("composite_score"),
        "Yes" if (r.get("sections") or {}).get("self") else "No",
        "Yes" if (r.get("sections") or {}).get("manager") else "No",
        "Yes" if (r.get("sections") or {}).get("hr") else "No",
        len((r.get("sections") or {}).get("peer") or []),
    ] for r in rows]
    return headers, data, "performance"


async def _tickets_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    query: dict = {}
    if not has_permission(current_user, "ticket.read_all"):
        query["$or"] = [{"raised_by": current_user["_id"]},
                        {"assigned_to": current_user["_id"]}]

    rows = await db.hr_tickets.find(query).sort("created_at", -1).to_list(MAX_ROWS)
    users = await user_map(db, {r.get("raised_by") for r in rows} | {r.get("assigned_to") for r in rows})

    headers = ["Ticket", "Subject", "Raised By", "Category", "Priority", "Status",
               "Assigned To", "SLA Due", "Resolved On", "Replies"]
    data = [[
        r.get("ticket_number", ""), r.get("subject", ""),
        users.get(str(r.get("raised_by")), {}).get("full_name", ""),
        r.get("category", ""), r.get("priority", ""), r.get("status", ""),
        users.get(str(r.get("assigned_to")), {}).get("full_name", ""),
        aware(r["sla_due_at"]).strftime("%Y-%m-%d %H:%M") if r.get("sla_due_at") else "",
        aware(r["resolved_at"]).strftime("%Y-%m-%d") if r.get("resolved_at") else "",
        r.get("message_count", 0),
    ] for r in rows]
    return headers, data, "tickets"


async def _onboarding_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    query: dict = {}
    if not has_permission(current_user, "onboarding.manage"):
        query["user_id"] = current_user["_id"]

    rows = await db.hr_onboarding_tasks.find(query).sort([("user_id", 1), ("order", 1)]).to_list(MAX_ROWS)
    users = await user_map(db, {r.get("user_id") for r in rows} | {r.get("owner_user_id") for r in rows})

    headers = ["Employee", "Task", "Category", "Owner Role", "Owner",
               "Due", "Status", "Completed On"]
    data = [[
        users.get(str(r.get("user_id")), {}).get("full_name", ""),
        r.get("title", ""), r.get("category", ""), r.get("owner_role", ""),
        users.get(str(r.get("owner_user_id")), {}).get("full_name", ""),
        aware(r["due_date"]).strftime("%Y-%m-%d") if r.get("due_date") else "",
        r.get("status", ""),
        aware(r["completed_at"]).strftime("%Y-%m-%d") if r.get("completed_at") else "",
    ] for r in rows]
    return headers, data, "onboarding"


async def _departments_report(db, current_user, params) -> tuple[list[str], list[list], str]:
    depts = await db.departments.find({}).sort("name", 1).to_list(200)
    counts = {
        str(r["_id"]): r["count"]
        async for r in db.hr_employees.aggregate([
            {"$match": {"employment_status": {"$in": ["active", "probation"]}}},
            {"$group": {"_id": "$department_id", "count": {"$sum": 1}}},
        ])
    }
    users = await user_map(db, {d.get("head_user_id") for d in depts})

    headers = ["Department", "Head", "Headcount", "Cost Center", "Description"]
    data = [[
        d.get("name", ""),
        users.get(str(d.get("head_user_id")), {}).get("full_name", ""),
        counts.get(str(d["_id"]), 0),
        d.get("cost_center", ""), d.get("description", ""),
    ] for d in depts]
    return headers, data, "departments"


BUILDERS = {
    "employees":   _employees_report,
    "attendance":  _attendance_report,
    "leave":       _leave_report,
    "recruitment": _recruitment_report,
    "documents":   _documents_report,
    "performance": _performance_report,
    "tickets":     _tickets_report,
    "onboarding":  _onboarding_report,
    "departments": _departments_report,
}


@router.get("/{report_type}")
async def run_report(
    report_type: str,
    request: Request,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    user_id: str | None = Query(None),
    department_id: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user=Depends(require_permission("analytics.hr_read")),
    db=Depends(get_db),
):
    """Run one of the §39 reports as CSV or Excel."""
    if report_type not in BUILDERS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown report. Available: {', '.join(sorted(BUILDERS))}",
        )

    # The report's own permission still applies on top of analytics.hr_read —
    # being allowed to see the dashboard is not being allowed to export payroll.
    required = REPORT_TYPES[report_type]
    if not has_permission(current_user, required):
        raise HTTPException(status_code=403, detail=f"Requires permission: {required}")

    params = {"user_id": user_id, "department_id": department_id,
              "date_from": date_from, "date_to": date_to}
    headers, rows, name = await BUILDERS[report_type](db, current_user, params)

    truncated = len(rows) >= MAX_ROWS
    await audit(
        db, "report.exported", current_user, f"{report_type}_export", None,
        request=request,
        meta={"format": format, "row_count": len(rows), "truncated": truncated,
              "filters": {k: v for k, v in params.items() if v}},
    )

    if format == "xlsx":
        content = build_workbook([(name.title(), headers, rows)])
        filename = f"{name}-{utcnow().strftime('%Y-%m-%d')}.xlsx"
        return Response(content=content, headers=xlsx_headers(filename))

    async def row_iter():
        for row in rows:
            yield row

    filename = csv_filename(name)
    return StreamingResponse(
        stream_csv(headers, row_iter()),
        media_type="text/csv",
        headers={**csv_headers(filename),
                 # Surfaced rather than silent: a report that stops at the cap
                 # without saying so reads as complete.
                 "X-Row-Count": str(len(rows)),
                 "X-Truncated": "true" if truncated else "false"},
    )
