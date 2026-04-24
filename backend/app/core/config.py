from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Klypup API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"

    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # Firebase Admin
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_CREDENTIALS_JSON: str = ""

    # Supabase (service role on the backend; anon key is frontend-only)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Google AI (Gemini) for embeddings / agent
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Market data cache TTLs (seconds)
    QUOTE_CACHE_TTL: int = 300
    SECTOR_CACHE_TTL: int = 900
    MOVERS_CACHE_TTL: int = 600

    # News providers
    NEWS_API_KEY: str = ""      # https://newsapi.org
    GNEWS_API_KEY: str = ""     # https://gnews.io

    # Financial Modeling Prep (optional — used for extra quarterly data + quote fallback)
    FMP_API_KEY: str = ""

    # Alpha Vantage (optional — used as ETF/index fallback when Yahoo is rate-limited)
    ALPHA_VANTAGE_KEY: str = ""

    # Reddit (PRAW)
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "klypup-research/1.0 (by /u/klypup_bot)"

    # SEC EDGAR requires a contact email in the User-Agent. Example:
    #   "Klypup Research research@klypup.example"
    SEC_USER_AGENT: str = "Klypup Research contact@example.com"

    # RAG / ChromaDB
    CHROMA_PATH: str = "./chroma_db"
    CHROMA_COLLECTION: str = "sec_filings"


@lru_cache
def _load_settings() -> Settings:
    return Settings()


settings = _load_settings()
