from datetime import datetime, timezone
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.models.milestone import Milestone
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate, MilestoneResponse
from app.utils.auth import get_current_user

router = APIRouter()
MILESTONE_NOT_FOUND = "Milestone not found"


def get_user_project_ids(db: Session, user_id: UUID) -> List[UUID]:
    """Get all project IDs belonging to a user's clients."""
    projects = (
        db.query(Project.id)
        .join(Client, Client.id == Project.client_id)
        .filter(Client.user_id == user_id)
        .all()
    )
    return [project.id for project in projects]


def _get_project_progress(db: Session, project_id: UUID) -> int:
    all_milestones = db.query(Milestone).filter(Milestone.project_id == project_id).all()
    total = len(all_milestones)
    completed = sum(1 for milestone in all_milestones if milestone.status == "completed")
    return int((completed / total) * 100) if total > 0 else 0


def _queue_milestone_completed_notification(
    background_tasks: BackgroundTasks,
    db: Session,
    milestone: Milestone,
) -> None:
    project = db.query(Project).filter(Project.id == milestone.project_id).first()
    if not project:
        return

    client = db.query(Client).filter(Client.id == project.client_id).first()
    if not client or not client.phone:
        return

    from app.services.notification_service import on_milestone_completed

    background_tasks.add_task(
        on_milestone_completed,
        client_name=client.name,
        client_phone=client.phone,
        project_name=project.name,
        milestone_title=milestone.title,
        progress=_get_project_progress(db, project.id),
    )


@router.get("", response_model=List[MilestoneResponse])
async def list_milestones(*, 
    project_id: UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """List all milestones for the current user's projects."""
    user_project_ids = get_user_project_ids(db, current_user.id)
    
    query = db.query(Milestone).filter(Milestone.project_id.in_(user_project_ids))
    
    # Filter by specific project if provided
    if project_id:
        if project_id not in user_project_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project"
            )
        query = query.filter(Milestone.project_id == project_id)
    
    milestones = query.order_by(Milestone.due_date).offset(skip).limit(limit).all()
    return milestones


@router.post("", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED)
async def create_milestone(*, 
    milestone_data: MilestoneCreate,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Create a new milestone."""
    user_project_ids = get_user_project_ids(db, current_user.id)
    
    # Verify project belongs to current user's clients
    if milestone_data.project_id not in user_project_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
    
    db_milestone = Milestone(
        project_id=milestone_data.project_id,
        title=milestone_data.title,
        description=milestone_data.description,
        status=milestone_data.status,
        progress=milestone_data.progress,
        due_date=milestone_data.due_date,
    )
    
    try:
        db.add(db_milestone)
        db.commit()
        db.refresh(db_milestone)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create milestone"
        )
    
    return db_milestone


@router.get("/{milestone_id}", response_model=MilestoneResponse)
async def get_milestone(*, 
    milestone_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Get a specific milestone by ID."""
    user_project_ids = get_user_project_ids(db, current_user.id)
    
    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_id, Milestone.project_id.in_(user_project_ids))
        .first()
    )
    
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=MILESTONE_NOT_FOUND
        )
    
    return milestone


@router.put("/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(*, 
    milestone_id: UUID,
    milestone_data: MilestoneUpdate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Update a milestone."""
    user_project_ids = get_user_project_ids(db, current_user.id)
    
    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_id, Milestone.project_id.in_(user_project_ids))
        .first()
    )
    
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=MILESTONE_NOT_FOUND
        )
    
    # Track old status for notification trigger
    old_status = milestone.status
    
    # Update fields
    update_data = milestone_data.model_dump(exclude_unset=True)
    
    # Auto-set completed_at when status changes to completed
    if update_data.get("status") == "completed" and old_status != "completed":
        update_data["completed_at"] = datetime.now(timezone.utc)
    
    for field, value in update_data.items():
        setattr(milestone, field, value)
    
    try:
        db.commit()
        db.refresh(milestone)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update milestone"
        )
    
    # Send milestone completed notification
    if old_status != "completed" and milestone.status == "completed":
        _queue_milestone_completed_notification(background_tasks, db, milestone)
    
    return milestone


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(*, 
    milestone_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user)],
):
    """Delete a milestone."""
    user_project_ids = get_user_project_ids(db, current_user.id)
    
    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_id, Milestone.project_id.in_(user_project_ids))
        .first()
    )
    
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=MILESTONE_NOT_FOUND
        )
    
    try:
        db.delete(milestone)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete milestone"
        )
    
    return None
