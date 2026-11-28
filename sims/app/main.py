"""S.I.M.S. (Smart-home In Miniature Scale) as a Home Assistant app.

It serves the page through ingress, keeps the house (rooms, furniture,
devices and imported models) in /data so it is part of Home Assistant's
backups, and passes the page's websocket and REST calls through to Home
Assistant with the app's own token, since a page outside the dashboard is not
handed a connection the way a card is.

Outside Home Assistant, for development:
  HA_URL=http://homeassistant.local:8123 HA_TOKEN=<long-lived token> \
  SIMS_DATA=./data uvicorn app.main:app --port 8099
"""
import asyncio
import gzip
import json
import logging
import os
import tempfile
from pathlib import Path

import httpx
import websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sims")

HERE = Path(__file__).parent
WWW = HERE / "www"
DATA = Path(os.environ.get("SIMS_DATA") or ("/data" if Path("/data").is_dir() else HERE.parent / "data"))
DATA.mkdir(parents=True, exist_ok=True)
HOUSE = DATA / "house.json"
PREVIOUS = DATA / "house.previous.json"

TOKEN = os.environ.get("SUPERVISOR_TOKEN") or os.environ.get("HA_TOKEN")
HA_URL = os.environ.get("HA_URL", "http://supervisor/core").rstrip("/")
HA_WS = HA_URL.replace("http://", "ws://").replace("https://", "wss://") + "/websocket" if HA_URL.endswith("/core") \
    else HA_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"
HA_API = HA_URL + "/api"


app = FastAPI(title="S.I.M.S.", docs_url=None, redoc_url=None)
# The page is a few megabytes of script, which squeezes to about a third.
app.add_middleware(GZipMiddleware, minimum_size=2048)


# --------------------------------------------------------------- talking to Home Assistant

async def ha_ws_session():
    """An authenticated websocket to Home Assistant, and its version."""
    if not TOKEN:
        raise HTTPException(503, "Not connected to Home Assistant")
    ws = await websockets.connect(HA_WS, max_size=64 * 1024 * 1024, open_timeout=15)
    hello = json.loads(await ws.recv())
    if hello.get("type") != "auth_required":
        await ws.close()
        raise HTTPException(502, "Home Assistant did not ask to authenticate")
    await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
    reply = json.loads(await ws.recv())
    if reply.get("type") != "auth_ok":
        await ws.close()
        raise HTTPException(502, "Home Assistant refused the app's token")
    return ws, reply.get("ha_version", "")


# --------------------------------------------------------------- the house

def read_house():
    try:
        return json.loads(HOUSE.read_text())
    except (OSError, ValueError):
        return None


def write_house(config):
    """Written whole to a temporary file and moved into place, keeping the last one as a spare."""
    if HOUSE.exists():
        HOUSE.replace(PREVIOUS)
    fd, tmp = tempfile.mkstemp(dir=DATA, suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, separators=(",", ":"))
    os.replace(tmp, HOUSE)


@app.get("/api/house")
async def get_house():
    house = read_house()
    if house is not None:
        return {"config": house}
    # A new house starts empty, with the widgets beside it.
    return {"config": {"type": "custom:diorama-card", "rooms": [], "side_panel": True}}


@app.put("/api/house")
@app.post("/api/house")  # the page sends its last change this way as it closes
async def put_house(request: Request):
    body = await request.body()
    # The page sends it gzipped, marked with a header of its own so nothing on
    # the way through ingress tries to unpack it first.
    if request.headers.get("X-Sims-Gzip") == "1":
        try:
            body = gzip.decompress(body)
        except OSError:
            raise HTTPException(400, "Could not unpack the house")
    try:
        config = json.loads(body)
    except ValueError:
        raise HTTPException(400, "Not JSON")
    if not isinstance(config, dict) or not isinstance(config.get("rooms", []), list):
        raise HTTPException(400, "That does not look like a house")
    write_house(config)
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    """Who is looking, from the headers ingress adds."""
    return {
        "id": request.headers.get("X-Remote-User-Id", ""),
        "name": request.headers.get("X-Remote-User-Display-Name") or request.headers.get("X-Remote-User-Name") or "",
        "connected": bool(TOKEN),
    }


# --------------------------------------------------------------- passing calls through

@app.api_route("/api/ha/{path:path}", methods=["GET", "POST"])
async def ha_rest(path: str, request: Request):
    """Home Assistant's REST API, for the few things only it serves, like a calendar's events."""
    if not TOKEN:
        raise HTTPException(503, "Not connected to Home Assistant")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(request.method, f"{HA_API}/{path}", params=dict(request.query_params),
                                 content=await request.body(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))


@app.websocket("/api/websocket")
async def websocket_proxy(client: WebSocket):
    """The page's websocket, passed to Home Assistant's own once the app has signed in to it.

    The page goes through the usual handshake, so the standard client library works: it is
    asked to authenticate, and whatever it sends is answered with auth_ok.
    """
    await client.accept()
    try:
        upstream, version = await ha_ws_session()
    except Exception as e:
        log.warning("websocket to Home Assistant failed: %s", e)
        await client.send_text(json.dumps({"type": "auth_invalid", "message": "S.I.M.S. could not reach Home Assistant"}))
        await client.close()
        return
    try:
        await client.send_text(json.dumps({"type": "auth_required", "ha_version": version}))
        await client.receive_text()
        await client.send_text(json.dumps({"type": "auth_ok", "ha_version": version}))

        # Either side going away ends both directions; that is a page being
        # closed or Home Assistant restarting, not an error.
        async def down():
            try:
                async for message in upstream:
                    await client.send_text(message if isinstance(message, str) else message.decode())
            except Exception:
                return

        async def up():
            try:
                while True:
                    await upstream.send(await client.receive_text())
            except Exception:
                return

        tasks = [asyncio.create_task(down()), asyncio.create_task(up())]
        _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
    except (WebSocketDisconnect, websockets.ConnectionClosed):
        pass
    finally:
        await upstream.close()
        try:
            await client.close()
        except RuntimeError:
            pass


# --------------------------------------------------------------- the page

@app.get("/")
async def index():
    page = WWW / "index.html"
    if not page.exists():
        return Response("The S.I.M.S. page has not been built.", status_code=500)
    return FileResponse(page, headers={"Cache-Control": "no-cache"})


@app.get("/healthz")
async def healthz():
    return JSONResponse({"ok": True})


if (WWW / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WWW / "assets"), name="assets")
