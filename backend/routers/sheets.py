from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional, Any

from database import get_db
from middleware.auth import get_current_user
from utils.team_scope import is_exec, is_pm, is_team_lead, get_pm_project_ids, get_team_project_ids

router = APIRouter()

SHEET_TEMPLATES = {
    "project_overview": {
        "label": "Project Overview",
        "columns": [
            {"key": "person", "label": "Person", "type": "text"},
            {"key": "role", "label": "Role", "type": "text"},
            {"key": "responsibility", "label": "Responsibility", "type": "text"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "notes", "label": "Notes", "type": "text"},
        ]
    },
    "call_log": {
        "label": "Call Log",
        "columns": [
            {"key": "date", "label": "Date", "type": "date"},
            {"key": "contact", "label": "Contact", "type": "text"},
            {"key": "duration_min", "label": "Duration (min)", "type": "number"},
            {"key": "purpose", "label": "Purpose", "type": "text"},
            {"key": "outcome", "label": "Outcome", "type": "text"},
            {"key": "follow_up", "label": "Follow-up", "type": "text"},
        ]
    },
    "daily_update": {
        "label": "Daily Update",
        "columns": [
            {"key": "date", "label": "Date", "type": "date"},
            {"key": "tasks_done", "label": "Tasks Done", "type": "text"},
            {"key": "planned", "label": "Planned Tomorrow", "type": "text"},
            {"key": "blockers", "label": "Blockers", "type": "text"},
            {"key": "progress_pct", "label": "Progress %", "type": "number"},
        ]
    },
    "custom": {
        "label": "Custom Sheet",
        "columns": []
    }
}


def serialize(doc):
    if doc:
        doc["id"] = str(doc.pop("_id"))
        for k, v in list(doc.items()):
            if isinstance(v, ObjectId):
                doc[k] = str(v)
            elif isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, list):
                doc[k] = [
                    str(i) if isinstance(i, ObjectId)
                    else i.isoformat() if isinstance(i, datetime)
                    else i
                    for i in v
                ]
    return doc


class ColumnDef(BaseModel):
    key: str
    label: str
    type: str = "text"


class SheetCreate(BaseModel):
    name: str
    sheet_type: str = "custom"
    project_id: Optional[str] = None
    description: str = ""
    columns: Optional[list[ColumnDef]] = None


class SheetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_pinned: Optional[bool] = None
    columns: Optional[list[ColumnDef]] = None


class EntryCreate(BaseModel):
    data: dict[str, Any]


class EntryUpdate(BaseModel):
    data: dict[str, Any]


async def _assert_sheet_access(db, sheet, current_user):
    if is_exec(current_user):
        return
    if str(sheet.get("created_by", "")) == str(current_user["_id"]):
        return
    if is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        if sheet.get("project_id") in pm_pids:
            return
        raise HTTPException(status_code=403, detail="Access denied")
    if is_team_lead(current_user):
        tl_pids = await get_team_project_ids(db, current_user)
        if sheet.get("project_id") in tl_pids:
            return
        raise HTTPException(status_code=403, detail="Access denied")
    raise HTTPException(status_code=403, detail="Access denied")


async def _assert_sheet_owner(sheet, current_user):
    if is_exec(current_user):
        return
    if str(sheet.get("created_by", "")) == str(current_user["_id"]):
        return
    raise HTTPException(status_code=403, detail="Only the sheet creator can modify it")


@router.get("/templates")
async def get_templates():
    return SHEET_TEMPLATES


@router.get("")
async def list_sheets(
    sheet_type: Optional[str] = None,
    project_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    query: dict = {}
    if is_exec(current_user):
        pass
    elif is_pm(current_user):
        pm_pids = await get_pm_project_ids(db, current_user)
        query["$or"] = [
            {"created_by": current_user["_id"]},
            {"project_id": {"$in": pm_pids}},
        ]
    elif is_team_lead(current_user):
        tl_pids = await get_team_project_ids(db, current_user)
        query["$or"] = [
            {"created_by": current_user["_id"]},
            {"project_id": {"$in": tl_pids}},
        ]
    else:
        query["created_by"] = current_user["_id"]

    if sheet_type:
        query["sheet_type"] = sheet_type
    if project_id:
        query["project_id"] = ObjectId(project_id)

    skip = (page - 1) * limit
    cursor = db.sheets.find(query).skip(skip).limit(limit).sort([("is_pinned", -1), ("updated_at", -1)])
    sheets = [serialize(s) async for s in cursor]
    total = await db.sheets.count_documents(query)

    # Batch enrich: entry counts + creator names
    sheet_ids = [ObjectId(s["id"]) for s in sheets]
    creator_ids_raw = list({s.get("created_by") for s in sheets if s.get("created_by")})
    creator_ids = [ObjectId(c) for c in creator_ids_raw]

    creators: dict = {}
    async for u in db.users.find({"_id": {"$in": creator_ids}}, {"full_name": 1, "primary_role": 1}):
        creators[str(u["_id"])] = {"name": u["full_name"], "role": u.get("primary_role", "")}

    project_ids_raw = list({s.get("project_id") for s in sheets if s.get("project_id")})
    project_ids = [ObjectId(p) for p in project_ids_raw]
    project_names: dict = {}
    async for p in db.projects.find({"_id": {"$in": project_ids}}, {"name": 1}):
        project_names[str(p["_id"])] = p["name"]

    for s in sheets:
        s["entry_count"] = await db.sheet_entries.count_documents({"sheet_id": ObjectId(s["id"])})
        info = creators.get(s.get("created_by", ""), {})
        s["creator_name"] = info.get("name", "")
        s["creator_role"] = info.get("role", "")
        s["project_name"] = project_names.get(s.get("project_id", ""), "")

    return {"sheets": sheets, "total": total}


@router.post("", status_code=201)
async def create_sheet(
    body: SheetCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    role = current_user.get("primary_role", "")
    if role not in ("ceo", "coo", "pm", "team_lead"):
        raise HTTPException(status_code=403, detail="Only managers can create sheets")

    template = SHEET_TEMPLATES.get(body.sheet_type, SHEET_TEMPLATES["custom"])
    columns = [c.model_dump() for c in body.columns] if body.columns else template["columns"]

    now = datetime.now(timezone.utc)
    doc = {
        "name": body.name.strip(),
        "sheet_type": body.sheet_type,
        "project_id": ObjectId(body.project_id) if body.project_id else None,
        "description": body.description.strip(),
        "columns": columns,
        "created_by": current_user["_id"],
        "is_pinned": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.sheets.insert_one(doc)
    return {"sheet_id": str(result.inserted_id), "message": "Sheet created"}


@router.get("/{sheet_id}")
async def get_sheet(
    sheet_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    sheet = await db.sheets.find_one({"_id": ObjectId(sheet_id)})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await _assert_sheet_access(db, sheet, current_user)

    sheet_out = serialize(dict(sheet))

    # Fetch entries, enrich with creator name
    entries = []
    creator_ids_seen: set = set()
    raw_entries = []
    async for e in db.sheet_entries.find({"sheet_id": ObjectId(sheet_id)}).sort("created_at", 1):
        raw_entries.append(e)
        creator_ids_seen.add(e.get("created_by"))

    entry_creators: dict = {}
    if creator_ids_seen:
        async for u in db.users.find(
            {"_id": {"$in": [c for c in creator_ids_seen if c]}},
            {"full_name": 1}
        ):
            entry_creators[str(u["_id"])] = u["full_name"]

    for e in raw_entries:
        e_out = serialize(e)
        e_out["creator_name"] = entry_creators.get(e_out.get("created_by", ""), "")
        entries.append(e_out)

    sheet_out["entries"] = entries

    # Creator info
    creator = await db.users.find_one({"_id": sheet["created_by"]}, {"full_name": 1, "primary_role": 1})
    if creator:
        sheet_out["creator_name"] = creator["full_name"]
        sheet_out["creator_role"] = creator.get("primary_role", "")

    # Project name
    if sheet.get("project_id"):
        proj = await db.projects.find_one({"_id": sheet["project_id"]}, {"name": 1})
        sheet_out["project_name"] = proj["name"] if proj else ""

    return sheet_out


@router.put("/{sheet_id}")
async def update_sheet(
    sheet_id: str,
    body: SheetUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    sheet = await db.sheets.find_one({"_id": ObjectId(sheet_id)})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await _assert_sheet_owner(sheet, current_user)

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.is_pinned is not None:
        updates["is_pinned"] = body.is_pinned
    if body.columns is not None:
        updates["columns"] = [c.model_dump() for c in body.columns]

    await db.sheets.update_one({"_id": ObjectId(sheet_id)}, {"$set": updates})
    return {"message": "Sheet updated"}


@router.delete("/{sheet_id}")
async def delete_sheet(
    sheet_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    sheet = await db.sheets.find_one({"_id": ObjectId(sheet_id)})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await _assert_sheet_owner(sheet, current_user)

    await db.sheets.delete_one({"_id": ObjectId(sheet_id)})
    await db.sheet_entries.delete_many({"sheet_id": ObjectId(sheet_id)})
    return {"message": "Sheet deleted"}


@router.post("/{sheet_id}/entries", status_code=201)
async def add_entry(
    sheet_id: str,
    body: EntryCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    sheet = await db.sheets.find_one({"_id": ObjectId(sheet_id)})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await _assert_sheet_access(db, sheet, current_user)

    now = datetime.now(timezone.utc)
    doc = {
        "sheet_id": ObjectId(sheet_id),
        "data": body.data,
        "created_by": current_user["_id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.sheet_entries.insert_one(doc)
    await db.sheets.update_one({"_id": ObjectId(sheet_id)}, {"$set": {"updated_at": now}})
    return {"entry_id": str(result.inserted_id), "message": "Entry added"}


@router.put("/{sheet_id}/entries/{entry_id}")
async def update_entry(
    sheet_id: str,
    entry_id: str,
    body: EntryUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    entry = await db.sheet_entries.find_one({"_id": ObjectId(entry_id), "sheet_id": ObjectId(sheet_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if str(entry["created_by"]) != str(current_user["_id"]) and not is_exec(current_user) and not is_pm(current_user):
        raise HTTPException(status_code=403, detail="Cannot edit this entry")

    now = datetime.now(timezone.utc)
    await db.sheet_entries.update_one(
        {"_id": ObjectId(entry_id)},
        {"$set": {"data": body.data, "updated_at": now}}
    )
    await db.sheets.update_one({"_id": ObjectId(sheet_id)}, {"$set": {"updated_at": now}})
    return {"message": "Entry updated"}


@router.delete("/{sheet_id}/entries/{entry_id}")
async def delete_entry(
    sheet_id: str,
    entry_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    entry = await db.sheet_entries.find_one({"_id": ObjectId(entry_id), "sheet_id": ObjectId(sheet_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if str(entry["created_by"]) != str(current_user["_id"]) and not is_exec(current_user) and not is_pm(current_user):
        raise HTTPException(status_code=403, detail="Cannot delete this entry")

    await db.sheet_entries.delete_one({"_id": ObjectId(entry_id)})
    return {"message": "Entry deleted"}
