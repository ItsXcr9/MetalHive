"""Chat History Storage for MetalMind"""

import json
from datetime import datetime
from typing import Any

import structlog

logger = structlog.get_logger()


class ChatHistory:
    """Store and retrieve chat history using Redis"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._client = None
        
        try:
            import redis
            self._client = redis.from_url(redis_url, decode_responses=True)
            self._client.ping()
            logger.info("ChatHistory connected to Redis", url=redis_url)
        except ImportError:
            logger.warning("redis package not installed, history disabled")
        except Exception as e:
            logger.error("Failed to connect to Redis for history", error=str(e))
    
    async def save_message(
        self, 
        session_id: str, 
        role: str, 
        content: str,
        metadata: dict[str, Any] | None = None
    ) -> bool:
        """Save a chat message to history"""
        if not self._client:
            return False
        
        try:
            message = {
                "role": role,  # "user" or "assistant"
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
                "metadata": metadata or {},
            }
            
            key = f"metalmind:history:{session_id}"
            
            # Add to list (most recent at end)
            self._client.rpush(key, json.dumps(message))
            
            # Trim to keep last 50 messages
            self._client.ltrim(key, -50, -1)
            
            # Set TTL of 7 days
            self._client.expire(key, 60 * 60 * 24 * 7)
            
            return True
        except Exception as e:
            logger.error("Failed to save message", error=str(e), session_id=session_id)
            return False
    
    async def get_history(
        self, 
        session_id: str, 
        limit: int = 20
    ) -> list[dict[str, Any]]:
        """Get chat history for a session"""
        if not self._client:
            return []
        
        try:
            key = f"metalmind:history:{session_id}"
            
            # Get last N messages
            messages = self._client.lrange(key, -limit, -1)
            
            return [json.loads(m) for m in messages]
        except Exception as e:
            logger.error("Failed to get history", error=str(e), session_id=session_id)
            return []
    
    async def clear_history(self, session_id: str) -> bool:
        """Clear chat history for a session"""
        if not self._client:
            return False
        
        try:
            key = f"metalmind:history:{session_id}"
            self._client.delete(key)
            return True
        except Exception as e:
            logger.error("Failed to clear history", error=str(e), session_id=session_id)
            return False
    
    async def get_sessions(self, limit: int = 20) -> list[str]:
        """Get list of active sessions"""
        if not self._client:
            return []
        
        try:
            keys = self._client.keys("metalmind:history:*")
            sessions = [k.replace("metalmind:history:", "") for k in keys]
            return sessions[:limit]
        except Exception as e:
            logger.error("Failed to get sessions", error=str(e))
            return []
