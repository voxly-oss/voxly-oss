"""Split historical chat_history pairs into per-message `messages` rows.

Used by the add_messages_table migration and by tests. Idempotent: rows whose
chat_history id was already split (legacy_chat_history_id) are skipped, so a
re-run never duplicates. Uses lightweight table definitions, not the ORM, so
it keeps working however the models evolve.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

_chat_history = sa.table(
    "chat_history",
    sa.column("id", UUID(as_uuid=True)),
    sa.column("client_id", UUID(as_uuid=True)),
    sa.column("project_id", UUID(as_uuid=True)),
    sa.column("message", sa.Text),
    sa.column("response", sa.Text),
    sa.column("tokens_used", sa.Integer),
    sa.column("model_used", sa.String),
    sa.column("channel", sa.String),
    sa.column("language", sa.String),
    sa.column("ai_response_time_ms", sa.Integer),
    sa.column("created_at", sa.DateTime),
)

_messages = sa.table(
    "messages",
    sa.column("id", UUID(as_uuid=True)),
    sa.column("client_id", UUID(as_uuid=True)),
    sa.column("project_id", UUID(as_uuid=True)),
    sa.column("channel", sa.String),
    sa.column("direction", sa.String),
    sa.column("author_type", sa.String),
    sa.column("body", sa.Text),
    sa.column("status", sa.String),
    sa.column("reply_to_id", UUID(as_uuid=True)),
    sa.column("model_used", sa.String),
    sa.column("tokens_used", sa.Integer),
    sa.column("ai_response_time_ms", sa.Integer),
    sa.column("language", sa.String),
    sa.column("legacy_chat_history_id", UUID(as_uuid=True)),
    sa.column("created_at", sa.DateTime),
)


def backfill_messages_from_chat_history(conn, batch_size: int = 500) -> int:
    """Insert the split rows; returns how many messages were written."""
    done = {
        row[0]
        for row in conn.execute(
            sa.select(_messages.c.legacy_chat_history_id).where(_messages.c.legacy_chat_history_id.isnot(None)).distinct()
        )
    }
    written = 0
    offset = 0
    while True:
        rows = conn.execute(
            sa.select(_chat_history).order_by(_chat_history.c.created_at, _chat_history.c.id).offset(offset).limit(batch_size)
        ).fetchall()
        if not rows:
            break
        offset += len(rows)
        batch = []
        for row in rows:
            if row.id in done:
                continue
            created = row.created_at or datetime.utcnow()
            inbound_id = uuid.uuid4()
            batch.append({
                "id": inbound_id, "client_id": row.client_id, "project_id": row.project_id,
                "channel": row.channel or "whatsapp", "direction": "inbound", "author_type": "client",
                "body": row.message or "", "status": "received", "reply_to_id": None,
                "model_used": None, "tokens_used": None, "ai_response_time_ms": None,
                "language": row.language, "legacy_chat_history_id": row.id, "created_at": created,
            })
            if row.response:
                # Historic replies were handed to the webhook to send; their
                # actual delivery outcome was never recorded, so "sent" is the
                # best available truth.
                batch.append({
                    "id": uuid.uuid4(), "client_id": row.client_id, "project_id": row.project_id,
                    "channel": row.channel or "whatsapp", "direction": "outbound", "author_type": "ai",
                    "body": row.response, "status": "sent", "reply_to_id": inbound_id,
                    "model_used": row.model_used, "tokens_used": row.tokens_used,
                    "ai_response_time_ms": row.ai_response_time_ms, "language": None,
                    "legacy_chat_history_id": row.id, "created_at": created + timedelta(milliseconds=1),
                })
        if batch:
            conn.execute(_messages.insert(), batch)
            written += len(batch)
    return written
