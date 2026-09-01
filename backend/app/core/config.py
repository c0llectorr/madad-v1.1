from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://madad:madad@localhost:5432/madad"

    # Extraction provider: "groq" (default), "gemini", or "qwen"
    EXTRACTION_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GEMINI_API_KEY: str = ""
    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    GOOGLE_MAPS_API_KEY: str = ""

    JWT_SECRET: str = "change_me"
    JWT_EXPIRY_MINUTES: int = 480

    GRAPH_PATH: str = str(BASE_DIR / "database" / "geodata" / "demo_corridor.graphml")

    class Config:
        env_file = BASE_DIR / ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
