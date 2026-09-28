"""
Telegram Service — Send messages via the Telegram Bot API.

Uses httpx async — no extra dependencies needed (already in requirements).
"""
import html
import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.telegram.org"


def _bot_url(method: str) -> str:
    return f"{_BASE_URL}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"


_FENCE_RE = re.compile(r"```[^\n`]*\n?(.*?)```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
_BOLD_RE = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")


def markdown_to_telegram_html(text: str) -> str:
    """Convert the LLM's GitHub-style Markdown into Telegram-safe HTML.

    Telegram's legacy Markdown mode silently eats paired "_" (so "Vak_test" loses its
    underscore), shows "**" literally, and has no tables. HTML mode only treats <, > and & as
    special, so after escaping those, the text arrives exactly as written. Only bold, code and
    headings are kept as formatting; table rows become plain lines.
    """
    stash: list[str] = []

    def _keep(fragment: str) -> str:
        stash.append(fragment)
        return f"\x00{len(stash) - 1}\x00"

    text = _FENCE_RE.sub(lambda m: _keep(f"<pre>{html.escape(m.group(1).strip(), quote=False)}</pre>"), text)
    text = _INLINE_CODE_RE.sub(lambda m: _keep(f"<code>{html.escape(m.group(1), quote=False)}</code>"), text)

    lines = []
    for line in text.split("\n"):
        if _TABLE_SEPARATOR_RE.match(line):
            continue
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 1:
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            line = " — ".join(c for c in cells if c)
        else:
            heading = _HEADING_RE.match(line)
            if heading:
                line = f"**{heading.group(1)}**"
        lines.append(line)
    text = "\n".join(lines)

    text = html.escape(text, quote=False)
    text = _BOLD_RE.sub(r"<b>\1</b>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)


async def send_telegram_message(chat_id: str | int, text: str) -> bool:
    """
    Send a message to a Telegram chat.

    Args:
        chat_id: Telegram chat ID (numeric string or int)
        text: Message text (GitHub-style Markdown is converted to Telegram HTML)

    Returns:
        True if sent successfully
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _bot_url("sendMessage"),
                json={
                    "chat_id": str(chat_id),
                    "text": markdown_to_telegram_html(text),
                    "parse_mode": "HTML",
                },
            )
            # Safety net: if Telegram still can't parse the converted HTML, the reply would
            # silently never arrive. Resend the original text with no formatting instead.
            if resp.status_code == 400 and "parse entities" in resp.text:
                logger.warning("Telegram rejected formatted message; resending as plain text")
                resp = await client.post(
                    _bot_url("sendMessage"),
                    json={"chat_id": str(chat_id), "text": text},
                )
            if resp.status_code == 200:
                logger.info(f"Telegram message sent to chat {str(chat_id)[:4]}***")
                return True
            else:
                logger.error(f"Telegram API error {resp.status_code}: {resp.text[:200]}")
                return False
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


async def send_telegram_photo(chat_id: str | int, photo_url: str, caption: str = "") -> bool:
    """Send a photo via URL to a Telegram chat."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _bot_url("sendPhoto"),
                json={
                    "chat_id": str(chat_id),
                    "photo": photo_url,
                    "caption": markdown_to_telegram_html(caption),
                    "parse_mode": "HTML",
                },
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Failed to send Telegram photo: {e}")
        return False


async def set_webhook(webhook_url: str, secret_token: str = "") -> bool:
    """
    Register the Telegram webhook URL. Call once after deployment.

    Args:
        webhook_url: Full HTTPS URL (e.g. https://backend.run.app/api/v1/telegram/webhook)
        secret_token: Random string Telegram sends in X-Telegram-Bot-Api-Secret-Token header
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            payload = {"url": webhook_url}
            if secret_token:
                payload["secret_token"] = secret_token
            resp = await client.post(_bot_url("setWebhook"), json=payload)
            result = resp.json()
            if result.get("ok"):
                logger.info(f"Telegram webhook registered: {webhook_url}")
                return True
            else:
                logger.error(f"Telegram webhook registration failed: {result}")
                return False
    except Exception as e:
        logger.error(f"Failed to set Telegram webhook: {e}")
        return False
