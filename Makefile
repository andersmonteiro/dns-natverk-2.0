DC      = docker compose
DC_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: up down build logs ps prod prod-build prod-down

## Desenvolvimento (bridge network — Docker Desktop / WSL2)
up:
	$(DC) up -d

build:
	$(DC) up --build -d

down:
	$(DC) down

logs:
	$(DC) logs -f

ps:
	$(DC) ps

## Produção (host network — servidor Debian com BIND9 no host)
prod:
	$(DC_PROD) up -d

prod-build:
	$(DC_PROD) up --build -d

prod-down:
	$(DC_PROD) down
