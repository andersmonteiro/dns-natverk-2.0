FROM nlnetlabs/krill:latest

USER root

# gettext-base fornece envsubst para substituição de variáveis no template
RUN apt-get update && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY krill.conf.template /etc/krill.conf.template
COPY entrypoint.sh /entrypoint-natverk.sh
RUN chmod +x /entrypoint-natverk.sh

ENTRYPOINT ["/entrypoint-natverk.sh"]
