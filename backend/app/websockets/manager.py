from typing import List, Dict
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket connections for real-time chat updates.
    
    Supports multiple tabs per user (stores list of WebSockets per user_id).
    Automatically cleans up stale/broken connections on broadcast failure.
    """
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a new WebSocket connection and register it."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        
        total = sum(len(v) for v in self.active_connections.values())
        logger.info(
            f"User {user_id} connected via WebSocket. "
            f"Active: {len(self.active_connections[user_id])} tabs, "
            f"Total connections: {total}"
        )

    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        total = sum(len(v) for v in self.active_connections.values())
        logger.info(
            f"User {user_id} disconnected from WebSocket. "
            f"Total connections: {total}"
        )

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific WebSocket."""
        await websocket.send_text(message)

    async def broadcast(self, message: dict, user_id: str):
        """
        Broadcast a message to all connected WebSockets for a specific user.
        Automatically cleans up broken/stale connections.
        """
        if user_id not in self.active_connections:
            return

        stale_connections = []

        for connection in self.active_connections[user_id]:
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
