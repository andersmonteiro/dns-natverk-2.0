#!/bin/bash
set -e

BIND_CFG="/etc/bind"
ZONES_DIR="$BIND_CFG/zones"
LOG_DIR="/var/log/named"

# ── Diretórios ────────────────────────────────────────────────────────────────
mkdir -p "$ZONES_DIR" "$LOG_DIR"
chown -R bind:bind "$LOG_DIR"
chmod 755 "$LOG_DIR"

# ── Configs padrão (só na primeira execução do volume) ────────────────────────
# Usa sentinela porque Docker pré-popula o volume com os defaults do Debian,
# então checar se o arquivo existe não é suficiente.
if [ ! -f "$BIND_CFG/.natverk-initialized" ]; then
  echo "[entrypoint] Primeira execução — aplicando configs Nätverk..."
  cp "/etc/bind-defaults/named.conf"         "$BIND_CFG/named.conf"
  cp "/etc/bind-defaults/named.conf.options" "$BIND_CFG/named.conf.options"
  cp "/etc/bind-defaults/named.conf.local"   "$BIND_CFG/named.conf.local"
  cp "/etc/bind-defaults/db.bloqueio"        "$BIND_CFG/db.bloqueio"
  touch "$BIND_CFG/.natverk-initialized"
  echo "[entrypoint] Configs aplicadas."
fi

# ── Garante include de named.conf.blocks (upgrade-safe) ──────────────────────
if ! grep -q "named.conf.blocks" "$BIND_CFG/named.conf" 2>/dev/null; then
  echo 'include "/etc/bind/named.conf.blocks";' >> "$BIND_CFG/named.conf"
  echo "[entrypoint] Adicionado include named.conf.blocks ao named.conf"
fi

# ── named.conf.blocks — criado vazio se não existir ──────────────────────────
if [ ! -f "$BIND_CFG/named.conf.blocks" ]; then
  echo '; Gerenciado automaticamente pelo DNS Natverk Panel' > "$BIND_CFG/named.conf.blocks"
  echo "[entrypoint] Criado: named.conf.blocks"
fi

# ── db.bloqueio — criado se não existir (upgrade-safe) ───────────────────────
if [ ! -f "$BIND_CFG/db.bloqueio" ]; then
  cp "/etc/bind-defaults/db.bloqueio" "$BIND_CFG/db.bloqueio"
  echo "[entrypoint] Criado: db.bloqueio"
fi

# ── Chave rndc (gerada uma vez, persiste no volume) ───────────────────────────
if [ ! -f "$BIND_CFG/rndc.key" ]; then
  echo "[entrypoint] Gerando chave rndc..."
  rndc-confgen -a -b 256 -k rndc-key -c "$BIND_CFG/rndc.key" 2>/dev/null
  chmod 640 "$BIND_CFG/rndc.key"
  chown root:bind "$BIND_CFG/rndc.key"
  echo "[entrypoint] rndc.key criado."
fi

# ── Arquivo de log ────────────────────────────────────────────────────────────
if [ ! -f "$LOG_DIR/queries.log" ]; then
  touch "$LOG_DIR/queries.log"
  chown bind:bind "$LOG_DIR/queries.log"
  chmod 640 "$LOG_DIR/queries.log"
fi

echo "[entrypoint] Iniciando named..."
exec /usr/sbin/named -f -u bind
