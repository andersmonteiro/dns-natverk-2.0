#!/bin/sh
set -e

# Diretório necessário para o socket do Krill
mkdir -p /run/krill

# Krill 0.16+ usa KRILL_ADMIN_TOKEN — garante compatibilidade
export KRILL_ADMIN_TOKEN="${KRILL_ADMIN_TOKEN:-${KRILL_AUTH_TOKEN}}"

# Gera /etc/krill.conf a partir do template substituindo variáveis de ambiente
envsubst < /etc/krill.conf.template > /etc/krill.conf

echo "[krill] Configuração gerada para FQDN: ${KRILL_FQDN}"
exec krill --config /etc/krill.conf
