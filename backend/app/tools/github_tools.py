"""GitHub tools for the AI agent.

These run with the platform's GITHUB_TOKEN, so the model must never choose which
repository they touch: an end client (or text inside a repo/log) could otherwise
steer them at any repo the token can see. Every tool is bound to an explicit
allow-list of repos (the project being discussed) and fails closed with none.
"""

import os
import re
from typing import Any, Dict, Iterable, List
from urllib.parse import quote

import httpx

from .base import Tool

REPO_OWNER_DESCRIPTION = "Owner of the repository"
REPO_NAME_DESCRIPTION = "Name of the repository"
GITHUB_TOKEN_MISSING = "Error: GITHUB_TOKEN not configured."
REPO_NOT_ALLOWED = "Access denied: that repository is not linked to this project."

_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def _normalize_repos(repos: Iterable[str]) -> frozenset:
    return frozenset(r.strip().lower() for r in repos if r and "/" in r)


class _RepoScopedTool(Tool):
    def __init__(self, allowed_repos: Iterable[str] = ()):
        self.allowed_repos = _normalize_repos(allowed_repos)

    def repo_error(self, repo_owner: str, repo_name: str) -> str | None:
        """Return a refusal message unless owner/name is an allowed repo."""
        if not (_SEGMENT.match(repo_owner or "") and _SEGMENT.match(repo_name or "")):
            return REPO_NOT_ALLOWED
        if f"{repo_owner}/{repo_name}".lower() not in self.allowed_repos:
            return REPO_NOT_ALLOWED
        return None


class GitHubSearchIssuesTool(_RepoScopedTool):
    name = "github_search_issues"
    description = "Search for issues and pull requests in the repository."
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query (e.g., 'is:issue is:open bug')"
            },
            "repo_owner": {
                "type": "string",
                "description": REPO_OWNER_DESCRIPTION
            },
            "repo_name": {
                "type": "string",
                "description": REPO_NAME_DESCRIPTION
            }
        },
        "required": ["query", "repo_owner", "repo_name"]
    }

    async def run(self, query: str, repo_owner: str, repo_name: str) -> str:
        if refusal := self.repo_error(repo_owner, repo_name):
            return refusal
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return GITHUB_TOKEN_MISSING

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json"
            }
            # The repo qualifier is fixed by us; params= URL-encodes the model's query
            # so it cannot smuggle extra query-string parameters.
            response = await client.get(
                "https://api.github.com/search/issues",
                params={"q": f"repo:{repo_owner}/{repo_name} {query}"},
                headers=headers,
            )

            if response.status_code != 200:
                return f"GitHub API Error: {response.text}"

            data = response.json()
            if data["total_count"] == 0:
                return "No issues found matching that query."

            # Format top 5 results
            results = []
            for item in data["items"][:5]:
                state_icon = "🟢" if item["state"] == "open" else "🔴"
                results.append(
                    f"{state_icon} #{item['number']} {item['title']} "
                    f"(Created by {item['user']['login']})"
                )

            return "\n".join(results)


class GitHubGetFileTool(_RepoScopedTool):
    name = "github_get_file"
    description = "Read the content of a file in the repository."
    parameters = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to the file (e.g., 'src/main.py')"
            },
            "repo_owner": {
                "type": "string",
                "description": REPO_OWNER_DESCRIPTION
            },
            "repo_name": {
                "type": "string",
                "description": REPO_NAME_DESCRIPTION
            }
        },
        "required": ["path", "repo_owner", "repo_name"]
    }

    async def run(self, path: str, repo_owner: str, repo_name: str) -> str:
        if refusal := self.repo_error(repo_owner, repo_name):
            return refusal
        if not path or path.startswith("/") or ".." in path.split("/"):
            return "Invalid file path."
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return GITHUB_TOKEN_MISSING

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3.raw"  # requesting raw content
            }
            url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{quote(path, safe='/')}"
            response = await client.get(url, headers=headers)

            if response.status_code == 404:
                return f"File not found: {path}"
            elif response.status_code != 200:
                return f"GitHub API Error: {response.text}"

            # Only return first 2000 chars to avoid token limits
            content = response.text
            if len(content) > 2000:
                return content[:2000] + "\n... (truncated)"
            return content


class GitHubCreateIssueTool(_RepoScopedTool):
    name = "github_create_issue"
    description = "Create a new issue in the repository."
    parameters = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title of the issue"
            },
            "body": {
                "type": "string",
                "description": "Body/Description of the issue (Markdown supported)"
            },
            "repo_owner": {
                "type": "string",
                "description": REPO_OWNER_DESCRIPTION
            },
            "repo_name": {
                "type": "string",
                "description": REPO_NAME_DESCRIPTION
            },
            "labels": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of labels (optional)"
            }
        },
        "required": ["title", "body", "repo_owner", "repo_name"]
    }

    async def run(self, title: str, body: str, repo_owner: str, repo_name: str, labels: List[str] = None) -> str:
        if refusal := self.repo_error(repo_owner, repo_name):
            return refusal
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return GITHUB_TOKEN_MISSING

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json"
            }

            payload = {
                "title": title,
                "body": body,
                "labels": labels or []
            }

            url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/issues"
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 201:
                data = response.json()
                return f"Success! Issue created: {data['html_url']}"
            else:
                return f"GitHub API Error: {response.text}"
