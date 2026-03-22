from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

class Tool(ABC):
    """
    Abstract base class for all tools.
    """
    name: str
    description: str
    parameters: Dict[str, Any]

    @abstractmethod
    async def run(self, **kwargs) -> Any:
        """
        Execute the tool with the given arguments.
        """
        pass

    def to_schema(self) -> Dict[str, Any]:
        """
        Convert tool definition to Anthropic Claude function schema.
        """
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters
        }

    def to_openai_schema(self) -> Dict[str, Any]:
        """
        Convert tool definition to OpenAI function schema format.
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters.get("properties", {}),
                    "required": self.parameters.get("required", []),
                }
            }
        }
