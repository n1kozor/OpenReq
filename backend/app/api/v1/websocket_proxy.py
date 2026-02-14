"""
WebSocket proxy endpoint — allows frontend to test WebSocket connections.
"""
import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws-proxy")
async def websocket_proxy(websocket: WebSocket):
    """
    WebSocket proxy.
    Client sends a JSON command to connect/send/disconnect.

    Protocol:
    1. Client sends: {"action": "connect", "url": "ws://...", "headers": {...}}
    2. Server responds: {"type": "connected"} or {"type": "error", "message": "..."}
    3. Client sends: {"action": "send", "data": "..."}
    4. Server forwards messages: {"type": "message", "data": "...", "timestamp": ...}
    5. Client sends: {"action": "disconnect"}
    6. Server responds: {"type": "disconnected"}
    """
    await websocket.accept()

    remote_ws = None
    receive_task = None

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                cmd = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            action = cmd.get("action", "")

            if action == "connect":
                target_url = cmd.get("url", "")
                ws_headers = cmd.get("headers", {})

                if not target_url:
                    await websocket.send_json({"type": "error", "message": "URL is required"})
                    continue

                # Close existing connection if any
                if remote_ws:
                    try:
                        await remote_ws.close()
                    except Exception:
                        pass
                    if receive_task:
                        receive_task.cancel()

                try:
                    import websockets
                    remote_ws = await websockets.connect(
                        target_url,
                        additional_headers=ws_headers,
                        open_timeout=10,
                    )

                    await websocket.send_json({
                        "type": "connected",
                        "url": target_url,
                        "timestamp": time.time() * 1000,
                    })

                    # Start forwarding messages from remote to client
                    async def forward_messages():
                        try:
                            async for message in remote_ws:
                                await websocket.send_json({
                                    "type": "message",
                                    "data": message if isinstance(message, str) else message.decode("utf-8", errors="replace"),
                                    "timestamp": time.time() * 1000,
                                    "direction": "received",
                                })
                        except Exception as e:
                            await websocket.send_json({
                                "type": "disconnected",
                                "reason": str(e),
                                "timestamp": time.time() * 1000,
                            })

                    receive_task = asyncio.create_task(forward_messages())

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Connection failed: {e}",
                        "timestamp": time.time() * 1000,
                    })
                    remote_ws = None

            elif action == "send":
                if not remote_ws:
                    await websocket.send_json({"type": "error", "message": "Not connected"})
                    continue

                data = cmd.get("data", "")
                try:
                    await remote_ws.send(data)
                    await websocket.send_json({
                        "type": "message",
                        "data": data,
                        "timestamp": time.time() * 1000,
                        "direction": "sent",
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Send failed: {e}",
                    })

            elif action == "disconnect":
                if remote_ws:
                    try:
                        await remote_ws.close()
                    except Exception:
                        pass
                    if receive_task:
                        receive_task.cancel()
                    remote_ws = None

                await websocket.send_json({
                    "type": "disconnected",
                    "timestamp": time.time() * 1000,
                })

    except WebSocketDisconnect:
        logger.info("Client disconnected from WS proxy")
    finally:
        if remote_ws:
            try:
                await remote_ws.close()
            except Exception:
                pass
        if receive_task:
            receive_task.cancel()
