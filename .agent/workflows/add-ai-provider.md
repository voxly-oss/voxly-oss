---
description: Add a new AI provider to Voxly (OpenAI, Gemini, Ollama, etc.)
---
# Add New AI Provider

Follow these steps to add a new AI provider to Voxly's pluggable AI system.

## Steps

1. Create a new provider file:
   - Path: `backend/app/services/ai_providers/<provider_name>_provider.py`
   - Use `claude_provider.py` as a reference implementation

2. Implement the `AIProvider` abstract class:
```python
from app.services.ai_providers.base import AIProvider, AIResponse, SYSTEM_PROMPT

class NewProvider(AIProvider):
    @property
    def provider_name(self) -> str:
        return "new_provider"
    
    @property
    def default_model(self) -> str:
        return "model-name"
    
    async def generate_response(self, message, context, system_prompt=SYSTEM_PROMPT, max_tokens=1000):
        # Your API call here
        return AIResponse(
            response="...",
            tokens_used=0,
            model=self.default_model,
            success=True,
            provider=self.provider_name,
        )
```

3. Register the provider in `backend/app/services/ai_providers/__init__.py`:
   - Import your provider class
   - Add it to the `PROVIDERS` dict

4. Add any required API key settings to `backend/app/config.py`

5. Test the provider:
// turbo
```
cd r:\CC Clients Codebase\voxly\backend && python -c "import asyncio; from app.services.ai_providers import get_provider; p = get_provider('new_provider'); print(asyncio.run(p.health_check()))"
```

6. Update `docs/strategy/ai_provider_architecture.md` with the new provider.
