from fastapi import WebSocket
from typing import Dict, Set
import json
import asyncio
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for chat rooms and notification channels.
    Uses in-memory store; for multi-server deployments, extend with Redis PubSub.
    """

    def __init__(self):
        # room_id -> set of (websocket, user_id)
        self.room_connections: Dict[str, Set] = {}
        # user_id -> set of websockets (for notification channel)
        self.user_connections: Dict[str, Set] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.room_connections:
            self.room_connections[room_id] = set()
        self.room_connections[room_id].add((websocket, user_id))
        logger.info(f"User {user_id} connected to room {room_id}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.room_connections:
            self.room_connections[room_id] = {
                (ws, uid) for ws, uid in self.room_connections[room_id] if ws != websocket
            }
        logger.info(f"WebSocket disconnected from room {room_id}")

    async def connect_user(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)

    def disconnect_user(self, websocket: WebSocket, user_id: str):
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)

    async def broadcast_to_room(self, room_id: str, data: dict, exclude_user: str = None):
        if room_id not in self.room_connections:
            return
        dead = set()
        for ws, uid in self.room_connections[room_id]:
            if exclude_user and uid == exclude_user:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                dead.add((ws, uid))
        self.room_connections[room_id] -= dead

    async def send_to_user(self, user_id: str, data: dict):
        if user_id not in self.user_connections:
            return
        dead = set()
        for ws in self.user_connections[user_id]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self.user_connections[user_id] -= dead

    async def broadcast_to_users(self, user_ids: list[str], data: dict):
        await asyncio.gather(*[self.send_to_user(uid, data) for uid in user_ids])


connection_manager = ConnectionManager()
