"""
Transcription Service — Agent Vision Phase 0.

Turns an inbound voice note (WhatsApp/Telegram media URL) into text so the
existing AI pipeline can treat it exactly like a typed message.

Design notes:
  - Fully gated by settings.VOICE_TRANSCRIPTION_ENABLED at the call site; this
    module assumes it's only invoked when transcription is wanted.
  - Never raises. Any failure (missing key, bad host, oversize, network,
    provider error) returns None so the caller degrades to the pre-Phase-0 path.
  - SSRF guardrails mirror ai_agent._build_image_block: scheme + host allowlist,
    size cap, timeout. Follows redirects (Twilio media 307s to a CDN) and passes
    HTTP basic auth for Twilio media URLs.
"""
import logging
import urllib.parse
from typing import Optional, Tuple

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Hosts we will fetch audio from. Twilio (WhatsApp media) + Telegram files only.
ALLOWED_AUDIO_HOSTS = {
    "api.twilio.com",
    "media.twiliocdn.com",
    "mms.twiliocdn.com",
    "api.telegram.org",
}

# OpenAI's transcription endpoint caps upload at 25 MB; keep our own guard below it.
MAX_AUDIO_BYTES = 25 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 15.0

# Map inbound content-types to a filename extension OpenAI/Whisper recognises.
_CONTENT_TYPE_EXT = {
    "audio/ogg": "ogg",
    "audio/oga": "oga",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/amr": "amr",
}


def _host_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("https", "http"):
        return False
    host = parsed.netloc.lower().split(":")[0]
    return any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_AUDIO_HOSTS)


def _extension_for(content_type: Optional[str]) -> str:
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in _CONTENT_TYPE_EXT:
            return _CONTENT_TYPE_EXT[base]
    return "ogg"  # WhatsApp + Telegram voice notes are ogg/opus by default


async def _download_audio(
    url: str,
    auth: Optional[Tuple[str, str]],
) -> Optional[bytes]:
    try:
        async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = await client.get(url, auth=auth)
            if resp.status_code != 200:
                logger.warning("Audio download failed (%s): HTTP %s", _host_of(url), resp.status_code)
                return None
            body = resp.content
            if len(body) > MAX_AUDIO_BYTES:
                logger.warning("Audio from %s exceeds size cap (%d bytes) — skipped", _host_of(url), len(body))
                return None
            return body
    except Exception as exc:
        logger.error("Audio download error (%s): %s", _host_of(url), exc)
        return None


def _host_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower().split(":")[0]
    except Exception:
        return "?"


async def transcribe_audio(
    url: str,
    content_type: Optional[str] = None,
    auth: Optional[Tuple[str, str]] = None,
) -> Optional[str]:
    """
    Download an audio URL and return its transcript, or None on any failure.

    Args:
        url: Media URL (Twilio or Telegram file URL).
        content_type: e.g. "audio/ogg"; used only to pick a filename extension.
        auth: Optional (username, password) for the download (Twilio media).

    Returns:
        Transcript text (stripped), or None — never raises.
    """
    if not url:
        return None
    if not settings.OPENAI_API_KEY:
        logger.warning("Voice transcription requested but OPENAI_API_KEY is unset — skipping")
        return None
    if not _host_allowed(url):
        logger.warning("Rejected audio from disallowed host: %s", _host_of(url))
        return None

    body = await _download_audio(url, auth)
    if not body:
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        filename = f"voice.{_extension_for(content_type)}"
        result = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, body, content_type or "audio/ogg"),
        )
        text = (getattr(result, "text", "") or "").strip()
        if text:
            logger.info("Transcribed audio from %s (%d bytes -> %d chars)", _host_of(url), len(body), len(text))
            return text
        logger.warning("Transcription returned empty text for %s", _host_of(url))
        return None
    except Exception as exc:
        logger.error("Transcription failed (%s): %s", _host_of(url), exc)
        return None
