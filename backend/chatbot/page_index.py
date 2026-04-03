"""
PageIndex-inspired hierarchical indexing for daily reports and project documents.
Implements reasoning-based retrieval (vectorless RAG) using Groq as the LLM.

Architecture inspired by https://github.com/VectifyAI/PageIndex
- Documents → tree-structured index (table of contents)
- Query → LLM reasons through tree to find relevant sections
- Returns relevant content without vector similarity
"""
import json
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from chatbot.groq_client import chat_completion
import logging

logger = logging.getLogger(__name__)


class ReportIndex:
    """
    Builds a hierarchical index over daily reports for a given employee or project.
    Allows the Groq LLM to navigate and retrieve relevant report sections via reasoning.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def build_index(self, user_id: str = None, project_id: str = None, days: int = 30) -> dict:
        """
        Build a tree index of reports:
        Root
        ├── Week 1 (YYYY-MM-DD to YYYY-MM-DD)
        │   ├── Monday: [employee] - tasks, blockers
        │   ├── Tuesday: ...
        └── Week 2 ...
        """
        from bson import ObjectId
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = {"report_date": {"$gte": cutoff}}
        if user_id:
            query["user_id"] = ObjectId(user_id)
        if project_id:
            query["project_id"] = ObjectId(project_id)

        cursor = self.db.daily_reports.find(query).sort("report_date", 1)
        reports = []
        async for r in cursor:
            emp = await self.db.users.find_one({"_id": r["user_id"]}, {"full_name": 1})
            structured = r.get("structured_data", {})
            reports.append({
                "date": r.get("report_date", "").strftime("%Y-%m-%d") if hasattr(r.get("report_date"), "strftime") else str(r.get("report_date", "")),
                "employee": emp["full_name"] if emp else "Unknown",
                "hours": structured.get("hours_worked", 0),
                "tasks_done": [t.get("description", "") for t in structured.get("tasks_completed", [])],
                "planned": structured.get("tasks_planned", []),
                "blockers": structured.get("blockers", []),
                "mood": r.get("mood", ""),
                "notes": r.get("unstructured_notes", "")[:300],
            })

        # Build hierarchical index
        index = self._build_tree(reports)
        return index

    def _build_tree(self, reports: list) -> dict:
        """Group reports into a weekly tree structure."""
        from collections import defaultdict
        weeks = defaultdict(list)
        for r in reports:
            try:
                dt = datetime.fromisoformat(r["date"])
                week_key = f"Week of {dt.strftime('%Y-%m-%d')} (Week {dt.isocalendar()[1]})"
            except Exception:
                week_key = "Unknown week"
            weeks[week_key].append(r)

        return {
            "index_type": "daily_reports",
            "total_reports": len(reports),
            "structure": {
                week: {
                    "report_count": len(reps),
                    "entries": [
                        {
                            "date": r["date"],
                            "employee": r["employee"],
                            "summary": f"{r['hours']}h worked, {len(r['tasks_done'])} tasks, mood: {r['mood']}, blockers: {len(r['blockers'])}",
                            "has_blockers": len(r["blockers"]) > 0,
                            "has_notes": bool(r["notes"]),
                        }
                        for r in reps
                    ],
                    "full_data": reps,
                }
                for week, reps in weeks.items()
            }
        }

    async def query_index(self, index: dict, question: str) -> str:
        """
        Use Groq to reason through the index and extract relevant content.
        This is the PageIndex-style 'reasoning-based retrieval'.
        """
        # Step 1: Ask LLM to identify relevant sections
        index_summary = {
            "total_reports": index["total_reports"],
            "weeks": {
                week: {
                    "report_count": data["report_count"],
                    "entries": data["entries"],  # Only summaries, not full data
                }
                for week, data in index["structure"].items()
            }
        }

        navigation_prompt = [
            {
                "role": "system",
                "content": "You are a document navigator. Given an index of daily reports, identify which weeks and entries are most relevant to answer the question. Return a JSON list of relevant week names.",
            },
            {
                "role": "user",
                "content": f"Question: {question}\n\nIndex:\n{json.dumps(index_summary, indent=2)}\n\nReturn JSON: {{\"relevant_weeks\": [\"week name 1\", ...]}}",
            }
        ]

        try:
            nav_response = await chat_completion(navigation_prompt, temperature=0.1, max_tokens=256)
            relevant_weeks = json.loads(nav_response).get("relevant_weeks", list(index["structure"].keys()))
        except Exception:
            relevant_weeks = list(index["structure"].keys())

        # Step 2: Extract full data from relevant sections
        relevant_data = []
        for week in relevant_weeks:
            if week in index["structure"]:
                relevant_data.extend(index["structure"][week]["full_data"])

        return json.dumps(relevant_data[:20], indent=2, default=str)
