import httpx
import hmac
import hashlib
import json
import asyncio
import os

async def test_webhook():
    payload = {
        "repository": {"full_name": "voxly-app/client-projects"},
        "ref": "refs/heads/main",
        "commits": [{"message": "Mock test commit\n\nbody", "author": {"name": "Test"}}],
        "head_commit": {"message": "Mock test commit\n\nbody", "author": {"name": "Test"}}
    }
    body = json.dumps(payload).encode()
    
    # Sign it exactly how github.py expects
    secret = os.getenv("GITHUB_WEBHOOK_SECRET")
    if not secret:
        raise RuntimeError("GITHUB_WEBHOOK_SECRET must be set to run this script")
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "http://localhost:8001/api/v1/github/webhook",
                content=body,
                headers={"X-GitHub-Event": "push", "X-Hub-Signature-256": sig, "Content-Type": "application/json"}
            )
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_webhook())
