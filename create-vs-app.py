#!/usr/bin/env python3
"""
create-vs-app.py — Gerador de apps satelite do ecossistema VS.

Cria um app novo (React+TS+Vite / Express+Prisma) ja plugado no login do
Descontos VIP, com gate de membership (frontend + backend). O codigo de auth vem
copiado do template/ (vendoring) — cada app fica independente e editavel.

Uso:
    python create-vs-app.py
    python create-vs-app.py --name "Cursos VIP" --slug cursos-vip --port 3002 --dest ../cursos-vip

Sem argumentos, o script pergunta interativamente.
"""

import os
import sys
import shutil
import argparse
import re
from pathlib import Path

TOOLKIT = Path(__file__).resolve().parent
TEMPLATE = TOOLKIT / "template"

# Arquivos onde os placeholders sao substituidos. Binarios sao copiados sem tocar.
TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".html", ".css",
    ".py", ".prisma", ".env", ".example", ".gitignore", ".txt", "",
}

PLACEHOLDERS = ("{{APP_NAME}}", "{{APP_SLUG}}", "{{BACKEND_PORT}}")


def log(msg: str) -> None:
    print(msg, flush=True)


def slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "vs-app"


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        ans = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        ans = ""
    return ans or default


def is_text_file(path: Path) -> bool:
    # arquivos como ".env.example" / ".gitignore" entram pelo nome
    if path.name in {".env.example", ".gitignore", ".env"}:
        return True
    return path.suffix in TEXT_SUFFIXES


def substitute(text: str, mapping: dict) -> str:
    for ph, val in mapping.items():
        text = text.replace(ph, val)
    return text


def copy_template(dest: Path, mapping: dict) -> None:
    for src in TEMPLATE.rglob("*"):
        rel = src.relative_to(TEMPLATE)
        # ignora node_modules/dist/.env/caches do template, se existirem
        parts = set(rel.parts)
        if parts & {"node_modules", "dist", ".env", ".env.local", ".vercel", "__pycache__"}:
            continue
        if src.suffix == ".pyc":
            continue
        target = dest / rel
        if src.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if is_text_file(src):
            try:
                content = src.read_text(encoding="utf-8")
                target.write_text(substitute(content, mapping), encoding="utf-8")
                target.chmod(src.stat().st_mode)
                continue
            except UnicodeDecodeError:
                pass
        shutil.copy2(src, target)


def print_checklist(name: str, slug: str, port: str, dest: Path) -> None:
    log("")
    log("=" * 70)
    log(f"  ✓  {name} gerado em: {dest}")
    log("=" * 70)
    log("")
    log("PROXIMOS PASSOS (provisionamento — feito por voce):")
    log("")
    log("1. Rodar localmente:")
    log(f"     cd \"{dest}\"")
    log("     cp backend/.env.example backend/.env   # e preencher")
    log("     cp .env.example .env.local              # e preencher")
    log("     python start_app.py")
    log("")
    log("2. Railway (backend + Postgres):")
    log("     - criar projeto + adicionar Postgres")
    log("     - criar servico backend com Root Directory = backend/")
    log("     - variaveis: DATABASE_URL=${{Postgres.DATABASE_URL}}, JWT_SECRET,")
    log("       PARTNER_AUTH_SERVICE_TOKEN, PARTNER_AUTH_URL, PARTNER_AUTH_GOOGLE_URL,")
    log("       PARTNER_VERIFY_MEMBERSHIP_URL, FRONTEND_URL, NODE_ENV=production")
    log("     - gerar dominio (healthcheck em /health)")
    log("")
    log("3. Vercel (frontend):")
    log("     - criar projeto apontando para a raiz do app")
    log("     - variaveis: VITE_API_URL (= backend Railway), VITE_FIREBASE_* (descontoss-vip),")
    log("       VITE_CHECKOUT_URL")
    log("")
    log("4. Firebase Console (projeto descontoss-vip):")
    log(f"     - Authentication > Settings > Authorized domains > adicionar {slug}.vercel.app")
    log("")
    log("Detalhes completos em: docs/PLUGAR-LOGIN-VS.md")
    log("")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera um app satelite do ecossistema VS.")
    parser.add_argument("--name", help='Nome do app (ex.: "Cursos VIP")')
    parser.add_argument("--slug", help="Slug (ex.: cursos-vip)")
    parser.add_argument("--port", help="Porta do backend (ex.: 3002)")
    parser.add_argument("--dest", help="Diretorio destino (default: ../<slug>)")
    parser.add_argument("--force", action="store_true", help="sobrescreve destino existente")
    args = parser.parse_args()

    if not TEMPLATE.is_dir():
        log(f"ERRO: pasta template/ nao encontrada em {TOOLKIT}.")
        return 1

    log("── create-vs-app ──────────────────────────────────────────────")
    name = args.name or ask("Nome do app", "Meu App VIP")
    slug = args.slug or ask("Slug (kebab-case)", slugify(name))
    slug = slugify(slug)
    port = args.port or ask("Porta do backend", "3001")
    if not port.isdigit():
        log("ERRO: porta deve ser um numero.")
        return 1

    default_dest = TOOLKIT.parent / slug
    dest = Path(args.dest).resolve() if args.dest else default_dest

    if dest.exists():
        if not args.force and any(dest.iterdir()):
            log(f"ERRO: destino '{dest}' ja existe e nao esta vazio. Use --force para sobrescrever.")
            return 1

    mapping = {
        "{{APP_NAME}}": name,
        "{{APP_SLUG}}": slug,
        "{{BACKEND_PORT}}": port,
    }

    log("")
    log(f"Gerando '{name}' (slug={slug}, porta={port}) em {dest} ...")
    copy_template(dest, mapping)

    print_checklist(name, slug, port, dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
