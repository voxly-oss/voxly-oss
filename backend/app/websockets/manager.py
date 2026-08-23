from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


def build_event(
    event: str,
    payload: dict,
    conversation_id: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> dict:
    """Standardized realtime event envelope (Phase 3 Milestone 4).

    Every broadcast event uses this exact shape:
      event: dotted event name, e.g. "conversation.message_completed"
      timestamp: real send-time, UTC, ISO 8601
      conversation_id: the client's id (this system has no separate
        "conversation" entity — a conversation IS a client's thread, matching
        how Milestones 1-3 already modeled it)
      organization_id: the client's org_id if one has been stamped (Phase 1
        dual-write), else None — "if applicable", not fabricated when absent
      payload: event-specific data
    """
    return {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "conversation_id": conversation_id,
        "organization_id": organization_id,
        "payload": payload,
    }


class ConnectionManager:
    """
    Manages active WebSocket connections for real-time chat updates.

    Supports multiple tabs per user (stores list of WebSockets per user_id).
    Automatically cleans up stale/broken connections on broadcast failure.

    Conversation subscription (Phase 3 Milestone 4): a connection may
    optionally restrict itself to specific conversation_ids via
    set_subscription(). A connection with no subscription set (the default,
    and the only behavior that existed before this milestone) receives every
    event for its tenant, unchanged — this is purely additive, no existing
    consumer needs to change to keep working exactly as it does today.

    Known limitation, not fixed by this milestone: this is pure in-process
    memory, not backed by Redis or any cross-instance pub/sub. Cloud Run's
    voxly-backend service has autoscaling.knative.dev/maxScale=12 — if
    traffic ever causes horizontal scaling beyond a single instance, a
    broadcast triggered by a webhook landing on instance A will never reach
    a browser tab connected to instance B. Documented in the Milestone 4
    report; fixing it means introducing shared pub/sub infrastructure, which
    is out of this milestone's scope ("Only WebSocket runtime").
    """
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # None = no filter, receive everything (default / backward compatible).
        # A set = only receive events whose conversation_id is in the set.
        self.subscriptions: Dict[WebSocket, Optional[Set[str]]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a new WebSocket connection and register it."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        self.subscriptions[websocket] = None

        total = sum(len(v) for v in self.active_connections.values())
        logger.info(
            f"User {user_id} connected via WebSocket. "
            f"Active: {len(self.active_connections[user_id])} tabs, "
            f"Total connections: {total}"
        )

    def set_subscription(self, websocket: WebSocket, conversation_ids: Optional[Set[str]]) -> None:
        """Restrict a connection to only receive events for the given
        conversation_ids. Pass None (or an empty/absent list from the client)
        to go back to receiving everything for the tenant."""
        self.subscriptions[websocket] = conversation_ids if conversation_ids else None

    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        self.subscriptions.pop(websocket, None)

        total = sum(len(v) for v in self.active_connections.values())
        logger.info(
            f"User {user_id} disconnected from WebSocket. "
            f"Total connections: {total}"
        )

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific WebSocket."""
        await websocket.send_text(message)

    async def broadcast(self, message: dict, user_id: str, conversation_id: Optional[str] = None):
        """
        Broadcast a message to connected WebSockets for a specific user —
        never to any other tenant (dict is keyed by user_id, so this call
        can only ever reach that one user's own connections; O(that user's
        own tab count), not O(all connected users) system-wide).

        If conversation_id is given and a connection has an active
        subscription filter that doesn't include it, that connection is
        skipped — conversation isolation for any tab that opted in via
        set_subscription(); unfiltered connections (the default) still
        receive everything, unchanged from pre-Milestone-4 behavior.

        Automatically cleans up broken/stale connections on send failure.
        """
        if user_id not in self.active_connections:
            return

        stale_connections = []

        for connection in self.active_connections[user_id]:
            subs = self.subscriptions.get(connection)
            if subs is not None and conversation_id is not None and conversation_id not in subs:
                continue
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(
                    f"Failed to send to user {user_id}, "
                    f"marking connection as stale: {e}"
                )
                stale_connections.append(connection)

        # Clean up stale connections
        for stale in stale_connections:
            if stale in self.active_connections.get(user_id, []):
                self.active_connections[user_id].remove(stale)
                self.subscriptions.pop(stale, None)
                try:
                    await stale.close()
                except Exception:
                    pass

        # Remove user entry if no connections left
        if user_id in self.active_connections and not self.active_connections[user_id]:
            del self.active_connections[user_id]

        if stale_connections:
            logger.info(
                f"Cleaned up {len(stale_connections)} stale connection(s) "
                f"for user {user_id}"
            )

    def get_connection_count(self) -> int:
        """Get total number of active WebSocket connections."""
        return sum(len(v) for v in self.active_connections.values())

    def get_connected_users(self) -> List[str]:
        """Get list of user IDs with active connections."""
        return list(self.active_connections.keys())


manager = ConnectionManager()
