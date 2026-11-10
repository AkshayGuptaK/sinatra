import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/events", tags=["events"])

subscribers: set[asyncio.Queue] = set()


async def broadcast_event(event_type: str, data: dict):
    """Called by watcher/sync services when new tracks are committed."""
    message = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    for queue in list(subscribers):
        await queue.put(message)


@router.get("/stream")
async def sse_event_stream():
    queue = asyncio.Queue()
    subscribers.add(queue)

    async def event_generator():
        try:
            while True:
                data = await queue.get()
                yield data
        except asyncio.CancelledError:
            subscribers.remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
