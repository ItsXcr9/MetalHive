"""MetalMind AI Engine Configuration"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8081
    debug: bool = False
    log_level: str = "INFO"
    
    # Gemini AI
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"
    
    # NATS
    nats_url: str = "nats://localhost:4222"
    
    # ClickHouse
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "metalhive"
    
    # Redis/DragonflyDB
    redis_url: str = "redis://localhost:6379"
    
    class Config:
        env_prefix = "METALMIND_"
        env_file = ".env"


settings = Settings()
