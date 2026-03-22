# create-voxly

> Scaffold a new [Voxly](https://voxly.dev) instance in one command.

[![npm](https://img.shields.io/npm/v/create-voxly.svg)](https://www.npmjs.com/package/create-voxly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Usage

```bash
npx create-voxly@latest my-agency
```

This will:

1. Clone the latest Voxly codebase
2. Walk you through configuration (database, API keys, etc.)
3. Generate `.env` files for backend & frontend
4. Install dependencies
5. Run database migrations

## Options

```bash
npx create-voxly@latest my-agency --docker        # Docker Compose mode
npx create-voxly@latest my-agency --skip-install  # Skip dependency install
```

## Requirements

- **Node.js** >= 18
- **Git** (for cloning)
- **Python 3.12+** (for backend)
- **PostgreSQL & Redis** (or use `--docker`)

## What is Voxly?

Voxly is an AI-powered client communication platform for dev agencies. It connects GitHub repos with WhatsApp, Telegram & Slack — letting AI craft intelligent project updates for your clients automatically.

📖 [Documentation](https://voxly.dev/docs) · ⭐ [GitHub](https://github.com/ravin972/voxly-backend)
