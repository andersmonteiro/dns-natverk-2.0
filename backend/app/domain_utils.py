"""
Utilitários para validação e proteção de domínios.
Usados por blocks.py e blocks_import.py.
"""
import re

# TLDs e sufixos que NUNCA podem ser bloqueados (causariam bloqueio em massa)
PROTECTED_TLDS = {
    # Brasil
    "com.br", "net.br", "org.br", "gov.br", "edu.br", "jus.br",
    "leg.br", "mil.br", "mp.br", "def.br", "tc.br", "trt.br",
    "tse.br", "adv.br", "arq.br", "eng.br", "med.br", "mus.br",
    "nom.br", "srv.br", "tmp.br", "tur.br",
    "br",
    # Internacionais
    "com", "net", "org", "edu", "gov", "mil", "int",
    "info", "biz", "name", "mobi", "coop", "aero", "museum",
    "io", "co", "app", "dev", "ai", "cloud", "online", "site",
    "tech", "store", "shop",
}

DOMAIN_RE = re.compile(
    r'^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)'
    r'(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$',
    re.IGNORECASE,
)


def normalizar(domain: str) -> str:
    return domain.strip().lower().rstrip(".")


def is_tld_protegido(domain: str) -> bool:
    """Retorna True se o domínio é um TLD ou sufixo que nunca deve ser bloqueado."""
    return domain in PROTECTED_TLDS


def dominio_valido(domain: str) -> bool:
    """Valida sintaxe básica de domínio."""
    if not domain or len(domain) > 253:
        return False
    if not DOMAIN_RE.match(domain):
        return False
    parts = domain.split(".")
    # Mínimo: SLD + TLD (ex: example.com)
    return len(parts) >= 2 and all(len(p) > 0 for p in parts)


def is_whitelisted(domain: str, whitelist: set) -> bool:
    """
    Verifica se o domínio está protegido pela whitelist.
    Faz correspondência exata E por sufixo (subdomínios também são protegidos).
    Ex: whitelist={'natverk.com.br'} → 'mail.natverk.com.br' também é protegido.

    IMPORTANTE: TLDs (com.br, com, net etc.) na whitelist NÃO protegem todos os
    seus subdomínios via suffix matching — eles já são tratados por is_tld_protegido().
    Sem essa regra, colocar 'com.br' na whitelist marcaria TODOS os .com.br como protegidos.
    """
    if domain in whitelist:
        return True
    # Verifica se algum domínio pai (não-TLD) da whitelist cobre este domínio
    parts = domain.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[i:])
        if parent in whitelist and parent not in PROTECTED_TLDS:
            return True
    return False


# Sugestões padrão agrupadas por categoria
WHITELIST_DEFAULTS = [
    # ── Prevenção de bloqueio acidental de TLDs ───────────────────────────────
    # (a camada de validação já bloqueia isso, mas reforçamos na whitelist)
    ("com.br",  "TLD — bloqueio causaria interrupção em massa"),
    ("net.br",  "TLD — bloqueio causaria interrupção em massa"),
    ("org.br",  "TLD — bloqueio causaria interrupção em massa"),
    ("gov.br",  "TLD — bloqueio causaria interrupção em massa"),
    ("com",     "TLD — bloqueio causaria interrupção em massa"),
    ("net",     "TLD — bloqueio causaria interrupção em massa"),
    ("org",     "TLD — bloqueio causaria interrupção em massa"),

    # ── Governo brasileiro ────────────────────────────────────────────────────
    ("receita.fazenda.gov.br", "Receita Federal"),
    ("esocial.gov.br",         "eSocial"),
    ("nfe.fazenda.gov.br",     "Nota Fiscal Eletrônica"),
    ("serpro.gov.br",          "SERPRO"),
    ("anatel.gov.br",          "Anatel"),
    ("mj.gov.br",              "Ministério da Justiça"),
    ("pf.gov.br",              "Polícia Federal"),
    ("tse.jus.br",             "Tribunal Superior Eleitoral"),
    ("stf.jus.br",             "Supremo Tribunal Federal"),
    ("caixa.gov.br",           "Caixa Econômica Federal"),
    ("bb.com.br",              "Banco do Brasil"),
    ("bcb.gov.br",             "Banco Central do Brasil"),
    ("previdencia.gov.br",     "Previdência Social"),
    ("gov.br",                 "Portal do Governo Federal"),

    # ── Google ────────────────────────────────────────────────────────────────
    ("google.com",             "Google"),
    ("google.com.br",          "Google Brasil"),
    ("googleapis.com",         "Google APIs"),
    ("gstatic.com",            "Google Static / CDN"),
    ("googleusercontent.com",  "Google User Content"),
    ("gmail.com",              "Gmail"),
    ("youtube.com",            "YouTube"),
    ("youtu.be",               "YouTube (links curtos)"),
    ("googlevideo.com",        "YouTube CDN"),
    ("ggpht.com",              "Google Photos/CDN"),
    ("chromium.org",           "Chromium"),
    ("google-analytics.com",   "Google Analytics"),

    # ── Microsoft ─────────────────────────────────────────────────────────────
    ("microsoft.com",          "Microsoft"),
    ("windows.com",            "Windows"),
    ("windowsupdate.com",      "Windows Update"),
    ("microsoftonline.com",    "Microsoft 365 / Entra ID"),
    ("office.com",             "Microsoft Office"),
    ("outlook.com",            "Outlook"),
    ("live.com",               "Microsoft Live"),
    ("hotmail.com",            "Hotmail"),
    ("azure.com",              "Microsoft Azure"),
    ("azureedge.net",          "Azure CDN"),
    ("msftconnecttest.com",    "Windows conectividade check"),
    ("msecnd.net",             "Microsoft CDN"),
    ("skype.com",              "Skype"),
    ("teams.microsoft.com",    "Microsoft Teams"),
    ("sharepoint.com",         "SharePoint"),
    ("onedrive.com",           "OneDrive"),

    # ── Apple ─────────────────────────────────────────────────────────────────
    ("apple.com",              "Apple"),
    ("icloud.com",             "iCloud"),
    ("mzstatic.com",           "App Store / Apple CDN"),
    ("akamaized.net",          "Apple CDN (Akamai)"),

    # ── Meta / WhatsApp ───────────────────────────────────────────────────────
    ("whatsapp.com",           "WhatsApp"),
    ("whatsapp.net",           "WhatsApp (rede)"),
    ("facebook.com",           "Facebook"),
    ("instagram.com",          "Instagram"),
    ("fbcdn.net",              "Facebook CDN"),

    # ── Cloudflare / DNS ─────────────────────────────────────────────────────
    ("cloudflare.com",         "Cloudflare"),
    ("cloudflare-dns.com",     "Cloudflare DNS"),
    ("1dot1dot1dot1.cloudflare.com", "Cloudflare DoH"),

    # ── Infraestrutura / CDN ─────────────────────────────────────────────────
    ("amazonaws.com",          "Amazon AWS"),
    ("amazontrust.com",        "Amazon Certificate Authority"),
    ("awsstatic.com",          "AWS Static Assets"),
    ("fastly.net",             "Fastly CDN"),
    ("akamai.net",             "Akamai CDN"),
    ("akadns.net",             "Akamai DNS"),
    ("edgesuite.net",          "Akamai CDN"),

    # ── Certificados / PKI ────────────────────────────────────────────────────
    ("letsencrypt.org",        "Let's Encrypt CA"),
    ("digicert.com",           "DigiCert CA"),
    ("verisign.com",           "VeriSign CA"),
    ("sectigo.com",            "Sectigo CA"),
    ("ocsp.msocsp.com",        "Microsoft OCSP"),
    ("crl.microsoft.com",      "Microsoft CRL"),

    # ── NTP ───────────────────────────────────────────────────────────────────
    ("pool.ntp.org",           "NTP Pool"),
    ("time.windows.com",       "Windows Time"),
    ("time.apple.com",         "Apple Time"),
    ("time.google.com",        "Google Time"),
]
