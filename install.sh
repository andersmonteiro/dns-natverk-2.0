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

# ── 6. Sobe os containers ─────────────────────────────────────────────────────
info "Construindo e subindo os containers (modo produção)..."
make prod-build
success "Containers no ar."

# ── 7. Resumo ─────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        Instalação concluída!             ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Acesse:${NC}    https://$IP"
echo -e "  ${BOLD}Usuário:${NC}   admin"
echo -e "  ${BOLD}Senha:${NC}     admin  ${YELLOW}← troque imediatamente!${NC}"
echo ""
echo -e "  ${BOLD}Instalar em outro servidor:${NC}"
echo -e "  curl -fsSL https://raw.githubusercontent.com/andersmonteiro/dns-natverk-2.0/main/install.sh | bash"
echo ""
echo -e "  ${BOLD}Atualizar este servidor:${NC}"
echo -e "  cd $INSTALL_DIR && bash install.sh"
echo ""
