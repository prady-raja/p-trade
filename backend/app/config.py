from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = 'P Trade API'
    app_env: str = 'development'
    allowed_origins: str = 'http://localhost:3000'

    kite_api_key: Optional[str] = None
    kite_api_secret: Optional[str] = None
    kite_redirect_url: Optional[str] = None
    kite_access_token: Optional[str] = None

    frontend_app_url: Optional[str] = None

    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None

    # DB: config — database connection settings
    database_url: Optional[str] = None   # Supabase/Postgres on Render: set DATABASE_URL
    database_path: str = 'ptrade.db'     # local SQLite path (used when DATABASE_URL is absent)

    def origins_list(self) -> List[str]:
        return [x.strip() for x in self.allowed_origins.split(',') if x.strip()]


settings = Settings()
