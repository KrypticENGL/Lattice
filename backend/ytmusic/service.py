"""FastAPI wrapper around ytmusicapi for the dashboard's YouTube Music tab.

Auth uses Google's OAuth device-code flow (the one ytmusicapi's own CLI
walks through interactively) so it works headlessly from a browser button
instead of a terminal prompt. The resulting token is refreshed and
persisted to `token.json` by ytmusicapi itself (see `RefreshingToken`) —
this service never touches the client secret's raw HTTP calls beyond what
ytmusicapi already does.

Single-user, local-dev tool: one global token file, one pending device
flow at a time. Not meant to serve multiple concurrent YouTube accounts.
"""

import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth import OAuthCredentials
from ytmusicapi.auth.oauth.exceptions import BadOAuthClient, UnauthorizedOAuthClient
from ytmusicapi.auth.oauth.token import RefreshingToken

load_dotenv(Path(__file__).parent / ".env")

CLIENT_ID = os.environ["YTMUSIC_CLIENT_ID"]
CLIENT_SECRET = os.environ["YTMUSIC_CLIENT_SECRET"]
TOKEN_PATH = Path(__file__).parent / "token.json"

credentials = OAuthCredentials(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)

app = FastAPI()

_pending_device: dict[str, Any] | None = None


def _ytmusic() -> YTMusic:
    if not TOKEN_PATH.exists():
        raise HTTPException(status_code=401, detail="Not connected to YouTube Music.")
    return YTMusic(auth=str(TOKEN_PATH), oauth_credentials=credentials)


def _simplify_track(item: dict[str, Any]) -> dict[str, Any] | None:
    video_id = item.get("videoId")
    if not video_id:
        return None
    artists = item.get("artists") or []
    thumbnails = item.get("thumbnails") or []
    return {
        "videoId": video_id,
        "title": item.get("title"),
        "artist": ", ".join(a["name"] for a in artists if a.get("name")),
        "thumbnail": thumbnails[-1]["url"] if thumbnails else None,
        "duration": item.get("duration"),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/status")
def auth_status() -> dict[str, bool]:
    return {"connected": TOKEN_PATH.exists()}


@app.post("/auth/disconnect")
def auth_disconnect() -> dict[str, bool]:
    TOKEN_PATH.unlink(missing_ok=True)
    return {"connected": False}


@app.post("/auth/device/start")
def auth_device_start() -> dict[str, Any]:
    global _pending_device
    try:
        code = credentials.get_code()
    except (BadOAuthClient, UnauthorizedOAuthClient) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    _pending_device = {
        "device_code": code["device_code"],
        "expires_at": time.time() + code["expires_in"],
        "interval": code.get("interval", 5),
        "next_poll_at": 0.0,
    }
    return {
        "user_code": code["user_code"],
        "verification_url": code["verification_url"],
        "expires_in": code["expires_in"],
        "interval": code.get("interval", 5),
    }


@app.post("/auth/device/poll")
def auth_device_poll() -> dict[str, str]:
    global _pending_device
    if _pending_device is None:
        raise HTTPException(
            status_code=400, detail="No pending authorization — call /auth/device/start first."
        )

    if time.time() > _pending_device["expires_at"]:
        _pending_device = None
        return {"status": "expired"}

    if time.time() < _pending_device["next_poll_at"]:
        return {"status": "pending"}
    _pending_device["next_poll_at"] = time.time() + _pending_device["interval"]

    try:
        raw_token = credentials.token_from_code(_pending_device["device_code"])
    except (BadOAuthClient, UnauthorizedOAuthClient) as e:
        _pending_device = None
        raise HTTPException(status_code=400, detail=str(e)) from e

    error = raw_token.get("error")
    if error == "authorization_pending":
        return {"status": "pending"}
    if error == "slow_down":
        _pending_device["interval"] += 5
        return {"status": "pending"}
    if error in ("access_denied", "expired_token"):
        _pending_device = None
        return {"status": "denied" if error == "access_denied" else "expired"}
    if error:
        _pending_device = None
        raise HTTPException(status_code=400, detail=f"YouTube auth error: {error}")

    refresh_expires_in = raw_token.get("refresh_token_expires_in", raw_token["expires_in"])
    token = RefreshingToken(
        credentials=credentials,
        access_token=raw_token["access_token"],
        refresh_token=raw_token["refresh_token"],
        scope=raw_token["scope"],
        token_type=raw_token["token_type"],
        expires_in=refresh_expires_in,
    )
    token.update(raw_token)
    token.local_cache = TOKEN_PATH  # writes token.json

    _pending_device = None
    return {"status": "connected"}


@app.get("/search")
def search(q: str, limit: int = 20) -> list[dict[str, Any]]:
    results = _ytmusic().search(q, filter="songs", limit=limit)
    return [t for t in (_simplify_track(item) for item in results) if t]


@app.get("/library/playlists")
def library_playlists() -> list[dict[str, Any]]:
    playlists = _ytmusic().get_library_playlists()
    return [
        {
            "playlistId": p.get("playlistId"),
            "title": p.get("title"),
            "thumbnail": (p.get("thumbnails") or [{}])[-1].get("url"),
            "count": p.get("count"),
        }
        for p in playlists
    ]


@app.get("/library/songs")
def library_songs(limit: int = 25) -> list[dict[str, Any]]:
    songs = _ytmusic().get_library_songs(limit=limit)
    return [t for t in (_simplify_track(item) for item in songs) if t]


@app.get("/playlist/{playlist_id}")
def playlist_tracks(playlist_id: str, limit: int = 100) -> list[dict[str, Any]]:
    playlist = _ytmusic().get_playlist(playlist_id, limit=limit)
    return [t for t in (_simplify_track(item) for item in playlist.get("tracks", [])) if t]
