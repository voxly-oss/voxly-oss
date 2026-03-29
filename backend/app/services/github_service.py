from github import Github, GithubException
from app.config import get_settings
from datetime import datetime, timedelta, timezone
from typing import Dict
import logging
import asyncio

logger = logging.getLogger(__name__)
settings = get_settings()

github_client = Github(settings.GITHUB_TOKEN)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def fetch_github_stats(repo_name: str) -> Dict:
    """
    Fetch GitHub repository statistics
    
    Args:
        repo_name: Repository in format "owner/repo"
        
    Returns:
        Dictionary with GitHub stats
    """
    def _fetch_sync() -> Dict:
        repo = github_client.get_repo(repo_name)

        # Get commits from last 7 days
        since_date = datetime.now() - timedelta(days=7)
        commits = repo.get_commits(since=since_date)
        commits_count = sum(1 for _ in commits)

        # Get issues (exclude PRs by querying issues directly)
        open_issues = repo.get_issues(state="open").totalCount
        closed_issues = repo.get_issues(state="closed").totalCount
        total_issues = open_issues + closed_issues

        # Calculate progress based on issues
        progress_percent = int((closed_issues / total_issues) * 100) if total_issues > 0 else 0

        # Get last commit
        last_commit_message = None
        last_commit_date = None
        try:
            latest = repo.get_commits()[0]
            last_commit_message = latest.commit.message.split("\n")[0][:100]
            last_commit_date = latest.commit.author.date
        except Exception as e:
            logger.warning(f"Failed to fetch last commit: {e}")

        pull_requests = repo.get_pulls(state="all").totalCount

        return {
            "commits_last_7_days": commits_count,
            "open_issues": open_issues,
            "closed_issues": closed_issues,
            "total_issues": total_issues,
            "progress_percent": progress_percent,
            "pull_requests": pull_requests,
            "last_commit_message": last_commit_message,
            "last_commit_date": last_commit_date.isoformat() if last_commit_date else None,
            "synced_at": _utc_now().isoformat(),
            "error": None,
        }

    try:
        return await asyncio.to_thread(_fetch_sync)
    except GithubException as e:
        logger.error(f"GitHub API error for {repo_name}: {e}")
        return {
            "error": f"GitHub API error: {str(e)}",
            "commits_last_7_days": 0,
            "open_issues": 0,
            "closed_issues": 0,
            "total_issues": 0,
            "progress_percent": 0,
            "pull_requests": 0,
            "last_commit_message": None,
            "last_commit_date": None,
            "synced_at": _utc_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Unexpected error fetching GitHub stats for {repo_name}: {e}")
        return {
            "error": str(e),
            "commits_last_7_days": 0,
            "open_issues": 0,
            "closed_issues": 0,
            "total_issues": 0,
            "progress_percent": 0,
            "pull_requests": 0,
            "last_commit_message": None,
            "last_commit_date": None,
            "synced_at": _utc_now().isoformat()
        }
