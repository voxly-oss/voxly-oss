from typing import Any, Dict, List
from .base import Tool
import os
import glob

class LocalDocsTool(Tool):
    name = "search_local_docs"
    description = "Search the local documentation in docs/ folder for strategy, architecture, and guides."
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search term to look for in documentation"
            },
            "root_dir": {
                "type": "string",
                "description": "Root directory to search in (optional, defaults to current working directory)"
            }
        },
        "required": ["query"]
    }

    async def run(self, query: str, root_dir: str = ".") -> str:
        # Find all markdown files in docs/
        docs_path = os.path.join(root_dir, "docs")
        if not os.path.exists(docs_path):
            return f"Error: docs/ directory not found in {root_dir}"

        md_files = glob.glob(os.path.join(docs_path, "**/*.md"), recursive=True)
        results = []

        for file_path in md_files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                # Simple case-insensitive search
                if query.lower() in content.lower():
                    # Extract snippet
                    lines = content.split('\n')
                    for i, line in enumerate(lines):
                        if query.lower() in line.lower():
                            snippet = "\n".join(lines[max(0, i-2):min(len(lines), i+3)])
                            results.append(f"File: {file_path}\nSnippet:\n{snippet}\n---")
                            if len(results) >= 3:  # Limit to 3 files
                                break
            except Exception as e:
                continue
            
            if len(results) >= 3:
                break
        
        if not results:
            return "No documentation found matching that query."
        
        return "\n".join(results)
