FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bind9 bind9utils bind9-doc \
    && rm -rf /var/lib/apt/lists/*

# Configs padrão — copiados para o volume na primeira execução pelo entrypoint
COPY defaults/ /etc/bind-defaults/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cria diretório de log
RUN mkdir -p /var/log/named && chown bind:bind /var/log/named

EXPOSE 53/udp 53/tcp 953/tcp

ENTRYPOINT ["/entrypoint.sh"]
