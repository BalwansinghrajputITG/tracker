"""
Project Tool Integration — credential storage + live data fetching.

Collections used:
  project_tool_credentials  { project_id, tool_id, credentials:{...}, updated_at }

Supported live integrations:
  github      — commits, contributors (via existing repo utilities)
  figma       — file metadata, pages, last-modified
  semrush     — domain ranks, organic/paid traffic
  jira        — open issues, sprints
  notion      — workspace/database page count
  linear      — issue counts by status
  default     — credentials stored; data fetch not yet available
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
import httpx

from database import get_db
from middleware.auth import get_current_user
from utils.repo import parse_repo_url, fetch_commits, fetch_contributor_stats
from utils.team_scope import is_exec, is_pm, is_team_lead
from utils.token_encrypt import decrypt_token

router = APIRouter()

# ─── Tool credential field definitions ───────────────────────────────────────

TOOL_FIELD_DEFS: dict[str, list[dict]] = {
    "github": [
        {"key": "repo_url",      "label": "Repository URL",           "type": "url",      "placeholder": "https://github.com/org/repo"},
        {"key": "access_token",  "label": "Personal Access Token",    "type": "secret",   "help": "Needs repo scope"},
    ],
    "figma": [
        {"key": "access_token",  "label": "Personal Access Token",    "type": "secret"},
        {"key": "file_key",      "label": "File Key",                 "type": "text",     "help": "figma.com/file/{FILE_KEY}/..."},
    ],
    "google_analytics": [
        {"key": "property_id",           "label": "GA4 Property ID",            "type": "text",     "placeholder": "G-XXXXXXXXXX"},
        {"key": "service_account_json",  "label": "Service Account JSON (Base64)", "type": "textarea", "help": "Encode your service-account.json file as Base64"},
    ],
    "search_console": [
        {"key": "site_url",              "label": "Site URL",                   "type": "url",      "placeholder": "https://example.com"},
        {"key": "service_account_json",  "label": "Service Account JSON (Base64)", "type": "textarea"},
    ],
    "google_ads": [
        {"key": "customer_id",     "label": "Customer ID",       "type": "text",   "placeholder": "123-456-7890"},
        {"key": "developer_token", "label": "Developer Token",   "type": "secret"},
        {"key": "refresh_token",   "label": "OAuth Refresh Token","type": "secret"},
        {"key": "client_id",       "label": "OAuth Client ID",   "type": "text"},
        {"key": "client_secret",   "label": "OAuth Client Secret","type": "secret"},
    ],
    "meta_ads": [
        {"key": "access_token",   "label": "Access Token",       "type": "secret"},
        {"key": "ad_account_id",  "label": "Ad Account ID",      "type": "text",   "placeholder": "act_XXXXXXXXX"},
    ],
    "semrush": [
        {"key": "api_key",  "label": "API Key",         "type": "secret"},
        {"key": "domain",   "label": "Target Domain",   "type": "text",   "placeholder": "example.com"},
    ],
    "hubspot": [
        {"key": "access_token", "label": "Private App Token", "type": "secret"},
        {"key": "portal_id",    "label": "Portal ID",         "type": "text"},
    ],
    "jira": [
        {"key": "site_url",  "label": "Site URL",   "type": "url",    "placeholder": "https://your-site.atlassian.net"},
        {"key": "email",     "label": "Email",      "type": "email"},
        {"key": "api_token", "label": "API Token",  "type": "secret"},
    ],
    "notion": [
        {"key": "integration_token", "label": "Integration Token", "type": "secret"},
        {"key": "database_id",       "label": "Database / Page ID","type": "text"},
    ],
    "linear": [
        {"key": "api_key",  "label": "API Key",    "type": "secret"},
        {"key": "team_id",  "label": "Team ID",    "type": "text",   "help": "Found in Settings → Team"},
    ],
    "slack": [
        {"key": "bot_token",   "label": "Bot Token",   "type": "secret"},
        {"key": "channel_id",  "label": "Channel ID",  "type": "text",   "placeholder": "C0XXXXXXXXX"},
    ],
    "vercel": [
        {"key": "access_token", "label": "Access Token",  "type": "secret"},
        {"key": "project_id",   "label": "Vercel Project ID", "type": "text"},
    ],
    "mailchimp": [
        {"key": "api_key",    "label": "API Key",     "type": "secret", "help": "Ends with -usX"},
        {"key": "list_id",    "label": "Audience ID", "type": "text"},
    ],
}

DEFAULT_FIELDS: list[dict] = [
    {"key": "api_key",  "label": "API Key / Token", "type": "secret"},
    {"key": "base_url", "label": "Base URL (optional)", "type": "url"},
    {"key": "notes",    "label": "Notes",           "type": "text"},
]

# Secret keys that are masked when returned to the frontend
SECRET_KEYS = {"access_token", "api_key", "api_token", "developer_token", "refresh_token",
               "client_secret", "integration_token", "bot_token", "service_account_json",
               "access_token"}


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class CredentialsSave(BaseModel):
    credentials: dict


# ─── Data fetchers ────────────────────────────────────────────────────────────

async def _fetch_github(creds: dict, project: dict) -> dict:
    repo_url = creds.get("repo_url") or project.get("repo_url", "")
    token    = creds.get("access_token") or decrypt_token(project.get("repo_token", ""))
    if not repo_url:
        return {"error": "No repository URL configured"}

    _platform, owner, repo = parse_repo_url(repo_url)
    if not owner or not repo:
        return {"error": f"Could not parse repository URL: {repo_url}"}

    try:
        commits_data = await fetch_commits(repo_url, project_token=token, per_page=10)
        stats_data   = await fetch_contributor_stats(repo_url, project_token=token)
        contributors = stats_data.get("contributors", []) if isinstance(stats_data, dict) else stats_data
        return {
            "status": "connected",
            "repo": f"{owner}/{repo}",
            "commits": commits_data.get("commits", [])[:5],
            "total_commits": commits_data.get("total", 0),
            "contributors": contributors[:5] if isinstance(contributors, list) else [],
            "total_contributors": len(contributors) if isinstance(contributors, list) else 0,
        }
    except Exception as e:
        return {"error": str(e)}


async def _fetch_figma(creds: dict) -> dict:
    token    = creds.get("access_token", "")
    file_key = creds.get("file_key", "")
    if not token:
        return {"error": "No access token configured"}

    headers = {"X-Figma-Token": token}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            me_r = await client.get("https://api.figma.com/v1/me", headers=headers)
            if me_r.status_code == 403:
                return {"error": "Invalid Figma token"}
            if me_r.status_code != 200:
                return {"error": f"Figma API error ({me_r.status_code})"}
            me = me_r.json()

            result: dict = {
                "status": "connected",
                "user": me.get("handle"),
                "email": me.get("email"),
            }

            if file_key:
                file_r = await client.get(
                    f"https://api.figma.com/v1/files/{file_key}",
                    headers=headers,
                )
                if file_r.status_code == 200:
                    fd = file_r.json()
                    result["file"] = {
                        "name": fd.get("name"),
                        "last_modified": fd.get("lastModified"),
                        "version": fd.get("version"),
                        "pages": len(fd.get("document", {}).get("children", [])),
                        "thumbnail_url": fd.get("thumbnailUrl"),
                    }
            return result
    except Exception as e:
        return {"error": str(e)}


async def _fetch_semrush(creds: dict) -> dict:
    api_key = creds.get("api_key", "")
    domain  = creds.get("domain", "").strip().lower()
    if not api_key or not domain:
        return {"error": "API key and domain are required"}

    url = (
        f"https://api.semrush.com/?type=domain_ranks&key={api_key}"
        f"&export_columns=Db,Nh,Nq,Np,NT,No,Nb,Pl,Pa&domain={domain}&database=us"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
        text = r.text.strip()
        if text.startswith("ERROR"):
            msg = text.split(";;")[-1] if ";;" in text else text
            return {"error": msg}

        lines = text.split("\n")
        if len(lines) >= 2:
            keys   = lines[0].split(";")
            vals   = lines[1].split(";")
            data   = dict(zip(keys, vals))
            return {
                "status": "connected",
                "domain": domain,
                "organic_keywords":  int(data.get("Organic Keywords", 0) or 0),
                "organic_traffic":   int(data.get("Organic Traffic", 0) or 0),
                "paid_keywords":     int(data.get("Paid Keywords", 0) or 0),
                "paid_traffic":      int(data.get("Paid Traffic", 0) or 0),
                "backlinks":         int(data.get("Backlinks", 0) or 0),
                "authority_score":   int(data.get("Authority Score", 0) or 0),
            }
        return {"error": "Unexpected response format"}
    except Exception as e:
        return {"error": str(e)}


async def _fetch_jira(creds: dict) -> dict:
    site    = creds.get("site_url", "").rstrip("/")
    email   = creds.get("email", "")
    token   = creds.get("api_token", "")
    if not site or not email or not token:
        return {"error": "Site URL, email, and API token are required"}

    import base64
    auth_str = base64.b64encode(f"{email}:{token}".encode()).decode()
    headers  = {"Authorization": f"Basic {auth_str}", "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Myself
            me_r = await client.get(f"{site}/rest/api/3/myself", headers=headers)
            if me_r.status_code == 401:
                return {"error": "Invalid Jira credentials"}
            if me_r.status_code != 200:
                return {"error": f"Jira API error ({me_r.status_code})"}
            me = me_r.json()

            # Open issues assigned to the project
            issues_r = await client.get(
                f"{site}/rest/api/3/search",
                params={"jql": "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
                        "maxResults": 10, "fields": "summary,status,priority"},
                headers=headers,
            )
            issues_data = issues_r.json() if issues_r.status_code == 200 else {}
            issues = [
                {
                    "key": i.get("key"),
                    "summary": i.get("fields", {}).get("summary", ""),
                    "status": i.get("fields", {}).get("status", {}).get("name", ""),
                    "priority": i.get("fields", {}).get("priority", {}).get("name", ""),
                }
                for i in issues_data.get("issues", [])
            ]

        return {
            "status": "connected",
            "user": me.get("displayName"),
            "email": me.get("emailAddress"),
            "open_issues": issues_data.get("total", len(issues)),
            "issues": issues[:5],
        }
    except Exception as e:
        return {"error": str(e)}


async def _fetch_notion(creds: dict) -> dict:
    token    = creds.get("integration_token", "")
    db_id    = creds.get("database_id", "").replace("-", "")
    if not token:
        return {"error": "Integration token is required"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": "2022-06-28",
        "Content-Type":  "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            me_r = await client.get("https://api.notion.com/v1/users/me", headers=headers)
            if me_r.status_code == 401:
                return {"error": "Invalid Notion token"}
            if me_r.status_code != 200:
                return {"error": f"Notion API error ({me_r.status_code})"}
            me = me_r.json()

            result: dict = {
                "status": "connected",
                "user": me.get("name"),
                "type": me.get("type"),
            }

            if db_id:
                db_r = await client.post(
                    f"https://api.notion.com/v1/databases/{db_id}/query",
                    json={"page_size": 10},
                    headers=headers,
                )
                if db_r.status_code == 200:
                    db_data = db_r.json()
                    result["database"] = {
                        "total_pages": db_data.get("results") and len(db_data["results"]),
                        "has_more": db_data.get("has_more", False),
                    }
            return result
    except Exception as e:
        return {"error": str(e)}


async def _fetch_linear(creds: dict) -> dict:
    api_key  = creds.get("api_key", "")
    team_id  = creds.get("team_id", "")
    if not api_key:
        return {"error": "API key is required"}

    query = """
    query {
      viewer { id name email }
      issues(filter: { state: { type: { neq: "completed" } } }, first: 10) {
        nodes { id title state { name } priority }
        totalCount
      }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.linear.app/graphql",
                json={"query": query},
                headers={"Authorization": api_key, "Content-Type": "application/json"},
            )
        if r.status_code == 401:
            return {"error": "Invalid Linear API key"}
        data = r.json()
        if "errors" in data:
            return {"error": data["errors"][0].get("message", "GraphQL error")}

        viewer = data.get("data", {}).get("viewer", {})
        issues_data = data.get("data", {}).get("issues", {})
        issues = [
            {"title": i.get("title"), "state": i.get("state", {}).get("name"), "priority": i.get("priority")}
            for i in issues_data.get("nodes", [])
        ]
        return {
            "status": "connected",
            "user": viewer.get("name"),
            "email": viewer.get("email"),
            "open_issues": issues_data.get("totalCount", 0),
            "issues": issues[:5],
        }
    except Exception as e:
        return {"error": str(e)}


async def _fetch_vercel(creds: dict) -> dict:
    token      = creds.get("access_token", "")
    project_id = creds.get("project_id", "")
    if not token:
        return {"error": "Access token is required"}

    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            me_r = await client.get("https://api.vercel.com/v2/user", headers=headers)
            if me_r.status_code == 401:
                return {"error": "Invalid Vercel token"}
            if me_r.status_code != 200:
                return {"error": f"Vercel API error ({me_r.status_code})"}
            me = me_r.json().get("user", {})

            result: dict = {
                "status": "connected",
                "user": me.get("username"),
                "email": me.get("email"),
            }

            if project_id:
                dep_r = await client.get(
                    f"https://api.vercel.com/v6/deployments",
                    params={"projectId": project_id, "limit": 5},
                    headers=headers,
                )
                if dep_r.status_code == 200:
                    deps = dep_r.json().get("deployments", [])
                    result["deployments"] = [
                        {
                            "uid": d.get("uid"),
                            "url": d.get("url"),
                            "state": d.get("state"),
                            "created": d.get("createdAt"),
                        }
                        for d in deps
                    ]
                    result["latest_deployment"] = result["deployments"][0] if result["deployments"] else None
            return result
    except Exception as e:
        return {"error": str(e)}


# Router mapping tool_id → fetcher
FETCHERS = {
    "github":  _fetch_github,
    "figma":   _fetch_figma,
    "semrush": _fetch_semrush,
    "jira":    _fetch_jira,
    "notion":  _fetch_notion,
    "linear":  _fetch_linear,
    "vercel":  _fetch_vercel,
}

OAUTH_ONLY = {
    "google_analytics", "search_console", "google_ads", "meta_ads",
    "hubspot", "linkedin_ads",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mask(creds: dict) -> dict:
    """Return credentials with secret values masked."""
    return {
        k: ("•••••••••" if k in SECRET_KEYS else v)
        for k, v in creds.items()
    }


async def _assert_project_write(db, project_id: str, current_user: dict):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not (
        is_exec(current_user)
        or str(project.get("pm_id", "")) == str(current_user["_id"])
        or is_pm(current_user)
        or is_team_lead(current_user)
    ):
        raise HTTPException(status_code=403, detail="Not authorised to manage this project's tools")
    return project


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/field-defs/{tool_id}")
async def get_tool_field_defs(
    tool_id: str,
    current_user=Depends(get_current_user),
):
    """Return the credential field definitions for a given tool."""
    fields = TOOL_FIELD_DEFS.get(tool_id, DEFAULT_FIELDS)
    oauth  = tool_id in OAUTH_ONLY
    return {
        "tool_id": tool_id,
        "fields": fields,
        "oauth_only": oauth,
        "oauth_message": (
            "This tool uses OAuth 2.0. Please configure it via the provider's API Console "
            "and supply the resulting refresh token and client credentials."
        ) if oauth else None,
    }


@router.get("/{project_id}/tools")
async def list_project_tools(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """List all configured tool integrations for a project."""
    docs = await db.project_tool_credentials.find(
        {"project_id": project_id}
    ).to_list(100)

    result = []
    for doc in docs:
        creds = doc.get("credentials", {})
        result.append({
            "tool_id":   doc["tool_id"],
            "configured": True,
            "credentials_masked": _mask(creds),
            "updated_at": doc.get("updated_at", "").isoformat() if isinstance(doc.get("updated_at"), datetime) else "",
        })
    return {"tools": result}


@router.put("/{project_id}/tools/{tool_id}/credentials")
async def save_tool_credentials(
    project_id: str,
    tool_id: str,
    body: CredentialsSave,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Save or update credentials for a tool in a project."""
    await _assert_project_write(db, project_id, current_user)

    now = datetime.now(timezone.utc)
    await db.project_tool_credentials.update_one(
        {"project_id": project_id, "tool_id": tool_id},
        {"$set": {
            "project_id": project_id,
            "tool_id":    tool_id,
            "credentials": body.credentials,
            "updated_by": current_user["_id"],
            "updated_at": now,
        }},
        upsert=True,
    )
    return {"message": "Credentials saved"}


@router.get("/{project_id}/tools/{tool_id}/data")
async def fetch_tool_data(
    project_id: str,
    tool_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Fetch live data from an integrated tool."""
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    cred_doc = await db.project_tool_credentials.find_one(
        {"project_id": project_id, "tool_id": tool_id}
    )

    creds = cred_doc.get("credentials", {}) if cred_doc else {}

    # GitHub can work with project-level repo_url / repo_token even without stored creds
    if tool_id == "github":
        if not creds:
            creds = {
                "repo_url":     str(project.get("repo_url", "")),
                "access_token": decrypt_token(str(project.get("repo_token", ""))),
            }
        result = await _fetch_github(creds, project)
        return result

    if not cred_doc:
        return {
            "status": "not_configured",
            "message": "No credentials saved for this tool yet.",
        }

    if tool_id in OAUTH_ONLY:
        return {
            "status": "oauth_only",
            "message": (
                "This tool requires OAuth 2.0 server-side setup. "
                "Credentials stored — contact your system administrator to enable the integration."
            ),
        }

    fetcher = FETCHERS.get(tool_id)
    if fetcher is None:
        return {
            "status": "not_integrated",
            "message": f"Live data fetch for '{tool_id}' is not yet implemented. Credentials are saved.",
        }

    result = await fetcher(creds) if tool_id != "github" else await fetcher(creds, project)
    return result


@router.delete("/{project_id}/tools/{tool_id}")
async def remove_tool_credentials(
    project_id: str,
    tool_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Remove stored credentials for a tool from a project."""
    await _assert_project_write(db, project_id, current_user)
    await db.project_tool_credentials.delete_one(
        {"project_id": project_id, "tool_id": tool_id}
    )
    return {"message": "Tool credentials removed"}
