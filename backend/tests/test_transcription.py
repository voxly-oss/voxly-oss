"""Tests for Agent Vision Phase 0: voice-note transcription.

Covers the routing logic in messaging_core._maybe_transcribe_voice (flag gating,
audio-vs-image branching, graceful degradation) and the guardrails in
transcription_service.transcribe_audio (host allowlist, missing key). No real
network or OpenAI calls are made.
"""
import pytest

from app.config import settings
from app.services import messaging_core
from app.services import transcription_service
from app.services.transcription_service import transcribe_audio


TWILIO_AUDIO_URL = "https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME"


@pytest.fixture
def voice_flag_on():
    original = settings.VOICE_TRANSCRIPTION_ENABLED
    settings.VOICE_TRANSCRIPTION_ENABLED = True
    yield
    settings.VOICE_TRANSCRIPTION_ENABLED = original


@pytest.fixture
def voice_flag_off():
    original = settings.VOICE_TRANSCRIPTION_ENABLED
    settings.VOICE_TRANSCRIPTION_ENABLED = False
    yield
    settings.VOICE_TRANSCRIPTION_ENABLED = original


# ── _maybe_transcribe_voice routing ──────────────────────────────────


@pytest.mark.asyncio
async def test_flag_off_is_noop_even_for_audio(voice_flag_off, monkeypatch):
    called = False

    async def _fake_transcribe(*a, **k):
        nonlocal called
        called = True
        return "should not be used"

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    msg, media = await messaging_core._maybe_transcribe_voice(
        "whatsapp", "hi", TWILIO_AUDIO_URL, "audio/ogg", ("sid", "tok")
    )

    assert called is False
    assert msg == "hi"
    assert media == TWILIO_AUDIO_URL  # untouched — pre-Phase-0 behavior


@pytest.mark.asyncio
async def test_audio_is_transcribed_and_consumed(voice_flag_on, monkeypatch):
    async def _fake_transcribe(url, content_type, auth):
        assert url == TWILIO_AUDIO_URL
        assert content_type == "audio/ogg"
        return "project status kya hai"

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    msg, media = await messaging_core._maybe_transcribe_voice(
        "whatsapp", "", TWILIO_AUDIO_URL, "audio/ogg", ("sid", "tok")
    )

    assert msg == "project status kya hai"
    assert media is None  # audio consumed into text, not forwarded as an image


@pytest.mark.asyncio
async def test_audio_transcript_appended_to_existing_text(voice_flag_on, monkeypatch):
    async def _fake_transcribe(url, content_type, auth):
        return "and the deadline?"

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    msg, media = await messaging_core._maybe_transcribe_voice(
        "telegram", "hello", TWILIO_AUDIO_URL, "audio/ogg", None
    )

    assert msg == "hello and the deadline?"
    assert media is None


@pytest.mark.asyncio
async def test_transcription_failure_drops_audio_keeps_text(voice_flag_on, monkeypatch):
    async def _fake_transcribe(url, content_type, auth):
        return None  # transcription failed

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    msg, media = await messaging_core._maybe_transcribe_voice(
        "whatsapp", "hi there", TWILIO_AUDIO_URL, "audio/ogg", ("sid", "tok")
    )

    assert msg == "hi there"      # text body preserved
    assert media is None          # non-image audio dropped, not sent to vision


@pytest.mark.asyncio
async def test_image_is_not_transcribed(voice_flag_on, monkeypatch):
    called = False

    async def _fake_transcribe(*a, **k):
        nonlocal called
        called = True
        return "x"

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    image_url = "https://media.twiliocdn.com/whatever.jpg"
    msg, media = await messaging_core._maybe_transcribe_voice(
        "whatsapp", "look", image_url, "image/jpeg", ("sid", "tok")
    )

    assert called is False
    assert msg == "look"
    assert media == image_url  # image preserved for the vision path


@pytest.mark.asyncio
async def test_no_content_type_is_treated_as_non_audio(voice_flag_on, monkeypatch):
    called = False

    async def _fake_transcribe(*a, **k):
        nonlocal called
        called = True
        return "x"

    monkeypatch.setattr(messaging_core, "transcribe_audio", _fake_transcribe)

    msg, media = await messaging_core._maybe_transcribe_voice(
        "whatsapp", "look", "https://media.twiliocdn.com/x", None, None
    )

    assert called is False
    assert media == "https://media.twiliocdn.com/x"


# ── transcribe_audio guardrails ──────────────────────────────────────


@pytest.mark.asyncio
async def test_transcribe_rejects_disallowed_host(voice_flag_on, monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    result = await transcribe_audio("https://evil.example.com/a.ogg", "audio/ogg")
    assert result is None


@pytest.mark.asyncio
async def test_transcribe_returns_none_without_api_key(voice_flag_on, monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    result = await transcribe_audio(TWILIO_AUDIO_URL, "audio/ogg")
    assert result is None


@pytest.mark.asyncio
async def test_transcribe_success_path(voice_flag_on, monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")

    async def _fake_download(url, auth):
        return b"fake-ogg-bytes"

    monkeypatch.setattr(transcription_service, "_download_audio", _fake_download)

    class _FakeTranscript:
        text = "  hello world  "

    class _FakeTranscriptions:
        async def create(self, **kwargs):
            assert kwargs["model"] == "whisper-1"
            return _FakeTranscript()

    class _FakeAudio:
        transcriptions = _FakeTranscriptions()

    class _FakeClient:
        def __init__(self, api_key):
            self.audio = _FakeAudio()

    import openai
    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeClient)

    result = await transcribe_audio(TWILIO_AUDIO_URL, "audio/ogg", ("sid", "tok"))
    assert result == "hello world"


def test_extension_mapping():
    assert transcription_service._extension_for("audio/ogg") == "ogg"
    assert transcription_service._extension_for("audio/mpeg") == "mp3"
    assert transcription_service._extension_for("audio/ogg; codecs=opus") == "ogg"
    assert transcription_service._extension_for(None) == "ogg"
    assert transcription_service._extension_for("audio/weird") == "ogg"


def test_host_allowlist():
    assert transcription_service._host_allowed("https://api.twilio.com/x") is True
    assert transcription_service._host_allowed("https://api.telegram.org/file/botX/y") is True
    assert transcription_service._host_allowed("https://evil.com/x") is False
    assert transcription_service._host_allowed("ftp://api.twilio.com/x") is False
