# Contributing to Voxly

Thank you for your interest in contributing to Voxly! 🚀

## How to Contribute

### 1. Fork & Clone

```bash
git clone https://github.com/<your-username>/voxly-backend.git
cd voxly-backend
```

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use prefixes: `feature/`, `fix/`, `docs/`, `refactor/`.

### 3. Setup Development Environment

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Fill in your credentials
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 4. Make Your Changes

- Write clean, readable code with meaningful variable names.
- Add comments for complex logic.
- Follow existing code style and patterns.

### 5. Test

- Ensure your changes don't break existing functionality.
- Test both backend and frontend if your change spans both.

### 6. Commit & Push

```bash
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature-name
```

We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Tests
- `chore:` — Maintenance

### 7. Open a Pull Request

Go to the original repo and open a PR from your fork. Fill in the PR template.

---

## What to Contribute

- 🐛 **Bug fixes** — Check the [Issues](https://github.com/ravin972/voxly-backend/issues) tab.
- ✨ **Features** — Look for `good first issue` or `help wanted` labels.
- 📄 **Documentation** — Improve guides, add examples, fix typos.
- 🌍 **Translations** — Help us support more languages.

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

**Questions?** Open a Discussion or reach out on [Twitter/X](https://x.com/ravin_972).
