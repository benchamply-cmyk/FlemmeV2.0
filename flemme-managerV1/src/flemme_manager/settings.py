"""Environment-backed settings; no secrets are serialized into frontend content."""
import os
from dotenv import load_dotenv
from pydantic import BaseModel
load_dotenv()

class Settings(BaseModel):
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    service_key: str | None = os.getenv("FLEMME_SERVICE_KEY")
    operator_key: str | None = os.getenv("FLEMME_OPERATOR_KEY")
    executor_key: str | None = os.getenv("FLEMME_EXECUTOR_KEY")
    database_path: str = os.getenv("FLEMME_DATABASE_PATH", ".runtime/qualification.sqlite3")
    retention_days: int = int(os.getenv("FLEMME_RETENTION_DAYS", "30"))
    daily_model_limit: int = int(os.getenv("FLEMME_DAILY_MODEL_LIMIT", "300"))
settings = Settings()
