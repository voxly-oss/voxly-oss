"""send_telegram_message must not silently drop a reply Telegram can't parse as Markdown."""

import pytest

from app.services import telegram_service


class _Resp:
    def __init__(self, status, text=""):
        self.status_code = status
        self.text = text


def _fake_http(responses, sent):
    class _Http:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json):
            sent.append(json)
            return responses.pop(0)

    return _Http


@pytest.mark.asyncio
async def test_falls_back_to_plain_text_when_formatting_is_rejected(monkeypatch):
    sent = []
    responses = [
        _Resp(400, "Bad Request: can't parse entities: Can't find end of the entity"),
        _Resp(200),
    ]
    monkeypatch.setattr(telegram_service.httpx, "AsyncClient", _fake_http(responses, sent))
    ok = await telegram_service.send_telegram_message(1, "Project Vak _ say it better")
    assert ok is True
    assert sent[0]["parse_mode"] == "HTML"
    assert "parse_mode" not in sent[1]
    assert sent[1]["text"] == "Project Vak _ say it better"


@pytest.mark.asyncio
async def test_sends_converted_html_when_telegram_accepts_it(monkeypatch):
    sent = []
    monkeypatch.setattr(telegram_service.httpx, "AsyncClient", _fake_http([_Resp(200)], sent))
    assert await telegram_service.send_telegram_message(1, "**hi** Vak_test") is True
    assert len(sent) == 1
    assert sent[0]["parse_mode"] == "HTML"
    assert sent[0]["text"] == "<b>hi</b> Vak_test"


@pytest.mark.asyncio
async def test_other_errors_are_not_retried(monkeypatch):
    sent = []
    monkeypatch.setattr(
        telegram_service.httpx, "AsyncClient", _fake_http([_Resp(403, "bot was blocked")], sent)
    )
    assert await telegram_service.send_telegram_message(1, "hi") is False
    assert len(sent) == 1
