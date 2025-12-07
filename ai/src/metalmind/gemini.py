"""Gemini AI Client for MetalMind"""

from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class GeminiResponse:
    """Response from Gemini API"""
    text: str
    confidence: float
    sources: list[str]
    recommendations: list[str]


class GeminiClient:
    """Client for Google Gemini AI API"""
    
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model
        self._client = None
        
        if api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=api_key)
                logger.info("Gemini client initialized", model=model)
            except ImportError:
                logger.warning("google-genai not installed, AI features disabled")
            except Exception as e:
                logger.error("Failed to initialize Gemini client", error=str(e))
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> GeminiResponse:
        """Generate a response from Gemini"""
        
        if not self._client:
            logger.warning("Gemini client not available, returning placeholder")
            return GeminiResponse(
                text="AI features require a valid GEMINI_API_KEY. Please configure it in your environment.",
                confidence=0.0,
                sources=[],
                recommendations=[],
            )
        
        try:
            # Build the full prompt
            full_prompt = ""
            if system_prompt:
                full_prompt += f"{system_prompt}\n\n"
            
            if context:
                full_prompt += f"Context:\n{_format_context(context)}\n\n"
            
            full_prompt += f"User Query: {prompt}"
            
            # Generate response
            response = self._client.models.generate_content(
                model=self.model,
                contents=full_prompt,
            )
            
            text = response.text if response.text else ""
            
            # Extract recommendations (simple heuristic)
            recommendations = []
            for line in text.split("\n"):
                line = line.strip()
                if line.startswith(("- Recommend", "- Consider", "- You should", "1.", "2.", "3.")):
                    recommendations.append(line.lstrip("-0123456789. "))
            
            return GeminiResponse(
                text=text,
                confidence=0.85,  # Placeholder - would calculate based on response
                sources=["metalhive-metrics", "container-logs"],
                recommendations=recommendations[:5],
            )
            
        except Exception as e:
            logger.error("Gemini API error", error=str(e))
            return GeminiResponse(
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
            lines.append(f"{key}: {len(value)} items")
        elif isinstance(value, dict):
            lines.append(f"{key}: {list(value.keys())}")
        else:
            lines.append(f"{key}: {value}")
    return "\n".join(lines)
