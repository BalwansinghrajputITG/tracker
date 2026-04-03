"""
Shared helpers for fetching git commit data from GitHub / GitLab.
Used by both routers/projects.py and chatbot/context_builder.py.
"""
import os
import re
import urllib.parse
import asyncio
import httpx


def parse_repo_url(url: str) -> tuple[str, str, str]:
    """Return (platform, owner, repo) from a GitHub/GitLab URL or SSH string."""
    url = url.strip().rstrip("/")
    ssh = re.match(r"git@([\w.\-]+):([\w.\-]+)/([\w.\-]+?)(?:\.git)?$", url)
    if ssh:
        host, owner, repo = ssh.groups()
        platform = "github" if "github" in host else "gitlab" if "gitlab" in host else "unknown"
        return platform, owner, repo
    https = re.match(r"https?://([\w.\-]+)/([\w.\-]+)/([\w.\-]+?)(?:\.git)?(?:/.*)?$", url)
    if https:
        host, owner, repo = https.groups()
        platform = "github" if "github" in host else "gitlab" if "gitlab" in host else "unknown"
        return platform, owner, repo
    return "unknown", "", ""


def _gh_headers(token: str) -> dict:
    h = {"Accept": "application/vnd.github.v3+json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


async def fetch_commits(
    repo_url: str,
    project_token: str = "",
    per_page: int = 100,
    author_email: str = "",
) -> dict:
    """
    Fetch commits from GitHub or GitLab.

    If author_email is provided, the API-level author filter is applied so only
    commits by that contributor are returned (GitHub accepts login or email;
    GitLab accepts author_email).

    Returns:
        {
            "commits": [ {sha, message, author, email, date, avatar_url} ],
            "total": int,
            "error": str|None,
        }
    """
    platform, owner, repo = parse_repo_url(repo_url)
    if platform == "unknown" or not owner or not repo:
        return {"commits": [], "total": 0, "error": "Unrecognised repository URL format."}

    token = project_token or os.getenv("GITHUB_TOKEN" if platform == "github" else "GITLAB_TOKEN", "")

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            if platform == "github":
                params: dict = {"per_page": per_page}
                if author_email:
                    params["author"] = author_email   # GitHub accepts login OR email
                resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/commits",
                    params=params,
                    headers=_gh_headers(token),
                )
                if resp.status_code == 404:
                    return {"commits": [], "total": 0, "error": "Repository not found. Add a Personal Access Token if it is private."}
                if resp.status_code == 403:
                    return {"commits": [], "total": 0, "error": "GitHub API rate limit reached. Set GITHUB_TOKEN in .env."}
                if resp.status_code != 200:
                    return {"commits": [], "total": 0, "error": f"GitHub API error {resp.status_code}."}
                data = resp.json()
                commits = [
                    {
                        "sha":        c["sha"][:7],
                        "full_sha":   c["sha"],
                        "message":    c["commit"]["message"],          # full message, not just first line
                        "author":     c["commit"]["author"]["name"],
                        "email":      c["commit"]["author"].get("email", ""),
                        "date":       c["commit"]["author"]["date"],
                        "avatar_url": (c.get("author") or {}).get("avatar_url", ""),
                    }
                    for c in data
                ]

            elif platform == "gitlab":
                encoded = urllib.parse.quote(f"{owner}/{repo}", safe="")
                headers = {"PRIVATE-TOKEN": token} if token else {}
                gl_params: dict = {"per_page": per_page}
                if author_email:
                    gl_params["author_email"] = author_email
                resp = await client.get(
                    f"https://gitlab.com/api/v4/projects/{encoded}/repository/commits",
                    params=gl_params,
                    headers=headers,
                )
                if resp.status_code == 404:
                    return {"commits": [], "total": 0, "error": "Repository not found. Add a Personal Access Token if it is private."}
                if resp.status_code != 200:
                    return {"commits": [], "total": 0, "error": f"GitLab API error {resp.status_code}."}
                data = resp.json()
                commits = [
                    {
                        "sha":        c["id"][:7],
                        "full_sha":   c["id"],
                        "message":    c.get("message", c.get("title", "")),
                        "author":     c["author_name"],
                        "email":      c.get("author_email", ""),
                        "date":       c["created_at"],
                        "avatar_url": "",
                    }
                    for c in data
                ]
            else:
                return {"commits": [], "total": 0, "error": "Unsupported platform."}

        return {"commits": commits, "total": len(commits), "error": None}

    except httpx.TimeoutException:
        return {"commits": [], "total": 0, "error": "Request timed out."}
    except Exception as exc:
        return {"commits": [], "total": 0, "error": f"Failed to fetch commits: {exc}"}


async def fetch_contributor_stats(repo_url: str, project_token: str = "") -> dict:
    """
    Return per-contributor statistics: commits, lines added, lines deleted.

    GitHub:  GET /repos/{owner}/{repo}/stats/contributors
    GitLab:  aggregate from commits endpoint with with_stats=true
             (lines stats not available on GitLab without per-commit requests)

    Returns:
        {
            "contributors": [
                {
                    "author":     str,
                    "email":      str,
                    "avatar_url": str,
                    "commits":    int,
                    "additions":  int,
                    "deletions":  int,
                    "lines":      int,   # additions + deletions
                }
            ],
            "error": str|None,
        }
    """
    platform, owner, repo = parse_repo_url(repo_url)
    if platform == "unknown" or not owner or not repo:
        return {"contributors": [], "error": "Unrecognised repository URL format."}

    token = project_token or os.getenv("GITHUB_TOKEN" if platform == "github" else "GITLAB_TOKEN", "")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if platform == "github":
                # GitHub stats/contributors endpoint – may return 202 while computing
                for _ in range(3):
                    resp = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo}/stats/contributors",
                        headers=_gh_headers(token),
                    )
                    if resp.status_code == 202:
                        await asyncio.sleep(1)
                        continue
                    break

                if resp.status_code == 404:
                    return {"contributors": [], "error": "Repository not found."}
                if resp.status_code == 403:
                    return {"contributors": [], "error": "GitHub API rate limit reached."}
                if resp.status_code != 200:
                    return {"contributors": [], "error": f"GitHub API error {resp.status_code}."}

                data = resp.json()
                if not isinstance(data, list):
                    return {"contributors": [], "error": "Stats not ready yet — try again in a moment."}

                # Also fetch the commits list to get emails (stats API doesn't expose email)
                email_map: dict[str, str] = {}
                commits_resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/commits",
                    params={"per_page": 100},
                    headers=_gh_headers(token),
                )
                if commits_resp.status_code == 200:
                    for c in commits_resp.json():
                        login = (c.get("author") or {}).get("login", "")
                        email = c["commit"]["author"].get("email", "")
                        if login and email and login not in email_map:
                            email_map[login] = email

                contributors = []
                for c in data:
                    author = c.get("author") or {}
                    login = author.get("login", "")
                    total_adds = sum(w.get("a", 0) for w in c.get("weeks", []))
                    total_dels = sum(w.get("d", 0) for w in c.get("weeks", []))
                    contributors.append({
                        "author":     author.get("login", "Unknown"),
                        "email":      email_map.get(login, ""),
                        "avatar_url": author.get("avatar_url", ""),
                        "commits":    c.get("total", 0),
                        "additions":  total_adds,
                        "deletions":  total_dels,
                        "lines":      total_adds + total_dels,
                    })

                # Sort by commits desc
                contributors.sort(key=lambda x: x["commits"], reverse=True)
                return {"contributors": contributors, "error": None}

            elif platform == "gitlab":
                encoded = urllib.parse.quote(f"{owner}/{repo}", safe="")
                headers = {"PRIVATE-TOKEN": token} if token else {}
                # Fetch up to 100 commits with stats
                resp = await client.get(
                    f"https://gitlab.com/api/v4/projects/{encoded}/repository/commits",
                    params={"per_page": 100, "with_stats": "true"},
                    headers=headers,
                )
                if resp.status_code == 404:
                    return {"contributors": [], "error": "Repository not found."}
                if resp.status_code != 200:
                    return {"contributors": [], "error": f"GitLab API error {resp.status_code}."}

                agg: dict[str, dict] = {}
                for c in resp.json():
                    key = c.get("author_email", c.get("author_name", "unknown"))
                    stats = c.get("stats", {})
                    if key not in agg:
                        agg[key] = {
                            "author":     c.get("author_name", key),
                            "email":      c.get("author_email", ""),
                            "avatar_url": "",
                            "commits":    0,
                            "additions":  0,
                            "deletions":  0,
                        }
                    agg[key]["commits"]   += 1
                    agg[key]["additions"] += stats.get("additions", 0)
                    agg[key]["deletions"] += stats.get("deletions", 0)

                contributors = sorted(agg.values(), key=lambda x: x["commits"], reverse=True)
                for c in contributors:
                    c["lines"] = c["additions"] + c["deletions"]
                return {"contributors": contributors, "error": None}

            else:
                return {"contributors": [], "error": "Unsupported platform."}

    except httpx.TimeoutException:
        return {"contributors": [], "error": "Request timed out."}
    except Exception as exc:
        return {"contributors": [], "error": f"Failed to fetch contributor stats: {exc}"}
