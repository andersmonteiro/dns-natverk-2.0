# DNS Nätverk Panel

Interface web para gerenciamento e monitoramento de servidores BIND9 + RPKI Krill.

**Stack:** React 18 + FastAPI + SQLite + Docker · BIND9 · Krill RPKI

---

## Instalação em novo servidor

### Pré-requisito: Deploy Key

O repositório é privado. Cada servidor precisa de uma deploy key cadastrada no GitHub antes de rodar o instalador.

**1. No servidor novo, gera a chave:**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub
```

**2. Cadastra a chave pública no GitHub:**

GitHub → repositório → **Settings → Deploy keys → Add deploy key**
- Title: nome do servidor (ex: `ntk-wsp-dns01`)
- Key: cola a linha `ssh-ed25519 AAAA...`
- Allow write access: **desmarcado**

**3. Envia o `install.sh` para o servidor e executa:**
```bash
bash install.sh
```

O instalador vai:
- Instalar Docker e dependências
- Clonar o repositório via SSH usando a deploy key
- Gerar `.env` com secrets aleatórios
- Gerar certificado SSL autoassinado
- Subir todos os containers

Acesse: **https://IP_DO_SERVIDOR**

Login padrão: `admin` / `Admin@1234` — **troque a senha após o primeiro acesso.**

---

## Atualização (servidor já instalado)

```bash
bash install.sh
```

O mesmo script detecta que o projeto já existe e faz `git pull` + rebuild dos containers.

---

## Estrutura

```
dns-natverk-2.0/
├── backend/          FastAPI (API REST + coletor de querylog)
├── frontend/         React 18 (UI)
├── nginx/            Reverse proxy + SSL
├── bind/             BIND9 em container
├── krill/            Krill RPKI CA em container
├── docker-compose.yml
├── docker-compose.prod.yml
├── install.sh        Instalador
└── .env.example
```

---

## Funcionalidades

- Dashboard com status do DNS, uptime, queries e clientes únicos
- Métricas: série temporal por tipo, distribuição por hora, top clientes, top domínios, top tipos
- Log DNS em tempo real
- Operações BIND: flush, stats, reconfig, querylog, checkconf
- Configuração de zonas DNS (GUI + modo pro)
- Lista de bloqueios e whitelist de domínios
- RPKI Krill: gestão de CAs, ROAs e BGP analysis
- Backups
- Autenticação JWT com controle de usuários e auditoria
- Tema claro/escuro

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `SECRET_KEY` | gerado | Chave JWT — gerada automaticamente pelo instalador |
| `BIND_LOG_PATH` | `/var/log/named/queries.log` | Caminho do querylog |
| `RNDC_PATH` | `/usr/sbin/rndc` | Caminho do rndc |
| `COLLECTOR_ENABLED` | `true` | Liga/desliga o coletor |
| `HTTP_PORT` | `80` | Porta HTTP |
| `HTTPS_PORT` | `443` | Porta HTTPS |
| `KRILL_AUTH_TOKEN` | gerado | Token da API do Krill |
| `KRILL_FQDN` | IP do servidor | FQDN público para URIs do RPKI |
| `SERVER_IPV4` | detectado | IPv4 público (detectado pelo instalador) |
| `SERVER_IPV6` | detectado | IPv6 público (detectado pelo instalador) |

---

## Integração RPKI (registro.br)

Com o Krill no ar, o fluxo para integrar ao registro.br é:

1. Criar uma CA no painel (RPKI → Configuração)
2. Baixar o **Child Request XML** e enviar ao registro.br
3. Colar o **Parent Response XML** recebido do registro.br
4. Baixar o **Publisher Request XML** e enviar ao registro.br
5. Colar o **Repository Response XML** recebido
6. Adicionar ROAs com ASN e prefixos da rede

---

## Segurança

- Repositório privado — acesso via deploy key SSH por servidor
- Secrets gerados automaticamente no primeiro install (`SECRET_KEY`, `KRILL_AUTH_TOKEN`)
- `.env` nunca commitado (`.gitignore`)
- Troque a senha padrão do admin após o primeiro acesso
