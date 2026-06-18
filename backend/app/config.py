from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:////data/dns_panel.db"
    secret_key: str = "changeme"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    bind_log_path: str = "/var/log/named/queries.log"
    rndc_path: str = "/usr/sbin/rndc"
    rndc_host: str = "bind"          # nome do serviço Docker
    rndc_key_file: str = "/etc/bind/rndc.key"
    rndc_port: int = 953
    collector_enabled: bool = True

    # Diretórios do BIND (volumes compartilhados)
    bind_conf_dir: str = "/etc/bind"
    bind_zones_dir: str = "/etc/bind/zones"

    class Config:
        env_file = ".env"

settings = Settings()
