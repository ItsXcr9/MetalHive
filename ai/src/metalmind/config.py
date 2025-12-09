"""MetalMind AI Engine Configuration"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8081
    debug: bool = False
    log_level: str = "INFO"
    
    # AI Provider Selection ("openai" or "gemini")
    ai_provider: str = "openai"
    
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    
    # Gemini AI (fallback)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"
    
    # NATS
    nats_url: str = "nats://localhost:4222"
    
    # ClickHouse
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "metalhive"
    
    # Controller URL (for fetching container/node data)
    controller_url: str = "http://controller:8080"
    
    # Redis/DragonflyDB (for chat history)
    redis_url: str = "redis://localhost:6379"
    
    # External APIs for richer context
    ancientreport_api_url: str = "http://AncientReport-analysis:8000"
    mithrillog_api_url: str = "http://mithrillog-xcr9-api-1:9000"
    
    class Config:
        env_prefix = "METALMIND_"
        env_file = ".env"


settings = Settings()
