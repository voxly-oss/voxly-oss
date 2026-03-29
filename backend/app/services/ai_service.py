"""
Voxly AI Service — Orchestrator for AI-powered client responses.

This module uses the pluggable provider system from ai_providers/.
It delegates actual AI calls to the configured provider (Claude, OpenAI, etc.)
while handling context building, logging, and error handling.

Usage:
    from app.services.ai_service import generate_client_response
    
    result = await generate_client_response(
        client_name="Acme Corp",
        project_name="Website Redesign",
        github_stats={...},
        milestones=[...],
        client_question="What's the status?"
    )
"""

from app.services.ai_providers import get_provider, DEFAULT_PROVIDER
from app.services.ai_providers.base import build_context, SYSTEM_PROMPT
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)


async def generate_client_response(
    client_name: str,
    project_name: str,
    github_stats: Dict,
    milestones: List[Dict],
    client_question: str,
    media_url: str = None,
    provider_name: str = None,
    api_key: str = None,
) -> Dict[str, Any]:
    """
    Generate AI response using the configured provider.
    
    Args:
        client_name: Name of the client
        project_name: Name of the project
        github_stats: Dictionary with GitHub statistics
        milestones: List of milestone dictionaries
        client_question: The question asked by client
        provider_name: AI provider to use (default: claude)
        api_key: Optional user-provided API key (BYOK)
        
    Returns:
        Dictionary with response, tokens_used, model, and provider info
    """
    
    # Build context (same for all providers)
    context = build_context(
        client_name=client_name,
        project_name=project_name,
        github_stats=github_stats,
        milestones=milestones,
        client_question=client_question,
    )
    
    # Instantiate the Agent
    # We create a new instance per request to ensure statelessness for tools if needed,
    # though tools are mostly stateless.
    from app.services.ai_agent import VoxlyAgent
    
    try:
        agent = VoxlyAgent(
            provider_name=provider_name or DEFAULT_PROVIDER,
            api_key=api_key
        )
        
        # Run the ReAct Loop
        # We pass the pre-calculated context as background information
        logger.info(f"Delegating request to VoxlyAgent for client {client_name}")
        
        result = await agent.chat(
            user_message=client_question,
            images=[media_url] if media_url else None,
            context=context
        )
        
        if not result["success"]:
            raise RuntimeError(result.get("error") or "AI response generation failed")
            
        logger.info(
            f"VoxlyAgent success. Steps: {result.get('steps')}, "
            f"Tokens: {result.get('tokens_used')}"
        )
        
        return {
            "response": result["response"],
            "tokens_used": result.get("tokens_used", 0),
            "model": result.get("model", "unknown"),
            "provider": provider_name or DEFAULT_PROVIDER,
            "success": True,
            "error": None,
        }
        
    except Exception as e:
        logger.error(f"VoxlyAgent error: {e}")
        return {
            "response": f"Hi {client_name}! The AI service is temporarily unavailable. Please try again shortly. 🙏",
            "tokens_used": 0,
            "model": "error",
            "provider": provider_name or DEFAULT_PROVIDER,
            "success": False,
            "error": str(e),
        }
