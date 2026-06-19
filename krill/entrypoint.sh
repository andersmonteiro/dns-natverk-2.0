#!/bin/bash
set -e

# Gera /etc/krill.conf a partir do template substituindo variáveis de ambiente
envsubst < /etc/krill.conf.template > /etc/krill.conf

echo "[krill] Configuração gerada para FQDN: ${KRILL_FQDN}"
exec krill --config /etc/krill.conf
