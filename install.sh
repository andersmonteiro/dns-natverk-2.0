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

# Detecta IPs públicos no HOST (tem acesso às interfaces reais)
info "Detectando IPs públicos do servidor..."
PUBLIC_IPV4=$(curl -s -4 --max-time 5 https://api.ipify.org 2>/dev/null \
  || ip -4 addr show scope global | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | head -1 \
  || hostname -I | awk '{print $1}')
PUBLIC_IPV6=$(curl -s -6 --max-time 5 https://api6.ipify.org 2>/dev/null \
  || curl -s -6 --max-time 5 https://ipv6.icanhazip.com 2>/dev/null \
  || ip -6 addr show scope global | grep -oP '(?<=inet6 )[\da-f:]+' | grep -v '^fe80' | head -1 \
  || true)

[ -n "$PUBLIC_IPV4" ] && info "IPv4 detectado: $PUBLIC_IPV4" || warn "IPv4 não detectado"
[ -n "$PUBLIC_IPV6" ] && info "IPv6 detectado: $PUBLIC_IPV6" || warn "IPv6 não detectado"

if [ ! -f .env ]; then
  info "Gerando arquivo .env..."
  cp .env.example .env

  # JWT secret
  SECRET=$(openssl rand -hex 32)
  sed -i "s/changeme-please-set-in-env/$SECRET/" .env

  # Krill auth token
  KRILL_TOKEN=$(openssl rand -hex 32)
  sed -i "s/changeme-krill-token/$KRILL_TOKEN/" .env

  # FQDN do Krill
  sed -i "s/SEU_IP_OU_DOMINIO_AQUI/${PUBLIC_IPV4:-localhost}/" .env

  success "Arquivo .env criado (SECRET_KEY, KRILL_AUTH_TOKEN e KRILL_FQDN configurados)."
else
  warn ".env já existe — mantendo configuração atual."
  # Adiciona variáveis do Krill se não existirem (upgrade de instalações antigas)
  if ! grep -q "KRILL_AUTH_TOKEN" .env; then
    KRILL_TOKEN=$(openssl rand -hex 32)
    echo "" >> .env
    echo "# Krill RPKI (adicionado pelo instalador)" >> .env
    echo "KRILL_AUTH_TOKEN=$KRILL_TOKEN" >> .env
    echo "KRILL_FQDN=${PUBLIC_IPV4:-localhost}" >> .env
    echo "TZ=America/Sao_Paulo" >> .env
    info "Variáveis do Krill adicionadas ao .env existente."
  fi
fi

# Atualiza / insere SERVER_IPV4 e SERVER_IPV6 no .env (sempre, para refletir detecção atual)
_upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}
_upsert_env "SERVER_IPV4" "${PUBLIC_IPV4:-}"
_upsert_env "SERVER_IPV6" "${PUBLIC_IPV6:-}"

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

# ── 6. Porta 53 — libera para o container BIND ───────────────────────────────
info "Verificando se a porta 53 está disponível..."

# systemd-resolved ocupa 53 em muitas distros Debian/Ubuntu modernas
if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
  warn "systemd-resolved está ocupando a porta 53. Desativando..."
  systemctl disable --now systemd-resolved

  # /etc/resolv.conf costuma ser symlink para o stub do systemd — substitui por arquivo real
  rm -f /etc/resolv.conf
  printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > /etc/resolv.conf
  chmod 644 /etc/resolv.conf

  # Confirma que DNS externo funciona antes de continuar
  if ! getent hosts registry-1.docker.io &>/dev/null; then
    error "DNS externo não funcionando após desativar systemd-resolved. Verifique /etc/resolv.conf"
  fi
  success "systemd-resolved desativado. /etc/resolv.conf ajustado para 8.8.8.8."
fi

# Verifica se porta 53 UDP ainda está em uso
if ss -ulnp 2>/dev/null | grep -q ':53 ' || netstat -ulnp 2>/dev/null | grep -q ':53 '; then
  warn "Algo ainda está usando a porta 53 UDP. O container BIND pode falhar ao subir."
  warn "Verifique: ss -ulnp | grep :53"
else
  success "Porta 53 disponível."
fi

# ── 7. Para BIND no host se ainda estiver rodando ────────────────────────────
# (agora o BIND roda em container — evita conflito na porta 53)
for svc in bind9 named; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    warn "Serviço '$svc' rodando no host. Parando para ceder a porta 53 ao container..."
    systemctl disable --now "$svc" 2>/dev/null || true
    success "$svc desativado no host."
  fi
done

# ── 7. Sobe os containers ─────────────────────────────────────────────────────
info "Construindo e subindo os containers (modo produção)..."
make prod-build
success "Containers no ar."

# ── 8. Resumo ─────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${BLUE}"
echo "  ███╗   ██╗ █████╗ ████████╗██╗   ██╗███████╗██████╗ ██╗  ██╗    ██████╗ ███╗   ██╗███████╗"
echo "  ████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔════╝██╔══██╗██║ ██╔╝    ██╔══██╗████╗  ██║██╔════╝"
echo "  ██╔██╗ ██║███████║   ██║   ██║   ██║█████╗  ██████╔╝█████╔╝     ██║  ██║██╔██╗ ██║███████╗"
echo "  ██║╚██╗██║██╔══██║   ██║   ╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔═██╗     ██║  ██║██║╚██╗██║╚════██║"
echo "  ██║ ╚████║██║  ██║   ██║    ╚████╔╝ ███████╗██║  ██║██║  ██╗    ██████╔╝██║ ╚████║███████║"
echo "  ╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚══════╝"
echo -e "${NC}"
echo -e "${BOLD}${GREEN}  Instalação concluída!${NC}"
echo ""
echo -e "  ${BOLD}Acesse:${NC}  https://$IP"
echo ""
