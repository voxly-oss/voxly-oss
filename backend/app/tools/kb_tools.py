from typing import Any, Dict, List
from .base import Tool
import anyio
import os
import glob


def _find_query_snippet(content: str, query: str) -> str | None:
    lowered_query = query.lower()
    lines = content.split("\n")
    for index, line in enumerate(lines):
        if lowered_query in line.lower():
            return "\n".join(lines[max(0, index - 2):min(len(lines), index + 3)])
    return None

class LocalDocsTool(Tool):
    name = "search_local_docs"
    description = "Search the local documentation in docs/ folder for strategy, architecture, and guides."
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search term to look for in documentation"
            }
        },
        "required": ["query"]
    }

    async def run(self, query: str, root_dir: str = ".") -> str:
        # root_dir is not model-controlled: it is not in the tool schema, and any value
        # the model still sends is ignored so it cannot point the search at another path.
        docs_path = os.path.join(".", "docs")
        if not os.path.exists(docs_path):
            return "Error: docs/ directory not found"

        md_files = glob.glob(os.path.join(docs_path, "**/*.md"), recursive=True)
        results = []

        for file_path in md_files:
            try:
                async with await anyio.open_file(file_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    
                snippet = _find_query_snippet(content, query)
                if snippet:
                    results.append(f"File: {file_path}\nSnippet:\n{snippet}\n---")
            except Exception as e:
                continue
            
            if len(results) >= 3:
                break
        
        if not results:
            return "No documentation found matching that query."
        
        return "\n".join(results)
