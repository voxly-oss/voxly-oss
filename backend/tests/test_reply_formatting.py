"""Client replies must not report fake GitHub numbers, and must survive Telegram's formatting.

Live incident 2026-09-28: GITHUB_TOKEN was revoked, fetch_github_stats returned zeros plus an
"error" key, the prompt showed the zeros as real data, and the bot told a client their project
had "no activity, 0% progress". The same reply lost the "_" in "Vak_test" to Telegram's legacy
Markdown and showed a raw table.
"""

import pytest

from app.services import cache_service, github_service
from app.services.ai_providers.base import build_context
from app.services.telegram_service import markdown_to_telegram_html

_FAILED_FETCH = {
    "error": "GitHub API error: 401 Bad credentials",
    "commits_last_7_days": 0,
    "open_issues": 0,
    "closed_issues": 0,
    "total_issues": 0,
    "progress_percent": 0,
    "pull_requests": 0,
    "last_commit_message": None,
    "last_commit_date": None,
}


def _context(stats):
    return build_context("Anupam", "Vak", stats, [], "status?")


# ── prompt context ────────────────────────────────────────────────────


def test_failed_fetch_is_marked_unavailable_not_shown_as_zeros():
    ctx = _context(_FAILED_FETCH)
    assert "UNAVAILABLE" in ctx
    assert "Total commits" not in ctx
    assert "Overall progress" not in ctx
    assert "Bad credentials" not in ctx  # raw error must not reach the model


def test_missing_stats_are_marked_unavailable():
    ctx = _context({})
    assert "UNAVAILABLE" in ctx
    assert "Total commits" not in ctx


def test_real_stats_are_shown():
    stats = dict(_FAILED_FETCH, error=None, commits_last_7_days=12, progress_percent=40,
                 last_commit_message="Add login", last_commit_date="2026-09-27T10:00:00")
    ctx = _context(stats)
    assert "UNAVAILABLE" not in ctx
    assert "Total commits: 12" in ctx
    assert "Overall progress: 40%" in ctx
    assert "Last commit: Add login" in ctx


def test_real_stats_with_no_commits_say_so_instead_of_none():
    ctx = _context(dict(_FAILED_FETCH, error=None))
    assert "Last commit: No recent activity" in ctx
    assert "Last updated: Unknown" in ctx


# ── cache TTL ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "stats,expected_ttl",
    [(_FAILED_FETCH, 60), (dict(_FAILED_FETCH, error=None), 3600)],
)
async def test_failed_fetch_is_cached_briefly(monkeypatch, stats, expected_ttl):
    stored = []

    async def _miss(key):
        return None

    async def _set(key, value, ttl):
        stored.append(ttl)

    async def _fetch(repo_name):
        return stats

    monkeypatch.setattr(cache_service, "_cache_get", _miss)
    monkeypatch.setattr(cache_service, "_cache_set", _set)
    monkeypatch.setattr(github_service, "fetch_github_stats", _fetch)

    assert await cache_service.get_github_stats_cached("p1", "owner/repo") == stats
    assert stored == [expected_ttl]


# ── Telegram HTML conversion ──────────────────────────────────────────


def test_underscores_survive():
    assert markdown_to_telegram_html("Vak_test and Vak _ say it better") == (
        "Vak_test and Vak _ say it better"
    )


def test_bold_and_code():
    assert markdown_to_telegram_html("**Done** run `a<b`") == "<b>Done</b> run <code>a&lt;b</code>"


def test_html_special_characters_are_escaped():
    assert markdown_to_telegram_html("R&D <script> 5 > 3") == "R&amp;D &lt;script&gt; 5 &gt; 3"


def test_table_becomes_plain_lines():
    table = (
        "| Metric | Current Value |\n"
        "|--------|----------------|\n"
        "| Commits (last 7 days) | 0 |\n"
        "| Open issues | 0 |"
    )
    assert markdown_to_telegram_html(table) == (
        "Metric — Current Value\nCommits (last 7 days) — 0\nOpen issues — 0"
    )


def test_heading_becomes_bold():
    assert markdown_to_telegram_html("## Next steps\n- ship it") == "<b>Next steps</b>\n- ship it"


def test_fenced_code_block():
    assert markdown_to_telegram_html("```python\nx = a < b\n```") == "<pre>x = a &lt; b</pre>"


def test_unbalanced_markers_stay_literal():
    assert markdown_to_telegram_html("5 ** 2 and a lone * star") == "5 ** 2 and a lone * star"


def test_not_linked_message_keeps_chat_id_as_code():
    assert "<code>12345</code>" in markdown_to_telegram_html("Your Chat ID is: `12345`")
