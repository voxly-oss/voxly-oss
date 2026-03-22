---
description: Pre-push checklist to ensure no secrets or internal docs leak to GitHub
---

# Pre-Push Security & Quality Check

Run this before `git push` to a public repository.

## 1. Scan for Secrets
- [ ] Check `.env` is in `.gitignore`
- [ ] Check for hardcoded API keys in code (grep "sk-", "ghp_")
- [ ] Check `backend/app/config.py` for default values that should be empty strings

## 2. Clean Internal Docs
- [ ] Remove any private client names from `README.md` or comments
- [ ] Ensure `task.md` or `brain/` folder is NOT committed (unless it's generic)

## 3. Verify Build
- [ ] Run `npm build` in frontend
- [ ] Run `pytest` in backend (if tests exist)

## 4. Sensitive Files
- [ ] `.gemini/` folder should be ignored
- [ ] `__pycache__` should be ignored
- [ ] `node_modules` should be ignored

## 5. Commit Message
- [ ] Use Conventional Commits (feat: ..., fix: ...)
