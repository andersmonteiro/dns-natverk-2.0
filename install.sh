#!/bin/bash
# =============================================================================
# DNS Nätverk Panel — Instalador
# Compatível com Debian/Ubuntu
# Uso: curl -fsSL https://raw.githubusercontent.com/andersmonteiro/dns-natverk-2.0/main/install.sh | bash
#   ou: bash install.sh
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║     DNS Nätverk Panel — Instalador       ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── Root check ────────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  error "Execute como root: sudo bash install.sh"
fi

# ── Detecta OS ────────────────────────────────────────────────────────────────
if [ ! -f /etc/debian_version ]; then
  error "Este instalador suporta apenas Debian/Ubuntu."
fi

INSTALL_DIR="/opt/dns-natverk"

# ── 1. Dependências ───────────────────────────────────────────────────────────
info "Atualizando pacotes e instalando dependências..."
apt-get update -qq
apt-get install -y -qq \
  git \
  curl \
  make \
  openssl \
  ca-certificates \
  gnupg \
  lsb-release \
  mtr-tiny \
  traceroute \
  whois \
  dnsutils

success "Dependências instaladas."

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  success "Docker já instalado: $(docker --version)"
else
  info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  success "Docker instalado."
fi

# ── 3. Clone ou atualiza o projeto ────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Projeto já existe em $INSTALL_DIR — atualizando..."
  git -C "$INSTALL_DIR" pull
  success "Projeto atualizado."
  info "Derrubando containers existentes..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" -f "$INSTALL_DIR/docker-compose.prod.yml" down 2>/dev/null || true
  success "Containers parados."
else
  info "Clonando projeto em $INSTALL_DIR..."
  git clone https://github.com/andersmonteiro/dns-natverk-2.0.git "$INSTALL_DIR"
  success "Projeto clonado."
fi

cd "$INSTALL_DIR"

# ── 4. Arquivo .env ───────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Gerando arquivo .env com SECRET_KEY aleatório..."
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  sed -i "s/changeme-please-set-in-env/$SECRET/" .env
  success "Arquivo .env criado com chave segura."
else
  warn ".env já existe — mantendo configuração atual."
fi

# ── 5. Certificado SSL ────────────────────────────────────────────────────────
mkdir -p nginx/certs
if [ ! -f nginx/certs/server.crt ]; then
  info "Gerando certificado SSL autoassinado..."
  HOSTNAME=$(hostname -f 2>/dev/null || hostname)
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout nginx/certs/server.key \
    -out nginx/certs/server.crt \
    -subj "/CN=$HOSTNAME/O=Natverk/C=BR" \
    2>/dev/null
  success "Certificado gerado (válido por 10 anos): CN=$HOSTNAME"
else
  warn "Certificado já existe — mantendo."
fi

# ── 6. Querylog do BIND9 ──────────────────────────────────────────────────────
NAMED_CONF="/etc/bind/named.conf"
LOG_DIR="/var/log/named"
LOG_FILE="$LOG_DIR/queries.log"

if [ -f "$NAMED_CONF" ]; then
  if grep -q "dns-natverk-querylog" "$NAMED_CONF" 2>/dev/null; then
    warn "Querylog já configurado no named.conf — mantendo."
  else
    info "Configurando querylog do BIND9..."
    mkdir -p "$LOG_DIR"
    chown bind:bind "$LOG_DIR" 2>/dev/null || true
    chmod 755 "$LOG_DIR"

    cat >> "$NAMED_CONF" << 'EOF'

# dns-natverk-querylog — adicionado pelo instalador
logging {
    channel natverk_query_log {
        file "/var/log/named/queries.log" versions 5 size 20m;
        severity dynamic;
        print-time yes;
        print-category yes;
    };
    category queries { natverk_query_log; };
};
EOF

    # Recarrega BIND se estiver rodando
    if systemctl is-active --quiet bind9 2>/dev/null || systemctl is-active --quiet named 2>/dev/null; then
      rndc reconfig 2>/dev/null && success "BIND recarregado com querylog ativo." || warn "Não foi possível recarregar BIND automaticamente. Reinicie manualmente."
    else
      warn "BIND não está rodando — querylog será ativado no próximo início."
    fi
  fi
else
  warn "named.conf não encontrado em $NAMED_CONF — querylog não configurado."
fi

# ── 7. Sobe os containers ─────────────────────────────────────────────────────
info "Construindo e subindo os containers (modo produção)..."
make prod-build
success "Containers no ar."

# ── 8. Resumo ─────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        Instalação concluída!             ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Acesse:${NC}    https://$IP"
echo ""
