from typing import Annotated, List
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse
from app.utils.api_key_auth import get_current_user_or_api_key
from app.utils.tenant_context import TenantContext, get_tenant_context_dual, shadow_verify_read

router = APIRouter()
CLIENT_NOT_FOUND = "Client not found"
MAX_LIST_LIMIT = 100


def _clamp_pagination(skip: int, limit: int) -> tuple[int, int]:
    """Postgres raises InvalidRowCountInResultOffsetClause on a negative
    OFFSET/LIMIT (500); SQLite silently tolerates it, which is why this was
    invisible until it hit production. Clamp before it reaches the query."""
    return max(skip, 0), min(max(limit, 1), MAX_LIST_LIMIT)


def _org_scoped_client_count(db: Session, org_id: UUID) -> int:
    return (
        db.query(Client)
        .filter(Client.org_id == org_id, Client.deleted_at.is_(None))
        .count()
    )


@router.get("", response_model=List[ClientResponse])
async def list_clients(*,
    skip: int = 0,
    limit: int = 100,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
    tenant: Annotated[TenantContext, Depends(get_tenant_context_dual)],
):
    """List all clients for the current user."""
    skip, limit = _clamp_pagination(skip, limit)
    base_query = db.query(Client).filter(
        Client.user_id == current_user.id, Client.deleted_at.is_(None)
    )
    legacy_total = base_query.count()
    shadow_verify_read(db, tenant, "clients", _org_scoped_client_count, legacy_total)

    clients = base_query.offset(skip).limit(limit).all()
    return clients


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(*,
    client_data: ClientCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
    tenant: Annotated[TenantContext, Depends(get_tenant_context_dual)],
):
    """Create a new client."""
    # Check phone uniqueness within this user's clients only
    existing_client = (
        db.query(Client)
        .filter(Client.phone == client_data.phone, Client.user_id == current_user.id, Client.deleted_at.is_(None))
        .first()
    )
    if existing_client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a client with this phone number"
        )

    db_client = Client(
        user_id=current_user.id,
        org_id=tenant.org_id,  # Phase 1 Milestone 3 dual-write; None when the flag is off
        name=client_data.name,
        phone=client_data.phone,
        email=client_data.email,
        company=client_data.company,
        telegram_chat_id=client_data.telegram_chat_id,
    )

    try:
        db.add(db_client)
        db.commit()
        db.refresh(db_client)
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Failed to create client: {e}", exc_info=True)
        # Match on the DB constraint name, not str(e) — SQLAlchemy's exception
        # string includes the full compiled INSERT statement (every column
        # name, including telegram_chat_id), so a substring check like
        # "telegram" in str(e) always matched even on a plain phone conflict.
        orig = str(getattr(e, "orig", "")).lower()
        if "telegram_chat_id" in orig:
            detail = "This Telegram Chat ID is already linked to another client"
        elif "phone" in orig:
            detail = "This phone number is already in use"
        elif "unique" in orig or "duplicate" in orig:
            detail = "A unique constraint was violated"
        else:
            detail = None
        if detail:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create client: {type(e).__name__}"
        )
    
    # Send welcome notification via WhatsApp (background)
    if db_client.phone:
        from app.services.notification_service import on_client_created
        background_tasks.add_task(
            on_client_created,
            client_name=db_client.name,
            client_phone=db_client.phone,
            agency_name=current_user.agency_name
        )
    
    return db_client


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(*, 
    client_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Get a specific client by ID."""
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.user_id == current_user.id, Client.deleted_at.is_(None))
        .first()
    )
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=CLIENT_NOT_FOUND
        )
    
    return client


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(*, 
    client_id: UUID,
    client_data: ClientUpdate,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Update a client."""
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.user_id == current_user.id, Client.deleted_at.is_(None))
        .first()
    )
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=CLIENT_NOT_FOUND
        )
    
    # Check phone uniqueness within this user's clients only
    if client_data.phone and client_data.phone != client.phone:
        existing_client = (
            db.query(Client)
            .filter(Client.phone == client_data.phone, Client.user_id == current_user.id, Client.deleted_at.is_(None))
            .first()
        )
        if existing_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a client with this phone number"
            )
    
    # Update fields
    update_data = client_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)
    
    try:
        db.commit()
        db.refresh(client)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update client"
        )
    
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(*, 
    client_id: UUID,
    db: Annotated[Session , Depends(get_db)],
    current_user: Annotated[User , Depends(get_current_user_or_api_key)],
):
    """Delete a client."""
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.user_id == current_user.id, Client.deleted_at.is_(None))
        .first()
    )
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=CLIENT_NOT_FOUND
        )
    
    try:
        client.deleted_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete client"
        )
    
    return None
