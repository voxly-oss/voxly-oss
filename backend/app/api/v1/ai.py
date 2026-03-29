from fastapi import APIRouter, Depends, HTTPException, Body, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user
from app.services.ai_agent import VoxlyAgent
from app.rate_limit import limiter
from typing import Annotated, Optional, List, Dict, Any
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class AdminChatRequest(BaseModel):
    message: str
    context: Optional[str] = None # e.g. "project_id:123" or "general"

class AdminChatResponse(BaseModel):
    response: str
    tools_used: List[str] = []

from app.models.project import Project
from app.models.client import Client
from app.services.cache_service import get_github_stats_cached


async def _build_project_context(
    context: Optional[str],
    current_user: User,
    db: Session,
) -> str:
    if not context or not context.startswith("project:"):
        return ""

    try:
        project_id = context.split(":", 1)[1]
        user_client_ids = [
            client.id
            for client in db.query(Client.id).filter(Client.user_id == current_user.id).all()
        ]
        project = (
            db.query(Project)
            .filter(
                Project.id == project_id,
                Project.client_id.in_(user_client_ids),
            )
            .first()
        )
        if not project:
            return (
                "\n\n[System View]: User requested project context, "
                "but project was not found or access denied."
            )

        context_lines = [
            f"[ACTIVE CONTEXT: PROJECT '{project.name}']",
            f"ID: {project.id}",
            f"Description: {project.description or 'N/A'}",
        ]
        if project.github_repo:
            context_lines.append(f"GitHub Repo: {project.github_repo}")
            try:
                stats = await get_github_stats_cached(str(project.id), project.github_repo)
                context_lines.append(f"GitHub Stats Snapshot: {stats}")
            except Exception:
                context_lines.append(
                    "GitHub Stats: (Could not fetch cached stats, use tools if needed)"
                )

        return "\n\n" + "\n".join(context_lines)
    except Exception as exc:
        return f"\n\n[System Error]: Failed to load context data: {exc}"

@router.post("/chat", response_model=AdminChatResponse)
@limiter.limit("20/minute")
async def admin_chat(*, 
    request: AdminChatRequest,
    raw_request: Request,
    current_user: Annotated[User , Depends(get_current_user)],
    db: Annotated[Session , Depends(get_db)]
):
    """
    Chat endpoint for the Admin to talk to Voxly AI.
    Capable of using tools to fetch project status, github stats, etc.
    """
    agent = VoxlyAgent()
    
    # Construct a system prompt based on user role
    system_prompt = (
        f"You are Voxly, the AI Project Manager for {current_user.agency_name}. "
        "You are talking to the Agency Owner. "
        "Your goal is to help them manage projects, check status, and debug issues. "
        "You have access to GitHub tools and Documentation tools. "
        "Use them proactively to check project health."
    )
    
    # ── Context Enhancement ──
    context_data = await _build_project_context(request.context, current_user, db)

    # Append context to system prompt or message?
    # VoxlyAgent.chat takes `context` arg, but let's append to system prompt to be sure it sets the scene.
    if context_data:
        system_prompt += context_data
    
    # Call the agent
    try:
        response_data = await agent.chat(
            user_message=request.message,
            system_prompt=system_prompt,
            context=request.context or ""
        )
    except Exception:
        logger.exception("AI CHAT ERROR")
        # Do not expose internal exception details to the client
        return AdminChatResponse(
            response="I encountered an error processing your request. Please try again.",
            tools_used=[]
        )
    
    return AdminChatResponse(
        response=response_data.get("response", "I'm having trouble processing that."),
        tools_used=response_data.get("tools_used", [])
    )
