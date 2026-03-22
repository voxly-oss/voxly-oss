from celery import shared_task
from app.database import SessionLocal
from app.models.project import Project
from app.models.github_cache import GitHubCache
from app.services.github_service import fetch_github_stats
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def sync_all_github_repos(self):
    """
    Sync all active project repos
    Run every hour via Celery Beat
    """
    db = SessionLocal()
    
    try:
        # Get all active projects with GitHub repos
        projects = db.query(Project).filter(
            Project.status == 'active',
            Project.github_repo.isnot(None)
        ).all()
        
        logger.info(f"Starting GitHub sync for {len(projects)} projects")
        
        for project in projects:
            try:
                sync_single_repo.delay(str(project.id), project.github_repo)
            except Exception as e:
                logger.error(f"Failed to queue sync for project {project.id}: {e}")
        
        return {"status": "queued", "count": len(projects)}
        
    except Exception as e:
        logger.error(f"Error in sync_all_github_repos: {e}")
        raise self.retry(exc=e, countdown=300)  # Retry after 5 minutes
        
    finally:
        db.close()


@shared_task(bind=True, max_retries=3)
def sync_single_repo(self, project_id: str, repo_name: str):
    """
    Sync single repository
    
    Args:
        project_id: UUID of project
        repo_name: GitHub repo in format "owner/repo"
    """
    db = SessionLocal()
    
    try:
        # Fetch fresh stats from GitHub
        stats = asyncio.run(fetch_github_stats(repo_name))
        
        # Update or create cache entry
        cache = db.query(GitHubCache).filter(
            GitHubCache.project_id == project_id
        ).first()
        
        if cache:
            # Update existing
            cache.commits_last_7_days = stats.get("commits_last_7_days", 0)
            cache.open_issues = stats.get("open_issues", 0)
            cache.closed_issues = stats.get("closed_issues", 0)
            cache.pull_requests = stats.get("pull_requests", 0)
            cache.progress_percent = stats.get("progress_percent", 0)
            cache.last_commit_message = stats.get("last_commit_message")
            
            if stats.get("last_commit_date"):
                cache.last_commit_date = datetime.fromisoformat(stats["last_commit_date"])
            
            cache.synced_at = datetime.utcnow()
            
            logger.info(f"Updated GitHub cache for project {project_id}")
        else:
            # Create new
            cache = GitHubCache(
                project_id=project_id,
                commits_last_7_days=stats.get("commits_last_7_days", 0),
                open_issues=stats.get("open_issues", 0),
                closed_issues=stats.get("closed_issues", 0),
                pull_requests=stats.get("pull_requests", 0),
                progress_percent=stats.get("progress_percent", 0),
                last_commit_message=stats.get("last_commit_message"),
                last_commit_date=datetime.fromisoformat(stats["last_commit_date"]) if stats.get("last_commit_date") else None
            )
            db.add(cache)
            logger.info(f"Created GitHub cache for project {project_id}")
        
        db.commit()
        
        # Invalidate Redis cache
        from app.services.cache_service import invalidate_github_cache
        asyncio.run(invalidate_github_cache(project_id))
        
        return {"status": "success", "project_id": project_id}
        
    except Exception as e:
        logger.error(f"Error syncing repo {repo_name} for project {project_id}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=300)  # Retry after 5 minutes
        
    finally:
        db.close()


@shared_task
def force_sync_project(project_id: str, repo_name: str):
    """
    Force sync a specific project (called manually from API)
    """
    return sync_single_repo(project_id, repo_name)
