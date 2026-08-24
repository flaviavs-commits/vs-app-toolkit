#!/usr/bin/env python3
"""Bloqueia arquivos e valores que não devem entrar em repositórios públicos.

Sem argumentos, faz uma auditoria dos arquivos rastreados (uso de CI). Com
--staged, verifica somente os arquivos preparados para commit (uso do hook).
O relatório nunca reproduz o conteúdo encontrado.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_ENV_FILES = {".env.example", ".env.sample", ".env.template"}
BLOCKED_SUFFIXES = {".bak", ".db", ".dump", ".key", ".p12", ".pfx", ".pem", ".sql", ".sqlite", ".xlsx", ".xls", ".zip"}
BLOCKED_FILENAMES = {"fcvip_clientes_api.csv"}
SECRET_ASSIGNMENT = re.compile(
    r"(?i)(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|secret|password|passwd)\s*[:=]\s*[\"']?[a-z0-9_./+=:-]{16,}"
)
MAX_FILE_BYTES = 2 * 1024 * 1024


def git_files(staged: bool) -> list[Path]:
    command = ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"] if staged else ["git", "ls-files"]
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
    return [ROOT / line for line in result.stdout.splitlines() if line]


def filename_problem(path: Path) -> str | None:
    name = path.name.lower()
    if name in BLOCKED_FILENAMES or name.endswith(".csv"):
        return "exportação CSV"
    if name == ".env" or (name.startswith(".env.") and name not in ALLOWED_ENV_FILES):
        return "arquivo de ambiente"
    if path.suffix.lower() in BLOCKED_SUFFIXES:
        return "arquivo sensível, backup ou documento não permitido"
    return None


def content_problem(path: Path) -> str | None:
    relative = path.relative_to(ROOT)
    # Exemplos, testes e a configuração pública do Firebase usam valores de
    # demonstração/identificadores públicos; o bloqueio de arquivos continua
    # valendo para todos eles.
    if path.name in ALLOWED_ENV_FILES or "__tests__" in relative.parts or path.as_posix().endswith("src/auth/firebase.ts"):
        return None
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return "arquivo maior que 2 MB"
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    if SECRET_ASSIGNMENT.search(content):
        return "possível valor de credencial"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--staged", action="store_true", help="verifica apenas arquivos preparados para commit")
    args = parser.parse_args()
    problems: list[tuple[Path, str]] = []
    for path in git_files(args.staged):
        if not path.is_file():
            continue
        problem = filename_problem(path) or content_problem(path)
        if problem:
            problems.append((path.relative_to(ROOT), problem))
    if not problems:
        print("public_repo_guard: aprovado")
        return 0
    print("public_repo_guard: commit recusado; remova ou faça allowlist explícita dos itens abaixo:", file=sys.stderr)
    for path, problem in problems:
        print(f"- {path}: {problem}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
