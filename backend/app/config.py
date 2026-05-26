from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Inmobiliaria Salgueiro"
    database_url: str = "sqlite:///./app.db"
    jwt_secret: str = "poc-demo-secret-change-me"
    jwt_algorithm: str = "HS256"
    demo_admin_email: str = "admin@salgueiro.test"
    demo_admin_password: str = "admin123"
    default_commission_percent: float = 8.0
    default_irpf_percent: float = 10.5
    iva_percent: float = 22.0
    invoices_email_address: str = "facturas@tu-dominio.com"
    invoices_email_host: str = "imap.gmail.com"
    invoices_email_username: str = "facturas@tu-dominio.com"
    invoices_email_secret_env_var: str = "FACTURAS_EMAIL_PASSWORD"
    invoices_email_folder: str = "INBOX"
    seed_demo_data_on_startup: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
