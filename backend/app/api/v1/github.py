from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.services.ai_agent import VoxlyAgent
from app.services.whatsapp_service import send_whatsapp_message
from app.database import SessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.client import Client
from app.config import settings
import logging
import httpx
import os
import zipfile
import io
import hmac
import hashlib
import urllib.parse

router = APIRouter()
logger = logging.getLogger(__name__)
GITHUB_LOG_HOSTS = {"api.github.com", "pipelines.actions.githubusercontent.com"}
REDIRECT_LOG_HOSTS = GITHUB_LOG_HOSTS | {"objects.githubusercontent.com"}
MAX_UNCOMPRESSED_LOG_BYTES = 50 * 1024 * 1024


def _verify_github_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """Verify HMAC-SHA256 signature from GitHub webhook."""
    if not settings.GITHUB_WEBHOOK_SECRET:
        if settings.DEBUG:
            logger.warning("GITHUB_WEBHOOK_SECRET not set in DEBUG mode — skipping webhook signature check")
            return True
        logger.error("GITHUB_WEBHOOK_SECRET missing in non-debug mode")
        return False
    if not signature_header:
        return False
    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(), payload_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _is_allowed_github_url(url: str, allowed_hosts: set[str], error_message: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc.lower().split(":")[0]
        return parsed.scheme == "https" and any(
            host == allowed_host or host.endswith("." + allowed_host)
            for allowed_host in allowed_hosts
        )
    except Exception:
        logger.error(error_message)
        return False


async def _fetch_log_archive(
    client: httpx.AsyncClient,
    logs_url: str,
    headers: dict[str, str],
) -> httpx.Response | None:
    response = await client.get(logs_url, headers=headers)
    if response.status_code not in (301, 302, 307, 308):
        return response

    redirect_url = response.headers.get("location", "")
    if not _is_allowed_github_url(
        redirect_url,
        REDIRECT_LOG_HOSTS,
        "Could not parse redirect URL — blocked",
    ):
        logger.error(f"Redirect to untrusted host blocked: {redirect_url}")
        return None
    return await client.get(redirect_url, headers=headers)


def _extract_relevant_log_content(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            relevant_content = ""
            total_extracted = 0
            for name in archive.namelist():
                if "/" in name:
                    continue
                info = archive.getinfo(name)
                if total_extracted + info.file_size > MAX_UNCOMPRESSED_LOG_BYTES:
                    logger.warning("Log zip decompression limit reached — stopping")
                    break
                try:
                    with archive.open(name) as log_file:
                        text = log_file.read().decode("utf-8", errors="ignore")
                        total_extracted += info.file_size
                        if "Error:" in text or "Failure" in text or "failed" in text:
                            relevant_content += f"\n--- {name} ---\n{text[-2000:]}"
                except Exception:
                    continue
            return relevant_content[:4000]
    except Exception as exc:
        logger.error(f"Error unzipping logs: {exc}")
        return ""


@router.post(
    "/webhook",
    responses={
        401: {"description": "Invalid webhook signature"},
        500: {"description": "Webhook processing failed"},
    },
)
async def github_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Handle GitHub Webhooks.
    Validates HMAC-SHA256 signature before processing any events.
    """
    try:
        payload_body = await request.body()

        # -- Security: Verify GitHub signature -------------------------------------
        signature = request.headers.get("X-Hub-Signature-256")
        if not _verify_github_signature(payload_body, signature):
            logger.warning("GitHub webhook: invalid or missing signature — rejected")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        # --------------------------------------------------------------------------

        import json
        payload = json.loads(payload_body)
        event_type = request.headers.get("X-GitHub-Event")

        logger.info(f"Received GitHub event: {event_type}")

        if event_type == "push":
            background_tasks.add_task(notify_client_on_push, payload)

        elif event_type == "workflow_run":
            action = payload.get("action")
            workflow_run = payload.get("workflow_run", {})
            conclusion = workflow_run.get("conclusion")

            logger.info(f"Workflow Run: {action}, Conclusion: {conclusion}")

            if action == "completed" and conclusion == "failure":
                background_tasks.add_task(analyze_build_failure, payload)

        return {"status": "received"}

    except HTTPException:
        raise
    except Exception as e:
        # FIX #1: Return HTTP 500 so GitHub knows delivery failed and can retry.
        # Previously returned HTTP 200 {"status": "error"} which suppressed retries.
        logger.error(f"GitHub Webhook Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Webhook processing failed")


async def notify_client_on_push(payload: dict):
    """
    Send WhatsApp notification to the client when a push is made to their project repo.
    Looks up the project by github_repo, then notifies the linked client.
    """
    repo = payload.get("repository", {})
    repo_full_name = repo.get("full_name", "")
    ref = payload.get("ref", "")
    branch = ref.replace("refs/heads/", "")

    # Extract commit details
    commits = payload.get("commits", [])
    head_commit = payload.get("head_commit") or (commits[0] if commits else {})
    commit_msg = head_commit.get("message", "No message").splitlines()[0]  # first line only
    author = head_commit.get("author", {}).get("name", "Someone")
    num_commits = len(commits)

    logger.info(f"Push event: {repo_full_name} branch={branch} commits={num_commits}")

    db = SessionLocal()
    try:
        from app.models.project import Project
        from app.models.client import Client
        
        project = (
            db.query(Project)
            .filter(Project.github_repo == repo_full_name)
            .first()
        )
        if not project:
            logger.warning(f"No project found for repo '{repo_full_name}' — no alert sent")
            return

        client = (
            db.query(Client)
            .filter(Client.id == project.client_id)
            .first()
        )
        if not client or not client.phone:
            logger.warning(f"No client with phone found for project '{project.name}' — no alert sent")
            return

        commits_label = f"{num_commits} commit{'s' if num_commits != 1 else ''}"
        message = (
            f"\U0001f680 *New update on {project.name}*\n"
            f"\U0001f4bb *Repo:* {repo_full_name} ({branch})\n"
            f"\U0001f527 *By:* {author}\n"
            f"\U0001f4dd *{commits_label}:* {commit_msg}\n\n"
            f"Your development team just pushed new changes! "
            f"Feel free to ask me for a status update anytime. \U0001f4ac"
        )
        await send_whatsapp_message(client.phone, message)
        logger.info(f"Push alert sent to client {client.name} for repo {repo_full_name}")

    finally:
        db.close()


async def analyze_build_failure(payload: dict):
    """
    Analyze the failed build and notify the actual repo owner.
    """
    workflow_run = payload.get("workflow_run", {})
    repo = payload.get("repository", {})
    repo_full_name = repo.get("full_name")
    logs_url = workflow_run.get("logs_url")
    head_commit = workflow_run.get("head_commit", {})
    commit_msg = head_commit.get("message", "Unknown commit")

    logger.info(f"Analyzing build failure for {repo_full_name}...")

    # 1. Fetch Logs
    logs_content = await fetch_workflow_logs(logs_url)
    if not logs_content:
        logger.error("Failed to fetch logs — aborting analysis")
        return

    # 2. Analyze with AI
    agent = VoxlyAgent()
    analysis_prompt = (
        f"The build for {repo_full_name} failed.\n"
        f"Commit: {commit_msg}\n\n"
        "Here are the tail logs from the failure:\n"
        f"```\n{logs_content}\n```\n\n"
        "Explain why it failed and suggest a fix in 1-2 sentences."
    )

    response = await agent.chat(
        user_message=analysis_prompt,
        system_prompt="You are a DevOps expert. Analyze build logs and provide a concise root cause and fix.",
    )

    ai_analysis = response.get("response", "Analysis failed.")

    # 3. FIX #2: Notify the actual repo owner, not just any user with a phone.
    # Find the project linked to this repo and notify its owner.
    db = SessionLocal()
    try:
        from app.models.project import Project  # avoid circular import at module level

        owner: User | None = None

        if repo_full_name:
            project = (
                db.query(Project)
                .filter(Project.github_repo == repo_full_name)
                .first()
            )
            if project:
                owner = (
                    db.query(User)
                    .filter(User.id == project.user_id, User.phone.isnot(None))
                    .first()
                )

        if not owner:
            logger.warning(
                f"No project owner with a phone found for repo '{repo_full_name}'. "
                "No WhatsApp alert sent."
            )
            return

        message = (
            f"\U0001f6a8 *Build Failed*: {repo_full_name}\n"
            f"\U0001f527 *Commit*: {commit_msg}\n\n"
            f"\U0001f916 *AI Analysis*:\n{ai_analysis}"
        )
        await send_whatsapp_message(owner.phone, message)
        logger.info(f"Sent build-failure alert to repo owner uid={owner.id}")
    finally:
        db.close()


async def fetch_workflow_logs(logs_url: str | None) -> str:
    """
    Download and extract GitHub Actions logs.
    GitHub returns a zip file of logs.
    """
    # FIX #3a: Guard for missing/empty logs_url before making any network call.
    if not logs_url:
        logger.warning("fetch_workflow_logs: logs_url is empty — skipping")
        return ""

    # FIX #5: Allowlist — only fetch from GitHub API hosts to prevent SSRF.
    if not _is_allowed_github_url(
        logs_url,
        GITHUB_LOG_HOSTS,
        "fetch_workflow_logs: invalid logs_url — skipping",
    ):
        logger.error(f"fetch_workflow_logs: rejected non-GitHub URL: {logs_url}")
        return ""

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        logger.error("GITHUB_TOKEN missing")
        return ""

    # FIX #3b: Explicit 30s timeout + FIX #5: no follow_redirects to prevent open-redirect SSRF.
    async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
        headers = {"Authorization": f"Bearer {token}"}
        resp = await _fetch_log_archive(client, logs_url, headers)
        if resp is None:
            return ""

        if resp.status_code != 200:
            logger.error(f"Error fetching logs: {resp.status_code}")
            return ""

        return _extract_relevant_log_content(resp.content)
