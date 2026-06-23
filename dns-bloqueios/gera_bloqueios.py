#!/usr/bin/env python3
"""
Gera o arquivo named.conf.bloqueios-anatel a partir de planilhas e/ou PDFs da Anatel.
Aceita qualquer combinação de arquivos .xlsx e .pdf, ou uma pasta inteira.

Uso:
  python3 gera_bloqueios.py arquivo1.xlsx arquivo2.pdf pasta/
  python3 gera_bloqueios.py --acumular lista_anterior.conf novos.pdf
"""

import sys
import re
import subprocess
import pandas as pd
from pathlib import Path
from datetime import datetime

ZONE_FILE  = "/etc/bind/db.blocked"
OUTPUT_FILE = "named.conf.bloqueios-anatel"

# Expressão para identificar domínios
DOMINIO_RE = re.compile(r'^([a-z0-9][a-z0-9\-\.]+\.[a-z]{2,})$', re.IGNORECASE)

# TLDs/sufixos de domínios governamentais e institucionais que NUNCA devem ser bloqueados
TLD_WHITELIST = re.compile(
    r'\.(gov\.br|jus\.br|leg\.br|mil\.br|edu\.br|mp\.br|def\.br|'
    r'tc\.br|trt\.br|tse\.br|stf\.jus\.br|stj\.jus\.br|'
    r'anatel\.gov\.br|mj\.gov\.br|pf\.gov\.br)$',
    re.IGNORECASE
)

# Marcadores que indicam o início da seção de domínios nos PDFs
MARCADORES_INICIO = [
    r'DOMÍNIOS?\s+(JÁ\s+)?BLOQUEADOS?',
    r'Tabela\s*[-–]\s*Anexo',
    r'URL\s*/\s*Endereço\s+IP\s+do\s+Host',
    r'IP\s+Host\s+Ad+ress\s+or\s+URL',
    r'endereços?\s+eletrônicos?\s+a\s+ser',
    r'lista\s+de\s+domínios',
    r'DNS\s+novos',
]
MARCADORES_RE = re.compile('|'.join(MARCADORES_INICIO), re.IGNORECASE)


def filtrar_dominio(dominio):
    """Retorna False se o domínio não deve ser bloqueado."""
    if TLD_WHITELIST.search(dominio):
        return False
    # Ignora strings muito curtas ou sem ponto real
    partes = dominio.split('.')
    if len(partes) < 2 or any(len(p) == 0 for p in partes):
        return False
    return True


def extrair_de_pdf(caminho):
    result = subprocess.run(
        ['pdftotext', str(caminho), '-'],
        capture_output=True, text=True, timeout=60
    )
    texto = result.stdout

    dominios = set()
    dentro_da_tabela = False

    for line in texto.splitlines():
        linha = line.strip()

        # Detecta início da seção de domínios
        if MARCADORES_RE.search(linha):
            dentro_da_tabela = True
            continue

        if not dentro_da_tabela:
            continue

        # Dentro da tabela: testa cada token da linha (lida com prefixos como "-")
        for token in linha.split():
            token = token.strip('-').strip()
            if DOMINIO_RE.match(token) and filtrar_dominio(token):
                dominios.add(token.lower())

    # Se não achou marcador, cai no modo permissivo com filtro de TLD
    if not dominios:
        for line in texto.splitlines():
            token = line.strip()
            if DOMINIO_RE.match(token) and filtrar_dominio(token):
                dominios.add(token.lower())

    return dominios


def extrair_de_xlsx(caminho):
    try:
        df = pd.read_excel(caminho, header=None)
        inicio = None
        for i, row in df.iterrows():
            if row.astype(str).str.contains('Bloqueio', case=False).any():
                inicio = i + 1
                break
        if inicio is None:
            inicio = 11

        dados = df.iloc[inicio:].copy()
        if dados.shape[1] >= 4:
            dados.columns = list(range(dados.shape[1]))
            dados = dados[dados[0].notna()]
            dados = dados[dados[3].astype(str).str.contains('Bloqueio', na=False)]
        else:
            dados = dados[dados[0].notna()]

        dominios = set()
        for val in dados[0].astype(str).str.strip().str.lower():
            if DOMINIO_RE.match(val) and filtrar_dominio(val):
                dominios.add(val)
        return dominios
    except Exception as e:
        print(f"  Aviso ao ler xlsx: {e}")
        return set()


def extrair_de_conf(caminho):
    """Lê domínios de um named.conf gerado anteriormente."""
    dominios = set()
    zone_re = re.compile(r'zone\s+"([^"]+)"')
    try:
        with open(caminho) as f:
            for line in f:
                m = zone_re.search(line)
                if m:
                    dominios.add(m.group(1).lower())
    except Exception as e:
        print(f"  Aviso ao ler conf: {e}")
    return dominios


def coletar_arquivos(entradas):
    arquivos = []
    for entrada in entradas:
        p = Path(entrada)
        if p.is_dir():
            arquivos += list(p.glob('*.xlsx'))
            arquivos += list(p.glob('*.pdf'))
        elif p.is_file():
            arquivos.append(p)
        else:
            print(f"Não encontrado: {entrada}")
    return arquivos


def extrair_dominios(arquivo):
    ext = arquivo.suffix.lower()
    print(f"  Lendo {arquivo.name}...", end=" ", flush=True)
    if ext == '.xlsx':
        dominios = extrair_de_xlsx(arquivo)
    elif ext == '.pdf':
        dominios = extrair_de_pdf(arquivo)
    elif ext in ('.conf', '.local'):
        dominios = extrair_de_conf(arquivo)
    else:
        print("formato não suportado, ignorando.")
        return set()
    print(f"{len(dominios)} domínios")
    return dominios


def gerar_conf(dominios, fontes):
    linhas = [
        f'// Bloqueio DNS - Anatel',
        f'// Fontes: {", ".join(fontes)}',
        f'// Total consolidado: {len(dominios)} dominios | Gerado em: {datetime.now().strftime("%d/%m/%Y %H:%M")}',
        '',
    ]
    for dominio in sorted(dominios):
        linhas.append(f'zone "{dominio}" {{ type master; file "{ZONE_FILE}"; }};')
    return "\n".join(linhas)


def main():
    args = sys.argv[1:]

    acumular_de = None
    if '--acumular' in args:
        idx = args.index('--acumular')
        acumular_de = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    if not args:
        print("Uso: python3 gera_bloqueios.py arquivo1.xlsx arquivo2.pdf pasta/")
        print("     python3 gera_bloqueios.py --acumular conf_anterior.conf novos.pdf")
        sys.exit(1)

    todos_dominios = set()

    if acumular_de:
        print(f"Carregando lista anterior: {acumular_de}")
        anteriores = extrair_de_conf(acumular_de)
        print(f"  {len(anteriores)} domínios carregados")
        todos_dominios.update(anteriores)

    arquivos = coletar_arquivos(args)
    if not arquivos:
        print("Nenhum arquivo .xlsx ou .pdf encontrado.")
        sys.exit(1)

    print(f"\nProcessando {len(arquivos)} arquivo(s):")
    fontes = []
    novos_total = set()
    for arq in sorted(arquivos):
        dominios = extrair_dominios(arq)
        novos_total.update(dominios)
        fontes.append(arq.name)

    duplicatas = novos_total & todos_dominios
    todos_dominios.update(novos_total)

    print(f"\nResumo:")
    print(f"  Domínios encontrados nos arquivos: {len(novos_total)}")
    if acumular_de:
        print(f"  Duplicatas (já existiam):          {len(duplicatas)}")
        print(f"  Realmente novos:                   {len(novos_total - duplicatas)}")
    print(f"  Total final (sem duplicatas):      {len(todos_dominios)}")

    conf = gerar_conf(todos_dominios, fontes)
    with open(OUTPUT_FILE, 'w') as f:
        f.write(conf)

    print(f"\nArquivo gerado: {OUTPUT_FILE}")
    print("\nPróximos passos no servidor:")
    print(f"  sudo cp {OUTPUT_FILE} /etc/bind/{OUTPUT_FILE}")
    print(f"  sudo named-checkconf && sudo rndc reload")


if __name__ == "__main__":
    main()
