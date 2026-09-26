"""Multi-tenant (B2B) isolation: one agency must never see, reach or act on another's data.

Voxly is B2B: each agency (a User/tenant) has its own clients and projects. Inbound
messages (WhatsApp/Telegram) and the AI agent are the two places where the tenant is
not implied by a logged-in session, so they are tested here directly.
"""
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.client import Client
from app.models.project import Project
from app.models.user import User
from app.services.ai_agent import VoxlyAgent
from app.services.messaging_core import (
    _get_client_project,
    find_client_by_phone,
    find_client_by_telegram,
)
from app.tools import github_tools
from app.tools.github_tools import (
    REPO_NOT_ALLOWED,
    GitHubCreateIssueTool,
    GitHubGetFileTool,
    GitHubSearchIssuesTool,
)
from app.tools.kb_tools import LocalDocsTool

PHONE = "+919000000001"


def _user(db, agency="Agency", active=True) -> User:
    user = User(
        email=f"u-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="x",
        agency_name=agency,
        is_active=active,
    )
    db.add(user)
    db.commit()
    return user


def _client(db, user, phone=PHONE, telegram=None, **kw) -> Client:
    c = Client(user_id=user.id, name="Client", phone=phone, telegram_chat_id=telegram, **kw)
    db.add(c)
    db.commit()
    return c


# ── Inbound routing ──────────────────────────────────────────────────────────


def test_phone_shared_by_two_agencies_is_never_guessed(db_session):
    """The same person can be a client of two agencies. Picking one would answer with
    that agency's project data (and could be the wrong one), so nothing is routed."""
    _client(db_session, _user(db_session, "A"))
    _client(db_session, _user(db_session, "B"))
    assert find_client_by_phone(db_session, PHONE) is None


def test_phone_unique_to_one_agency_still_routes(db_session):
    mine = _client(db_session, _user(db_session))
    assert find_client_by_phone(db_session, PHONE).id == mine.id
    assert find_client_by_phone(db_session, "+919999999999") is None


def test_soft_deleted_client_is_not_routed(db_session):
    _client(db_session, _user(db_session), deleted_at=datetime.utcnow())
    assert find_client_by_phone(db_session, PHONE) is None


def test_soft_deleted_duplicate_does_not_make_a_live_client_ambiguous(db_session):
    _client(db_session, _user(db_session, "A"), deleted_at=datetime.utcnow())
    live = _client(db_session, _user(db_session, "B"))
    assert find_client_by_phone(db_session, PHONE).id == live.id


def test_inactive_client_is_not_routed(db_session):
    _client(db_session, _user(db_session), is_active=False)
    assert find_client_by_phone(db_session, PHONE) is None


def test_client_of_deactivated_agency_is_not_routed(db_session):
    _client(db_session, _user(db_session, active=False))
    assert find_client_by_phone(db_session, PHONE) is None


def test_telegram_lookup_skips_deleted_and_deactivated(db_session):
    _client(db_session, _user(db_session), telegram="111", deleted_at=datetime.utcnow())
    _client(db_session, _user(db_session, active=False), phone="+919000000003", telegram="222")
    live = _client(db_session, _user(db_session), phone="+919000000002", telegram="333")
    assert find_client_by_telegram(db_session, "111") is None
    assert find_client_by_telegram(db_session, "222") is None
    assert find_client_by_telegram(db_session, "333").id == live.id


def test_deleted_project_is_never_used_as_client_context(db_session):
    client = _client(db_session, _user(db_session))
    db_session.add(Project(client_id=client.id, name="Gone", deleted_at=datetime.utcnow()))
    db_session.commit()
    assert _get_client_project(db_session, client) is None


# ── AI agent tools: the model must not choose the repo ───────────────────────


@pytest.fixture
def no_network(monkeypatch):
    """Any real HTTP client in a refused call is a failure."""
    def boom(*a, **kw):
        raise AssertionError("network call attempted for a refused request")

    monkeypatch.setattr(github_tools.httpx, "AsyncClient", boom)
    monkeypatch.setenv("GITHUB_TOKEN", "test-token")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "owner,name",
    [
        ("someone-else", "private-repo"),  # another tenant's / the operator's repo
        ("acme", "other-repo"),  # same owner, different repo
        ("acme/../x", "app"),  # malformed segment
        ("", ""),
    ],
)
async def test_tools_refuse_repos_outside_the_allow_list(no_network, owner, name):
    allowed = ["acme/app"]
    assert await GitHubSearchIssuesTool(allowed).run(query="x", repo_owner=owner, repo_name=name) == REPO_NOT_ALLOWED
    assert await GitHubGetFileTool(allowed).run(path="README.md", repo_owner=owner, repo_name=name) == REPO_NOT_ALLOWED
    assert (
        await GitHubCreateIssueTool(allowed).run(title="t", body="b", repo_owner=owner, repo_name=name)
        == REPO_NOT_ALLOWED
    )


@pytest.mark.asyncio
async def test_tools_with_no_scope_refuse_everything(no_network):
    assert await GitHubGetFileTool().run(path="a", repo_owner="acme", repo_name="app") == REPO_NOT_ALLOWED
    assert await GitHubCreateIssueTool().run(title="t", body="b", repo_owner="acme", repo_name="app") == REPO_NOT_ALLOWED


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["../secrets", "a/../../b", "/etc/passwd", ""])
async def test_get_file_rejects_path_traversal(no_network, path):
    result = await GitHubGetFileTool(["acme/app"]).run(path=path, repo_owner="acme", repo_name="app")
    assert result == "Invalid file path."


class _FakeHttp:
    """Records requests from an allowed call."""

    calls: list = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None, headers=None):
        _FakeHttp.calls.append((url, params))
        resp = MagicMock(status_code=200, text="ok")
        resp.json.return_value = {"total_count": 0, "items": []}
        return resp


@pytest.mark.asyncio
async def test_allowed_repo_is_matched_case_insensitively_and_query_cannot_change_repo(monkeypatch):
    monkeypatch.setattr(github_tools.httpx, "AsyncClient", _FakeHttp)
    monkeypatch.setenv("GITHUB_TOKEN", "test-token")
    _FakeHttp.calls = []
    tool = GitHubSearchIssuesTool(["Acme/App"])
    await tool.run(query="bug&per_page=100 repo:victim/secret", repo_owner="acme", repo_name="app")
    (url, params), = _FakeHttp.calls
    assert url == "https://api.github.com/search/issues"
    # our repo qualifier comes first and the model's text is a single, encoded q value
    assert params["q"].startswith("repo:acme/app ")
    assert set(params) == {"q"}


# ── Which tools an agent gets ────────────────────────────────────────────────


def _agent(**kw) -> VoxlyAgent:
    with patch("app.services.ai_agent.get_provider", return_value=MagicMock()):
        return VoxlyAgent(api_key="sk-test", **kw)


def test_agent_has_no_tools_by_default():
    assert _agent().tools == []


def test_client_facing_agent_is_read_only_and_has_no_internal_docs():
    names = {t.name for t in _agent(allowed_repos=["acme/app"]).tools}
    assert names == {"github_search_issues", "github_get_file"}


def test_agent_without_a_linked_repo_gets_no_github_tools():
    assert _agent(allowed_repos=[None, ""]).tools == []


def test_admin_agent_can_write_and_read_docs_but_only_for_its_repos():
    agent = _agent(allowed_repos=["acme/app"], allow_writes=True, allow_internal_docs=True)
    assert {t.name for t in agent.tools} == {
        "github_search_issues",
        "github_get_file",
        "github_create_issue",
        "search_local_docs",
    }
    scoped = [t for t in agent.tools if hasattr(t, "allowed_repos")]
    assert scoped and all(t.allowed_repos == frozenset({"acme/app"}) for t in scoped)


def test_docs_tool_does_not_let_the_model_pick_a_directory():
    assert "root_dir" not in LocalDocsTool.parameters["properties"]


@pytest.mark.asyncio
async def test_openai_compatible_provider_omits_empty_tools():
    from app.services.ai_providers.groq_provider import GroqProvider

    with patch("app.services.ai_providers.openai_provider.AsyncOpenAI") as MockClient:
        create = AsyncMock()
        MockClient.return_value.chat.completions.create = create
        create.side_effect = RuntimeError("stop after inspecting kwargs")
        provider = GroqProvider(api_key="gsk_test")
        with pytest.raises(RuntimeError):
            await provider.generate_response_with_tools(messages=[], tools=[])
        assert "tools" not in create.call_args.kwargs
        assert "tool_choice" not in create.call_args.kwargs


# ── GitHub webhook routing ───────────────────────────────────────────────────


def _project(db, client, repo="acme/app", **kw) -> Project:
    p = Project(client_id=client.id, name="P", github_repo=repo, **kw)
    db.add(p)
    db.commit()
    return p


def test_repo_claimed_by_two_agencies_alerts_nobody(db_session):
    """Any agency can type any repo name into a project. Alerts carry commit messages,
    so an ambiguous repo must not be delivered to whichever tenant sorts first."""
    from app.api.v1.github import _unique_project_for_repo

    _project(db_session, _client(db_session, _user(db_session, "A")))
    _project(db_session, _client(db_session, _user(db_session, "B"), phone="+919000000002"))
    assert _unique_project_for_repo(db_session, "acme/app") is None


def test_repo_match_is_case_insensitive_and_skips_deleted(db_session):
    from app.api.v1.github import _unique_project_for_repo

    live = _project(db_session, _client(db_session, _user(db_session, "A")), repo="Acme/App")
    _project(
        db_session,
        _client(db_session, _user(db_session, "B"), phone="+919000000002"),
        deleted_at=datetime.utcnow(),
    )
    assert _unique_project_for_repo(db_session, "acme/APP").id == live.id
    assert _unique_project_for_repo(db_session, "") is None


@pytest.mark.asyncio
async def test_build_failure_alert_goes_to_the_repo_owning_agency(db_session):
    """Project has no user_id column; the owner is the client's agency. This path used
    to raise AttributeError and never alert anyone."""
    from app.api.v1 import github as github_api

    owner = _user(db_session, "Owner")
    owner.phone = "+919111111111"
    _project(db_session, _client(db_session, owner))
    other = _user(db_session, "Other")
    other.phone = "+919222222222"
    db_session.commit()

    agent = MagicMock()
    agent.chat = AsyncMock(return_value={"response": "fix it"})
    payload = {
        "repository": {"full_name": "acme/app"},
        "workflow_run": {"logs_url": "x", "head_commit": {"message": "m"}},
    }
    with patch.object(github_api, "SessionLocal", return_value=db_session), patch.object(
        github_api, "fetch_workflow_logs", AsyncMock(return_value="logs")
    ), patch.object(github_api, "VoxlyAgent", return_value=agent), patch.object(
        github_api, "send_whatsapp_message", AsyncMock()
    ) as send:
        await github_api.analyze_build_failure(payload)

    send.assert_awaited_once()
    assert send.await_args.args[0] == "+919111111111"


def test_log_analysis_agent_is_created_without_tools():
    """Build logs are untrusted text; the agent that reads them must not hold tools."""
    assert _agent().tools == []
