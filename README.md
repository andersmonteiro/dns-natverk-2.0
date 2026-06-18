# DNS Panel

Interface web para gerenciamento e monitoramento de servidores BIND9, estilo Grafana.

**Stack:** React + FastAPI + SQLite + Docker

---

## Início rápido

### 1. Configurar

```bash
cp .env.example .env
# Edite .env e troque SECRET_KEY por uma string aleatória
```

### 2. Gerar certificado SSL (se ainda não tiver)

```bash
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out nginx/certs/server.crt \
  -subj "/CN=dns-panel"
```

### 3. Subir

```bash
docker compose up -d
```

Acesse: **https://localhost**

Login padrão: `admin` / `admin` — **troque a senha após o primeiro acesso.**

---

## Configuração do BIND9

Para que o coletor funcione, o BIND precisa ter o querylog ativo.

No `named.conf.logging`, adicione:

```
channel ifdns_queries {
    file "/var/log/named/queries.log" versions 5 size 200m;
    severity info;
    print-time yes;
    print-category yes;
    print-severity yes;
};

category queries { ifdns_queries; };
```

Depois, ative:

```bash
rndc reconfig
rndc querylog on
```

Ajuste `BIND_LOG_PATH` no `.env` se o caminho for diferente.

---

## Estrutura

```
dns-panel/
├── backend/          FastAPI (API REST + coletor)
├── frontend/         React (UI estilo Grafana)
├── nginx/            Reverse proxy + SSL
├── docker-compose.yml
└── .env.example
```

## Funcionalidades

- Dashboard com métricas em tempo real (CPU, memória, disco, BIND)
- Gráficos de queries DNS com seletor de janela temporal (1h → 30d)
- Top clientes e top domínios
- Distribuição de tipos de query (A, AAAA, MX, etc.)
- Widget de saúde do coletor
- Operações BIND: checkconf, flush, stats, reconfig, querylog
- Lista de bloqueios de domínio
- Autenticação JWT

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `SECRET_KEY` | `changeme` | Chave JWT — **troque em produção** |
| `BIND_LOG_PATH` | `/var/log/named/queries.log` | Caminho do querylog |
| `RNDC_PATH` | `/usr/sbin/rndc` | Caminho do rndc |
| `COLLECTOR_ENABLED` | `true` | Liga/desliga o coletor |
| `HTTP_PORT` | `80` | Porta HTTP (redireciona para HTTPS) |
| `HTTPS_PORT` | `443` | Porta HTTPS |
