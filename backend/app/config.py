"""Server-side configuration with local .env support."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def is_database_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


def allowed_origins() -> list[str]:
    value = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
