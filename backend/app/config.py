from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:////data/dns_panel.db"
    secret_key: str = "changeme"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    bind_log_path: str = "/var/log/named/queries.log"
    rndc_path: str = "/usr/sbin/rndc"
    rndc_host: str = "127.0.0.1"  # prod: 127.0.0.1 (host network). dev: host.docker.internal
    collector_enabled: bool = True

    class Config:
        env_file = ".env"

settings = Settings()
