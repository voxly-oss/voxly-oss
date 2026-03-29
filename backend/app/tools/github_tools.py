from typing import Any, Dict, List
from .base import Tool
import httpx
import os
REPO_OWNER_DESCRIPTION = "Owner of the repository"
REPO_NAME_DESCRIPTION = "Name of the repository"
GITHUB_TOKEN_MISSING = "Error: GITHUB_TOKEN not configured."

class GitHubSearchIssuesTool(Tool):
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
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return GITHUB_TOKEN_MISSING

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json"
            }
            # Add repo qualifier to query
            full_query = f"repo:{repo_owner}/{repo_name} {query}"
            response = await client.get(
                f"https://api.github.com/search/issues?q={full_query}",
                headers=headers
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

class GitHubGetFileTool(Tool):
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
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            return GITHUB_TOKEN_MISSING

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3.raw"  # requesting raw content
            }
            url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{path}"
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


class GitHubCreateIssueTool(Tool):
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
