#!/bin/bash
# Gera queries DNS reais contra o BIND local para popular o querylog
# Uso: bash gen_queries.sh [rounds]

SERVER="127.0.0.1"
ROUNDS=${1:-5}

DOMAINS=(
  google.com cloudflare.com github.com youtube.com facebook.com
  netflix.com amazon.com twitter.com reddit.com openai.com
  microsoft.com apple.com spotify.com discord.com whatsapp.com
  instagram.com linkedin.com twitch.tv dropbox.com notion.so
  vercel.com digitalocean.com linode.com ovh.com hetzner.com
  smtp.gmail.com mail.yahoo.com imap.outlook.com
  api.github.com fonts.googleapis.com cdn.cloudflare.com
  s3.amazonaws.com accounts.google.com login.microsoftonline.com
)

TYPES=(A AAAA MX NS TXT)

echo "Servidor: $SERVER | Rounds: $ROUNDS | Domínios: ${#DOMAINS[@]}"
echo "--------------------------------------------------------------"

total=0
for round in $(seq 1 $ROUNDS); do
  echo "Round $round/$ROUNDS..."
  for domain in "${DOMAINS[@]}"; do
    for qtype in "${TYPES[@]}"; do
      dig @$SERVER $domain $qtype +short +time=2 +tries=1 > /dev/null 2>&1
      ((total++))
    done
  done
done

echo "--------------------------------------------------------------"
echo "✓ $total queries enviadas."
