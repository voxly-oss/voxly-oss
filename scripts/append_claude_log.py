#!/usr/bin/env python3
"""
Append a timestamped CLAUDE.md log section.

Usage:
  python scripts/append_claude_log.py
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse


ENTRY_TEMPLATE = """## [{timestamp}]
### Fixes
- ...

### New Issues
- ...

### Open Risks
- ...

### Decisions
- ...

### Next 5h Plan
1. ...
2. ...
3. ...
"""


def append_entry(repo_root: Path) -> Path:
    claude_path = repo_root / "CLAUDE.md"
    if not claude_path.exists():
        raise FileNotFoundError(f"Missing file: {claude_path}")

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = ENTRY_TEMPLATE.format(timestamp=now)

    existing = claude_path.read_text(encoding="utf-8")
    newline = "" if existing.endswith("\n\n") else ("\n" if existing.endswith("\n") else "\n\n")
    claude_path.write_text(existing + newline + entry, encoding="utf-8")
    return claude_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Append a timestamped section to CLAUDE.md")
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root that contains CLAUDE.md (default: current directory)",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    out = append_entry(repo_root)
    print(f"Appended new CLAUDE.md entry: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

