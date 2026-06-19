FROM nlnetlabs/krill:latest

USER root

# gettext fornece envsubst para substituição de variáveis no template (Alpine)
RUN apk add --no-cache gettext

COPY krill.conf.template /etc/krill.conf.template
COPY entrypoint.sh /entrypoint-natverk.sh
RUN chmod +x /entrypoint-natverk.sh

ENTRYPOINT ["/entrypoint-natverk.sh"]
