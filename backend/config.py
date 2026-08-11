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

    # Redis — must be a full URL. Managed providers (Redis Cloud, Upstash) list the
    # endpoint as bare "host:port"; the scheme and credentials have to be added:
    #   redis://default:<password>@host:port      (plain)
    #   rediss://default:<password>@host:port     (TLS)
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

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = "tracking"
    CLOUDINARY_API_KEY: str = "197499997174349"
    CLOUDINARY_API_SECRET: str = "5L_I3PjJDP_YfZpWVUHpMKogixo"

    # Basecamp OAuth
    BASECAMP_REDIRECT_URI: str = "http://localhost:3000/callback"

    # CORS — accepts a JSON array '["https://yourapp.vercel.app"]' or a plain
    # comma-separated list. Entries must be bare origins; any trailing slash is
    # stripped, since the browser's Origin header never carries one.
    # Kept as a str, not a list: pydantic-settings JSON-decodes complex-typed
    # fields inside the env source, before any validator runs, so a non-JSON
    # value there raises SettingsError at import and the app never boots.
    # Read the parsed value from .cors_origins.
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Rate limiting (requests allowed per second per IP)
    RATE_LIMIT_PER_SECOND: int = 500

    @model_validator(mode="after")
    def validate_secret_key(self):
        if not self.SECRET_KEY:
            raise ValueError("SECRET_KEY must be set via environment variable")
        return self

    @field_validator("REDIS_URL", mode="after")
    @classmethod
    def normalize_redis_url(cls, v: str) -> str:
        """Accept a bare host:port endpoint by adding the default scheme.

        redis-py rejects a scheme-less URL with a ValueError raised inside the
        FastAPI lifespan, which kills every gunicorn worker at boot. Managed Redis
        dashboards display the endpoint as "host:port", so that value regularly
        lands in REDIS_URL verbatim. Normalize it instead of failing to start.
        """
        v = v.strip()
        if not v:
            raise ValueError("REDIS_URL must be set")
        if "://" not in v:
            return f"redis://{v}"
        return v

    @property
    def cors_origins(self) -> list:
        """The origin allow-list, from a JSON array or a comma-separated string.

        A malformed entry is not an error anywhere at startup — it only surfaces
        later as Starlette answering every preflight with 400 "Disallowed CORS
        origin", which reads like a backend outage rather than a config typo.
        So each entry is normalized: whitespace trimmed, trailing slash removed
        (the Origin header never has one, making "https://app.vercel.app/" a
        silent no-match), and blanks dropped. Entries are also split on commas —
        a comma cannot occur in a valid origin, so '["a.com , b.com"]' is always
        two origins crammed into one JSON string rather than a single origin.
        """
        raw = self.ALLOWED_ORIGINS
        if isinstance(raw, str):
            raw = raw.strip()
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = [raw]
            # A JSON scalar (e.g. '"https://a.com"' or a bare host) is still one origin.
            if not isinstance(parsed, list):
                parsed = [parsed]
        else:
            parsed = raw
        flattened = (part for x in parsed for part in str(x).split(","))
        return [o for o in (p.strip().rstrip("/") for p in flattened) if o]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
