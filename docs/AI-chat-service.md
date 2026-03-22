# TASK: AI Chat Service with Claude API, GitHub Integration & WhatsApp

## Context
Build the core AI logic that receives WhatsApp messages from clients, fetches project data and GitHub stats, generates natural AI responses using Claude, sends replies back via WhatsApp, and runs background tasks to sync GitHub data.

## Tech Stack
- Python 3.12
- FastAPI
- Claude Sonnet 4 (Anthropic)
- GitHub API (PyGithub)
- Twilio (WhatsApp)
- Redis (Upstash) for caching
- Celery for background tasks

---

## PART 1: DATABASE MODEL

### File: backend/app/models/github_cache.py
```python
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid
from datetime import datetime

class GitHubCache(Base):
    __tablename__ = "github_cache"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'), unique=True, nullable=False, index=True)
    commits_count = Column(Integer, default=0)
    commits_last_7_days = Column(Integer, default=0)
    open_issues = Column(Integer, default=0)
    closed_issues = Column(Integer, default=0)
    pull_requests = Column(Integer, default=0)
    last_commit_message = Column(String)
    last_commit_date = Column(DateTime)
    progress_percent = Column(Integer, default=0)
    synced_at = Column(DateTime, default=datetime.utcnow, index=True)
```

---

## PART 2: AI SERVICE

### File: backend/app/services/ai_service.py
```python
from anthropic import Anthropic
from app.config import settings
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)
client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

async def generate_client_response(
    client_name: str,
    project_name: str,
    github_stats: Dict,
    milestones: List[Dict],
    client_question: str
) -> Dict[str, any]:
    """
    Generate AI response using Claude Sonnet 4
    
    Args:
        client_name: Name of the client
        project_name: Name of the project
        github_stats: Dictionary with GitHub statistics
        milestones: List of milestone dictionaries
        client_question: The question asked by client
        
    Returns:
        Dictionary with response, tokens_used, and model info
    """
    
    # Build milestone summary
    milestone_text = "\n".join([
        f"- {m['title']}: {m['status']} ({m['progress']}% complete)"
        for m in milestones
    ]) if milestones else "No milestones defined yet"
    
    # Build context for Claude
    context = f"""
Client Information:
- Name: {client_name}
- Project: {project_name}

GitHub Statistics (Last 7 days):
- Total commits: {github_stats.get('commits_last_7_days', 0)}
- Open issues: {github_stats.get('open_issues', 0)}
- Closed issues: {github_stats.get('closed_issues', 0)}
- Overall progress: {github_stats.get('progress_percent', 0)}%
- Last commit: {github_stats.get('last_commit_message', 'No recent activity')}
- Last updated: {github_stats.get('last_commit_date', 'Unknown')}

Project Milestones:
{milestone_text}

Client's Question:
{client_question}
"""

    # System prompt for Claude
    system_prompt = """You are a professional and friendly project manager assistant for a software development agency in India.

Your role:
1. Provide accurate project status updates based on GitHub data and milestones
2. Be warm, friendly, and reassuring (clients are often anxious about progress)
3. Use simple language, avoid technical jargon
4. If asked about delays, be honest but focus on solutions
5. Encourage clients to ask follow-up questions
6. Match the language of the question (English/Hindi/Hinglish)

Response format guidelines:
- Start with a friendly greeting (e.g., "Hey!", "Namaste!", "Hi there!")
- Use emojis sparingly and appropriately (✅ 🔄 ⏳ 🚀)
- Structure: Overview → Details → Next steps
- Keep responses under 200 words
- End with an open question (e.g., "Anything specific you want to know?")

Language matching:
- If question is in Hindi/Hinglish, respond in Hindi/Hinglish
- If question is in English, respond in English
- Use natural, conversational tone

Examples:

Question: "What's the status?"
Response: "Hey! Your project is going great! 😊

✅ Homepage: 100% done
🔄 Payment integration: 75% (almost there!)
⏳ Admin panel: Starting next week

Overall: 65% complete
Last update: 2 hours ago

Expected delivery: Feb 28

Anything specific you want to know?"

Question: "Bhai kaam ho gaya kya?"
Response: "Bilkul bhai! Kaam accha chal raha hai 🚀

✅ Homepage: Complete ho gaya
🔄 Payment system: 75% done (2-3 din mein ready)
⏳ Admin panel: Next week start karenge

Total: 65% complete hai
Last update: 2 ghante pehle

28 Feb tak deliver ho jayega pakka!

Koi specific cheez jaanni hai?"

Question: "Is there any delay?"
Response: "Good news - we're actually on track! 🎉

The payment integration took a bit longer than expected (complex requirements), but we adjusted the schedule. Everything else is moving smoothly.

Current timeline:
- Payment: Done by Jan 25 (was Jan 20)
- Admin panel: Feb 15 (on schedule)
- Final delivery: Feb 28 (no change)

We're keeping you updated every step! Any concerns?"
"""

    try:
        # Call Claude API
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": context
                }
            ]
        )
        
        # Extract text response
        response_text = message.content[0].text if message.content else "Sorry, I couldn't generate a response."
        
        # Log token usage
        tokens_used = message.usage.input_tokens + message.usage.output_tokens
        
        logger.info(f"Claude API call successful. Tokens used: {tokens_used}")
        
        return {
            "response": response_text,
            "tokens_used": tokens_used,
            "model": "claude-sonnet-4-20250514",
            "success": True
        }
        
    except Exception as e:
        logger.error(f"Claude API error: {str(e)}")
        
        # Fallback response
        return {
            "response": f"Hi {client_name}! I'm having trouble checking your project status right now. Please contact your project manager directly or try again in a few minutes. 🙏",
            "tokens_used": 0,
            "model": "error",
            "success": False,
            "error": str(e)
        }
```

---

## PART 3: GITHUB SERVICE

### File: backend/app/services/github_service.py
```python
from github import Github, GithubException
from app.config import settings
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)
github_client = Github(settings.GITHUB_TOKEN)

async def fetch_github_stats(repo_name: str) -> Dict:
    """
    Fetch GitHub repository statistics
    
    Args:
        repo_name: Repository in format "owner/repo"
        
    Returns:
        Dictionary with GitHub stats
    """
    try:
        repo = github_client.get_repo(repo_name)
        
        # Get commits from last 7 days
        since_date = datetime.now() - timedelta(days=7)
        commits = list(repo.get_commits(since=since_date))
        commits_count = len(commits)
        
        # Get issues
        open_issues = repo.open_issues_count
        all_issues = list(repo.get_issues(state='all'))
        total_issues = len(all_issues)
        closed_issues = total_issues - open_issues
        
        # Calculate progress based on issues
        progress_percent = 0
        if total_issues > 0:
            progress_percent = int((closed_issues / total_issues) * 100)
        
        # Get last commit
        last_commit_message = None
        last_commit_date = None
        try:
            if commits:
                latest = commits[0]
                last_commit_message = latest.commit.message.split('\n')[0][:100]
                last_commit_date = latest.commit.author.date
        except Exception as e:
            logger.warning(f"Failed to fetch last commit: {e}")
        
        # Get pull requests
        prs = list(repo.get_pulls(state='all'))
        pull_requests = len(prs)
        
        return {
            "commits_last_7_days": commits_count,
            "open_issues": open_issues,
            "closed_issues": closed_issues,
            "total_issues": total_issues,
            "progress_percent": progress_percent,
            "pull_requests": pull_requests,
            "last_commit_message": last_commit_message,
            "last_commit_date": last_commit_date.isoformat() if last_commit_date else None,
            "synced_at": datetime.utcnow().isoformat(),
            "error": None
        }
        
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
            "synced_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Unexpected error fetching GitHub stats for {repo_name}: {e}")
        return {
            "error": str(e),
            "commits_last_7_days": 0,
            "open_issues": 0,
            "closed_issues": 0,
            "progress_percent": 0
        }
```

---

## PART 4: CACHE SERVICE

### File: backend/app/services/cache_service.py
```python
import redis
import json
from app.config import settings
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)

# Connect to Upstash Redis
redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=5
)

async def get_github_stats_cached(project_id: str, repo_name: str) -> Dict:
    """
    Get GitHub stats with 1-hour cache
    
    Args:
        project_id: UUID of the project
        repo_name: GitHub repo in format "owner/repo"
        
    Returns:
        Dictionary with GitHub stats
    """
    cache_key = f"github:stats:{project_id}"
    
    try:
        # Try cache first
        cached = redis_client.get(cache_key)
        if cached:
            logger.info(f"Cache hit for project {project_id}")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Redis cache read failed: {e}")
    
    # Fetch from GitHub
    from app.services.github_service import fetch_github_stats
    stats = await fetch_github_stats(repo_name)
    
    try:
        # Cache for 1 hour
        redis_client.setex(
            cache_key,
            3600,  # 1 hour in seconds
            json.dumps(stats)
        )
        logger.info(f"Cached GitHub stats for project {project_id}")
    except Exception as e:
        logger.warning(f"Redis cache write failed: {e}")
    
    return stats

async def invalidate_github_cache(project_id: str):
    """
    Manually invalidate cache (call after manual sync)
    
    Args:
        project_id: UUID of the project
    """
    cache_key = f"github:stats:{project_id}"
    try:
        redis_client.delete(cache_key)
        logger.info(f"Invalidated cache for project {project_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate cache: {e}")

async def get_or_set_cache(key: str, value_func, expire: int = 3600):
    """
    Generic cache get or set function
    
    Args:
        key: Cache key
        value_func: Async function to call if cache miss
        expire: Expiration in seconds (default 1 hour)
        
    Returns:
        Cached or freshly fetched value
    """
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Cache read error for {key}: {e}")
    
    # Fetch fresh value
    value = await value_func()
    
    try:
        redis_client.setex(key, expire, json.dumps(value))
    except Exception as e:
        logger.warning(f"Cache write error for {key}: {e}")
    
    return value
```

---

## PART 5: WHATSAPP SERVICE

### File: backend/app/services/whatsapp_service.py
```python
from twilio.rest import Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

twilio_client = Client(
    settings.TWILIO_ACCOUNT_SID,
    settings.TWILIO_AUTH_TOKEN
)

async def send_whatsapp_message(to_number: str, message: str) -> bool:
    """
    Send WhatsApp message via Twilio
    
    Args:
        to_number: Phone number in format +919876543210
        message: Message text to send
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure number has whatsapp: prefix
        if not to_number.startswith('whatsapp:'):
            to_number = f'whatsapp:{to_number}'
        
        result = twilio_client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message
        )
        
        logger.info(f"WhatsApp message sent to {to_number}. SID: {result.sid}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message to {to_number}: {e}")
        return False

async def send_whatsapp_with_media(to_number: str, message: str, media_url: str) -> bool:
    """
    Send WhatsApp message with media (image/PDF)
    
    Args:
        to_number: Phone number
        message: Message text
        media_url: Public URL of media file
        
    Returns:
        True if successful
    """
    try:
        if not to_number.startswith('whatsapp:'):
            to_number = f'whatsapp:{to_number}'
        
        result = twilio_client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=to_number,
            body=message,
            media_url=[media_url]
        )
        
        logger.info(f"WhatsApp message with media sent to {to_number}. SID: {result.sid}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send WhatsApp with media to {to_number}: {e}")
        return False
```

---

## PART 6: CHAT API ENDPOINT

### File: backend/app/api/v1/chat.py
```python
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.project import Project
from app.models.milestone import Milestone
from app.models.chat_history import ChatHistory
from app.services.ai_service import generate_client_response
from app.services.cache_service import get_github_stats_cached
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class ChatRequest(BaseModel):
    phone: str
    message: str

class ChatResponse(BaseModel):
    response: str
    client_name: str
    project_name: str
    success: bool

@router.post("/", response_model=ChatResponse)
async def handle_chat(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Handle incoming chat message from client
    
    This endpoint:
    1. Identifies client by phone number
    2. Fetches their active project
    3. Gets cached GitHub stats
    4. Generates AI response using Claude
    5. Saves chat history
    6. Returns response to be sent via WhatsApp
    """
    
    # Normalize phone number
    phone = request.phone.strip().replace('whatsapp:', '')
    
    # 1. Find client by phone
    client = db.query(Client).filter(
        Client.phone == phone,
        Client.is_active == True
    ).first()
    
    if not client:
        logger.warning(f"Client not found for phone: {phone}")
        raise HTTPException(
            status_code=404,
            detail="Client not found. Please contact your project manager."
        )
    
    # 2. Get active project
    project = db.query(Project).filter(
        Project.client_id == client.id,
        Project.status == 'active'
    ).first()
    
    if not project:
        response_text = f"Hi {client.name}! You don't have any active projects right now. Please contact your project manager if you think this is a mistake. 🙏"
        
        # Save chat history
        chat_entry = ChatHistory(
            client_id=client.id,
            message=request.message,
            response=response_text,
            tokens_used=0,
            model_used="no_project"
        )
        db.add(chat_entry)
        db.commit()
        
        return ChatResponse(
            response=response_text,
            client_name=client.name,
            project_name="N/A",
            success=True
        )
    
    # 3. Get GitHub stats (cached)
    github_stats = {}
    if project.github_repo:
        try:
            github_stats = await get_github_stats_cached(
                str(project.id),
                project.github_repo
            )
        except Exception as e:
            logger.error(f"Failed to fetch GitHub stats: {e}")
            github_stats = {
                "commits_last_7_days": 0,
                "open_issues": 0,
                "closed_issues": 0,
                "progress_percent": 0
            }
    
    # 4. Get milestones
    milestones = db.query(Milestone).filter(
        Milestone.project_id == project.id
    ).order_by(Milestone.created_at).all()
    
    milestone_data = [
        {
            "title": m.title,
            "status": m.status,
            "progress": m.progress,
            "due_date": m.due_date.isoformat() if m.due_date else None
        }
        for m in milestones
    ]
    
    # 5. Generate AI response
    ai_response = await generate_client_response(
        client_name=client.name,
        project_name=project.name,
        github_stats=github_stats,
        milestones=milestone_data,
        client_question=request.message
    )
    
    # 6. Save chat history
    chat_entry = ChatHistory(
        client_id=client.id,
        project_id=project.id,
        message=request.message,
        response=ai_response["response"],
        tokens_used=ai_response.get("tokens_used", 0),
        model_used=ai_response.get("model", "unknown")
    )
    db.add(chat_entry)
    db.commit()
    
    logger.info(f"Chat processed for client {client.name}. Tokens: {ai_response.get('tokens_used', 0)}")
    
    return ChatResponse(
        response=ai_response["response"],
        client_name=client.name,
        project_name=project.name,
        success=ai_response.get("success", True)
    )

@router.get("/history/{client_id}")
async def get_chat_history(
    client_id: str,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Get chat history for a client
    """
    history = db.query(ChatHistory).filter(
        ChatHistory.client_id == client_id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()
    
    return {
        "client_id": client_id,
        "count": len(history),
        "messages": [
            {
                "id": str(h.id),
                "message": h.message,
                "response": h.response,
                "created_at": h.created_at.isoformat()
            }
            for h in history
        ]
    }
```

---

## PART 7: WHATSAPP WEBHOOK

### File: backend/app/api/v1/whatsapp.py
```python
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.services.whatsapp_service import send_whatsapp_message
from app.api.v1.chat import handle_chat, ChatRequest
from app.database import SessionLocal
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/webhook")
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Receive incoming WhatsApp messages from Twilio
    
    Twilio sends form data with fields:
    - From: whatsapp:+919876543210
    - Body: The message text
    - MessageSid: Unique message ID
    """
    try:
        form_data = await request.form()
        
        # Extract data
        from_number = form_data.get("From", "").replace("whatsapp:", "")
        message_body = form_data.get("Body", "")
        message_sid = form_data.get("MessageSid", "")
        
        logger.info(f"Received WhatsApp message from {from_number}: {message_body[:50]}...")
        
        if not from_number or not message_body:
            logger.warning("Invalid webhook data received")
            return {"status": "ignored", "reason": "missing_data"}
        
        # Process in background
        background_tasks.add_task(
            process_whatsapp_message,
            from_number,
            message_body,
            message_sid
        )
        
        return {"status": "processing"}
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

async def process_whatsapp_message(phone: str, message: str, message_sid: str):
    """
    Background task to process message and send reply
    
    Args:
        phone: Client phone number
        message: Message text
        message_sid: Twilio message ID
    """
    db = SessionLocal()
    
    try:
        # Get AI response via chat endpoint
        chat_response = await handle_chat(
            ChatRequest(phone=phone, message=message),
            BackgroundTasks(),
            db
        )
        
        # Send reply via WhatsApp
        success = await send_whatsapp_message(
            to_number=phone,
            message=chat_response.response
        )
        
        if success:
            logger.info(f"Reply sent to {phone} for message {message_sid}")
        else:
            logger.error(f"Failed to send reply to {phone}")
            
    except HTTPException as e:
        # Client not found or other API error
        error_message = "Sorry, I couldn't process your message. Please contact your project manager directly. 🙏"
        await send_whatsapp_message(phone, error_message)
        logger.error(f"Chat handler error: {e.detail}")
        
    except Exception as e:
        # Unexpected error
        logger.error(f"Unexpected error processing WhatsApp message: {e}")
        error_message = "Sorry, something went wrong. Please try again later or contact support."
        await send_whatsapp_message(phone, error_message)
        
    finally:
        db.close()

@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Twilio webhook verification endpoint
    """
    return {"status": "active", "message": "WhatsApp webhook is ready"}
```

---

## PART 8: CELERY CONFIGURATION

### File: backend/app/tasks/celery_app.py
```python
from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    'tasks',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='Asia/Kolkata',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
)

# Schedule: Sync GitHub repos every hour
celery_app.conf.beat_schedule = {
    'sync-github-repos-hourly': {
        'task': 'app.tasks.github_sync.sync_all_github_repos',
        'schedule': 3600.0,  # Every 1 hour
    },
}
```

---

## PART 9: GITHUB SYNC TASKS

### File: backend/app/tasks/github_sync.py
```python
from celery import shared_task
from app.database import SessionLocal
from app.models.project import Project
from app.models.github_cache import GitHubCache
from app.services.github_service import fetch_github_stats
from datetime import datetime
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
            Project.github_sync_enabled == True,
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
        import asyncio
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
        import asyncio
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
```

---

## PART 10: UPDATE MAIN APP

### File: backend/app/main.py (ADD THESE LINES)
```python
# Add these imports at the top
from app.api.v1 import chat, whatsapp

# Add these routers after existing routers
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(whatsapp.router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
```

---

## PART 11: UPDATE REQUIREMENTS

### File: backend/requirements.txt (ADD THESE)

```
# Add these to existing requirements.txt
anthropic==0.18.1
PyGithub==2.1.1
twilio==8.11.1
redis==5.0.1
celery==5.3.6
```

---

## PART 12: UPDATE ENV VARIABLES

### File: backend/.env (ADD THESE)

```bash
# AI
ANTHROPIC_API_KEY=sk-ant-api03-xxx
OPENAI_API_KEY=sk-xxx  # Optional fallback

# GitHub
GITHUB_TOKEN=ghp_xxx

# WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Redis (for Celery + Cache)
REDIS_URL=redis://default:xxx@fly.upstash.io:6379
```

---

## PART 13: ALEMBIC MIGRATION

### Run this to create migration:

```bash
cd backend
alembic revision --autogenerate -m "Add GitHub cache table"
alembic upgrade head
```

---

## PART 14: RUNNING CELERY

### Terminal 1: Start Celery Worker

```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

### Terminal 2: Start Celery Beat (Scheduler)

```bash
cd backend
celery -A app.tasks.celery_app beat --loglevel=info
```

### OR Combined (Development Only):

```bash
cd backend
celery -A app.tasks.celery_app worker --beat --loglevel=info
```

---

## PART 15: TESTING

### Test AI Service:

```python
# test_ai.py
import asyncio
from app.services.ai_service import generate_client_response

async def test():
    response = await generate_client_response(
        client_name="Test Client",
        project_name="Test Project",
        github_stats={
            "commits_last_7_days": 15,
            "open_issues": 3,
            "closed_issues": 7,
            "progress_percent": 70
        },
        milestones=[
            {"title": "Homepage", "status": "completed", "progress": 100},
            {"title": "Payment", "status": "in_progress", "progress": 75}
        ],
        client_question="What's the status?"
    )
    print(response)

asyncio.run(test())
```

### Run Test:

```bash
cd backend
python test_ai.py
```

---

## DELIVERABLES CHECKLIST

Generate and verify:
- [x] GitHubCache model
- [x] AI service with Claude integration
- [x] GitHub service with stats fetching
- [x] Redis caching layer
- [x] WhatsApp service (Twilio)
- [x] Chat API endpoint
- [x] WhatsApp webhook handler
- [x] Celery configuration
- [x] GitHub sync background tasks
- [x] Updated main.py with new routers
- [x] Updated requirements.txt
- [x] Environment variable documentation
- [x] Test scripts

---

Generate the complete AI integration code now with all these files.
