"""
Localization — Agent Vision Phase 0, slice 2.

Two jobs:
  1. detect_language(text): a cheap, dependency-free heuristic that classifies an
     inbound message as Hindi ('hi') or English ('en'). Handles both Devanagari
     script and Hinglish (Hindi written in Latin script), which is how most Voxly
     clients actually type.
  2. t(key, lang, **kwargs): look up a canned system string in the requested
     language, falling back to English. Used to localize the *fixed* messages
     (errors, "not recognised", onboarding) — the AI-generated replies already
     mirror the client's language via the system prompt.

Gating: detect_language returns 'en' whenever settings.LANGUAGE_DETECTION_ENABLED
is False, so with the flag off every canned string resolves to its exact current
English text — a byte-identical no-op.
"""
import re
from typing import Optional

from app.config import settings

# Devanagari Unicode block — presence of any of these implies Hindi.
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")

# Conservative Hinglish markers: tokens that are distinctively Hindi and unlikely
# to appear in ordinary English. We require >= 2 matches to avoid misclassifying
# English that happens to contain a name like "Kar" or "Hai".
_HINGLISH_TOKENS = {
    "kya", "hai", "hain", "hua", "hui", "kitna", "kitne", "kaise", "kaisa",
    "nahi", "nahin", "haan", "kaam", "kab", "kyun", "kyu", "mera", "meri",
    "aap", "tum", "theek", "thik", "batao", "bata", "chahiye", "karo", "kar",
    "raha", "rahi", "rahe", "matlab", "acha", "accha", "kuch", "abhi", "kyunki",
}
_HINGLISH_MIN_MATCHES = 2

SUPPORTED_LANGUAGES = ("en", "hi")


def detect_language(text: Optional[str]) -> str:
    """Return 'hi' or 'en' for the given text. 'en' is the safe default.

    Returns 'en' unconditionally when LANGUAGE_DETECTION_ENABLED is off, so the
    canned-string layer is a no-op until the flag is flipped.
    """
    if not settings.LANGUAGE_DETECTION_ENABLED:
        return "en"
    if not text:
        return "en"
    if _DEVANAGARI.search(text):
        return "hi"
    tokens = re.findall(r"[a-zA-Z]+", text.lower())
    matches = sum(1 for tok in tokens if tok in _HINGLISH_TOKENS)
    if matches >= _HINGLISH_MIN_MATCHES:
        return "hi"
    return "en"


# Canned system strings. The 'en' entries MUST match the original literals
# exactly so that flag-off (always 'en') is byte-identical to prior behavior.
STRINGS = {
    "wa_not_recognised": {
        "en": "Sorry, I don't recognise your number. Please contact your project manager. 🙏",
        "hi": "माफ़ कीजिए, मैं आपका नंबर नहीं पहचान पा रहा। कृपया अपने प्रोजेक्ट मैनेजर से संपर्क करें। 🙏",
    },
    "wa_error": {
        "en": "Sorry, something went wrong. Please try again later or contact support.",
        "hi": "माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया बाद में दोबारा कोशिश करें या सपोर्ट से संपर्क करें।",
    },
    "tg_error": {
        "en": "Sorry, something went wrong. Please try again later.",
        "hi": "माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया बाद में दोबारा कोशिश करें।",
    },
    "tg_not_linked": {
        "en": (
            "Sorry, your Telegram account isn't linked to any client yet.\n\n"
            "Your Chat ID is: `{chat_id}`\n"
            "Please share this with your project manager. 🙏"
        ),
        "hi": (
            "माफ़ कीजिए, आपका Telegram अकाउंट अभी किसी क्लाइंट से लिंक नहीं है।\n\n"
            "आपकी Chat ID है: `{chat_id}`\n"
            "कृपया इसे अपने प्रोजेक्ट मैनेजर के साथ साझा करें। 🙏"
        ),
    },
    "ai_empty": {
        "en": "Sorry, I couldn't generate a response right now. Please try again. 🙏",
        "hi": "माफ़ कीजिए, मैं अभी जवाब तैयार नहीं कर पाया। कृपया दोबारा कोशिश करें। 🙏",
    },
    "pipeline_error": {
        "en": "Sorry, something went wrong. Please try again later or contact support.",
        "hi": "माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया बाद में दोबारा कोशिश करें या सपोर्ट से संपर्क करें।",
    },
}


def t(key: str, lang: str = "en", **kwargs) -> str:
    """Look up canned string `key` in `lang`, falling back to English, then to
    the key itself. Formats with any provided kwargs (e.g. chat_id=...)."""
    entry = STRINGS.get(key)
    if entry is None:
        return key
    template = entry.get(lang) or entry.get("en") or key
    if kwargs:
        try:
            return template.format(**kwargs)
        except Exception:
            return template
    return template
