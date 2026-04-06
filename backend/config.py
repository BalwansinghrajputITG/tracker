from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from functools import lru_cache
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Enterprise PM System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = ""
    API_PREFIX: str = "/api/v1"

    # MongoDB
    MONGODB_URL: str = ""
    MONGODB_DB_NAME: str = "enterprise_pm"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Groq (fallback)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # AWS Bedrock — Amazon Nova (primary)
    AWS_ACCESS_KEY: str = ""
    AWS_BEDROCK_SECRET_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "amazon.nova-pro-v1:0"

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@company.com"

    # CORS
    ALLOWED_ORIGINS: list = []

    # Rate limiting (requests allowed per second per IP)
    RATE_LIMIT_PER_SECOND: int = 500

    @model_validator(mode="after")
    def validate_secret_key(self):
        if not self.SECRET_KEY:
            raise ValueError("SECRET_KEY must be set via environment variable")
        return self

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
