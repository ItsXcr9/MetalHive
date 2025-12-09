"""OpenAI Client for MetalMind AI Engine"""

from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class AIResponse:
    """Response from AI API"""
    text: str
    confidence: float
    sources: list[str]
    recommendations: list[str]


class OpenAIClient:
    """Client for OpenAI API"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model
        self._client = None
        
        if api_key:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=api_key)
                logger.info("OpenAI client initialized", model=model)
            except ImportError:
                logger.warning("openai package not installed, AI features disabled")
            except Exception as e:
                logger.error("Failed to initialize OpenAI client", error=str(e))
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> AIResponse:
        """Generate a response from OpenAI"""
        
        if not self._client:
            logger.warning("OpenAI client not available, returning placeholder")
            return AIResponse(
                text="AI features require a valid OPENAI_API_KEY. Please configure it in your environment.",
                confidence=0.0,
                sources=[],
                recommendations=[],
            )
        
        try:
            # Build messages
            messages = []
            
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            # Add context to user message
            user_content = ""
            if context:
                user_content += f"**Current System Context:**\n{_format_context(context)}\n\n"
            
            user_content += f"**User Query:** {prompt}"
            messages.append({"role": "user", "content": user_content})
            
            # Generate response
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
            )
            
            text = response.choices[0].message.content or ""
            
            # Extract recommendations (simple heuristic)
            recommendations = []
            for line in text.split("\n"):
                line = line.strip()
                if line.startswith(("- Recommend", "- Consider", "- You should", "• ", "1.", "2.", "3.")):
                    recommendations.append(line.lstrip("-•0123456789. "))
            
            return AIResponse(
                text=text,
                confidence=0.9,  # OpenAI generally high confidence
                sources=["metalhive-metrics", "container-logs", "system-health"],
                recommendations=recommendations[:5],
            )
            
        except Exception as e:
            logger.error("OpenAI API error", error=str(e))
            return AIResponse(
                text=f"AI processing error: {str(e)}",
                confidence=0.0,
                sources=[],
                recommendations=[],
            )


def _format_context(context: dict[str, Any]) -> str:
    """Format context dict for the prompt"""
    lines = []
    for key, value in context.items():
        if isinstance(value, list):
            if len(value) > 0:
                # Show first few items for lists
                preview = value[:3]
                lines.append(f"**{key}** ({len(value)} items):")
                for item in preview:
                    if isinstance(item, dict):
                        lines.append(f"  - {item}")
                    else:
                        lines.append(f"  - {item}")
                if len(value) > 3:
                    lines.append(f"  - ... and {len(value) - 3} more")
            else:
                lines.append(f"**{key}**: (empty)")
        elif isinstance(value, dict):
            lines.append(f"**{key}**: {value}")
        else:
            lines.append(f"**{key}**: {value}")
    return "\n".join(lines)
