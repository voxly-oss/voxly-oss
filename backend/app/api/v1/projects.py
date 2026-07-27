from typing import Annotated, List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.utils.api_key_auth import get_current_user_or_api_key
from app.utils.tenant_context import TenantContext, get_tenant_context_dual, shadow_verify_read

router = APIRouter()
PROJECT_NOT_FOUND = "Project not found"
MAX_LIST_LIMIT = 100


def _clamp_pagination(skip: int, limit: int) -> tuple[int, int]:
    """Postgres raises InvalidRowCountInResultOffsetClause on a negative
    OFFSET/LIMIT (500); SQLite silently tolerates it, which is why this was
    invisible until it hit production. Clamp before it reaches the query."""
    return max(skip, 0), min(max(limit, 1), MAX_LIST_LIMIT)


def get_user_client_ids(db: Session, user_id: UUID) -> List[UUID]:
    """Get all client IDs belonging to a user."""
    clients = db.query(Client.id).filter(Client.user_id == user_id).all()
    return [client.id for client in clients]


def _make_org_scoped_project_count(client_id: Optional[UUID] = None):
    """Returns an (db, org_id) -> int counter matching whatever client_id
    filter, if any, the legacy query applied — an unfiltered org-wide count
    would never agree with a client-filtered legacy count and would report
    a false mismatch that has nothing to do with tenancy correctness."""
    def _count(db: Session, org_id: UUID) -> int:
        q = db.query(Project).filter(Project.org_id == org_id, Project.deleted_at.is_(None))
        if client_id:
            q = q.filter(Project.client_id == client_id)
        return q.count()
    return _count


@router.get("", response_model=List[ProjectResponse])
async def list_projects(*,
    client_id: UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
    tenant: Annotated[TenantContext, Depends(get_tenant_context_dual)],
):
    """List all projects for the current user's clients."""
    skip, limit = _clamp_pagination(skip, limit)
    user_client_ids = get_user_client_ids(db, current_user.id)

    query = (
        db.query(Project)
        .options(selectinload(Project.github_cache))
        .filter(Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None))
    )

    # Filter by specific client if provided
    if client_id:
        if client_id not in user_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this client"
            )
        query = query.filter(Project.client_id == client_id)

    legacy_total = query.count()
    shadow_verify_read(
        db, tenant, "projects", _make_org_scoped_project_count(client_id), legacy_total
    )

    projects = query.offset(skip).limit(limit).all()
    return projects


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(*,
    project_data: ProjectCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
    tenant: Annotated[TenantContext, Depends(get_tenant_context_dual)],
):
    """Create a new project."""
    # Verify client belongs to current user
    client = (
        db.query(Client)
        .filter(Client.id == project_data.client_id, Client.user_id == current_user.id)
        .first()
    )

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or access denied"
        )

    db_project = Project(
        client_id=project_data.client_id,
        org_id=tenant.org_id,  # Phase 1 Milestone 3 dual-write; None when the flag is off
        name=project_data.name,
        description=project_data.description,
        github_repo=project_data.github_repo,
        github_sync_enabled=project_data.github_sync_enabled,
        status=project_data.status,
        start_date=project_data.start_date,
        expected_end_date=project_data.expected_end_date,
    )
    
    try:
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project"
        )
    
    # Send project started notification (background)
    if client.phone:
        from app.services.notification_service import on_project_created
        background_tasks.add_task(
            on_project_created,
            client_name=client.name,
            client_phone=client.phone,
            project_name=db_project.name
        )
    
    return db_project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(*, 
    project_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Get a specific project by ID."""
    user_client_ids = get_user_client_ids(db, current_user.id)

    project = (
        db.query(Project)
        .options(selectinload(Project.github_cache))
        .filter(Project.id == project_id, Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None))
        .first()
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=PROJECT_NOT_FOUND
        )
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(*, 
    project_id: UUID,
    project_data: ProjectUpdate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Update a project."""
    user_client_ids = get_user_client_ids(db, current_user.id)
    
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None))
        .first()
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=PROJECT_NOT_FOUND
        )
    
    # Check if status is changing to completed
    old_status = project.status
    
    # Update fields
    update_data = project_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    
    try:
        db.commit()
        db.refresh(project)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update project"
        )
    
    # Send project completed notification if status just changed to completed
    if old_status != "completed" and project.status == "completed":
        client = db.query(Client).filter(Client.id == project.client_id).first()
        if client and client.phone:
            from app.services.notification_service import on_project_completed
            background_tasks.add_task(
                on_project_completed,
                client_name=client.name,
                client_phone=client.phone,
                project_name=project.name,
                agency_name=current_user.agency_name
            )
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(*, 
    project_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Delete a project."""
    user_client_ids = get_user_client_ids(db, current_user.id)
    
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.client_id.in_(user_client_ids), Project.deleted_at.is_(None))
        .first()
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=PROJECT_NOT_FOUND
        )
    
    try:
        project.deleted_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project"
        )
    
    return None
