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
for f in named.conf named.conf.options named.conf.local; do
  if [ ! -f "$BIND_CFG/$f" ]; then
    cp "/etc/bind-defaults/$f" "$BIND_CFG/$f"
    echo "[entrypoint] Criado: $BIND_CFG/$f"
  fi
done

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
exec /usr/sbin/named -g -u bind
