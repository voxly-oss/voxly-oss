"""Tests for Agent Vision Phase 0 slice 2: language detection + canned strings.

Verifies the detection heuristic (Devanagari + Hinglish), the flag gating
(off => always English => byte-identical to prior literals), and the t() lookup
with English fallback and formatting.
"""
import pytest

from app.config import settings
from app.services import localization
from app.services.localization import detect_language, t, STRINGS


@pytest.fixture
def detection_on():
    original = settings.LANGUAGE_DETECTION_ENABLED
    settings.LANGUAGE_DETECTION_ENABLED = True
    yield
    settings.LANGUAGE_DETECTION_ENABLED = original


@pytest.fixture
def detection_off():
    original = settings.LANGUAGE_DETECTION_ENABLED
    settings.LANGUAGE_DETECTION_ENABLED = False
    yield
    settings.LANGUAGE_DETECTION_ENABLED = original


# ── detect_language: flag gating ─────────────────────────────────────


def test_flag_off_always_returns_en(detection_off):
    assert detect_language("क्या हाल है") == "en"
    assert detect_language("project status kya hai kitna hua") == "en"
    assert detect_language("hello") == "en"


# ── detect_language: Devanagari ──────────────────────────────────────


def test_devanagari_detected_as_hindi(detection_on):
    assert detect_language("नमस्ते, प्रोजेक्ट का क्या हाल है?") == "hi"
    assert detect_language("कितना काम हुआ") == "hi"


# ── detect_language: Hinglish (Latin script) ─────────────────────────


def test_hinglish_detected_as_hindi(detection_on):
    # The real message from the WhatsApp test
    assert detect_language("Project status kya h, kitna hua h?") == "hi"
    assert detect_language("bhai kaam kitna hua batao") == "hi"


def test_plain_english_stays_english(detection_on):
    assert detect_language("What is the status of my project?") == "en"
    assert detect_language("hello there") == "en"
    assert detect_language("") == "en"
    assert detect_language(None) == "en"


def test_single_hinglish_token_not_enough(detection_on):
    # Needs >= 2 markers, so an English sentence with one stray token stays 'en'
    assert detect_language("please raha the course") == "en"


# ── t(): lookup, fallback, formatting ────────────────────────────────


def test_t_returns_english_by_default():
    assert t("wa_error") == STRINGS["wa_error"]["en"]


def test_t_returns_hindi_when_requested():
    assert t("wa_error", "hi") == STRINGS["wa_error"]["hi"]
    assert t("wa_error", "hi") != STRINGS["wa_error"]["en"]


def test_t_falls_back_to_english_for_unknown_lang():
    assert t("wa_error", "fr") == STRINGS["wa_error"]["en"]


def test_t_unknown_key_returns_key():
    assert t("does_not_exist", "hi") == "does_not_exist"


def test_t_formats_kwargs():
    out = t("tg_not_linked", "en", chat_id="12345")
    assert "12345" in out
    out_hi = t("tg_not_linked", "hi", chat_id="12345")
    assert "12345" in out_hi


def test_t_missing_kwarg_does_not_raise():
    # Template has {chat_id} but none provided -> returns template unformatted
    out = t("tg_not_linked", "en")
    assert "{chat_id}" in out  # did not raise


# ── flag-off byte-identity guarantee ─────────────────────────────────


def test_english_strings_match_known_literals():
    """With the flag off everything resolves to these exact English strings —
    this is the byte-identical-no-op contract. If someone edits the English
    text, they must update the call sites too."""
    assert STRINGS["wa_not_recognised"]["en"] == (
        "Sorry, I don't recognise your number. Please contact your project manager. 🙏"
    )
    assert STRINGS["wa_error"]["en"] == (
        "Sorry, something went wrong. Please try again later or contact support."
    )
    assert STRINGS["tg_error"]["en"] == (
        "Sorry, something went wrong. Please try again later."
    )
    assert STRINGS["ai_empty"]["en"] == (
        "Sorry, I couldn't generate a response right now. Please try again. 🙏"
    )
    assert STRINGS["pipeline_error"]["en"] == (
        "Sorry, something went wrong. Please try again later or contact support."
    )


def test_every_key_has_both_languages():
    for key, entry in STRINGS.items():
        assert "en" in entry, f"{key} missing 'en'"
        assert "hi" in entry, f"{key} missing 'hi'"
        assert entry["en"] and entry["hi"]
