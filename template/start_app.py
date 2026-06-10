#!/usr/bin/env python3
"""
start_app.py — Script padrao de inicializacao (Felixo System Design).

Orquestra a aplicacao fullstack "{{APP_NAME}}": sobe o backend (Express/Prisma/TS)
e o frontend (Vite), instala as dependencias de ambos quando preciso e abre o
navegador — tudo com um unico comando.

Uso:
    python start_app.py                # instala (se preciso) + inicia + abre navegador
    python start_app.py restart        # mata as instancias atuais e sobe de novo
    python start_app.py --no-browser   # sobe sem abrir o navegador (servidor/automacao)
    python start_app.py --no-install   # pula a instalacao de dependencias
"""

import os
import sys
import time
import socket
import argparse
import subprocess
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"

HOST = "127.0.0.1"
FRONTEND_PORT = 5173          # porta padrao do Vite
BACKEND_PORT = {{BACKEND_PORT}}
URL = f"http://{HOST}:{FRONTEND_PORT}"

INSTALL_FRONTEND = ROOT / "package.json"
INSTALL_BACKEND = BACKEND / "package.json"

NPM = "npm.cmd" if os.name == "nt" else "npm"

FRONTEND_COMMAND = [NPM, "run", "dev", "--", "--host", HOST, "--port", str(FRONTEND_PORT)]
BACKEND_COMMAND = [NPM, "run", "dev"]  # tsx watch src/server.ts
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    print(f"[start_app] {msg}", flush=True)


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def kill_port(port: int) -> None:
    log(f"Liberando a porta {port}...")
    try:
        if os.name == "nt":
            out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True).stdout
            pids = {
                line.split()[-1]
                for line in out.splitlines()
                if f":{port}" in line and "LISTENING" in line
            }
            for pid in pids:
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
        else:
            out = subprocess.run(["lsof", "-ti", f"tcp:{port}"], capture_output=True, text=True).stdout
            for pid in out.split():
                subprocess.run(["kill", "-9", pid], capture_output=True)
    except FileNotFoundError:
        log("Nao consegui liberar a porta automaticamente. Feche o processo manualmente.")


def npm_install(package_json: Path, label: str) -> None:
    if not (package_json and package_json.exists()):
        return
    cwd = package_json.parent
    if (cwd / "node_modules").exists():
        log(f"Dependencias do {label} ja instaladas. Pulando.")
        return
    log(f"Instalando dependencias do {label} (npm install)...")
    subprocess.run([NPM, "install"], cwd=str(cwd), check=True)


def install_deps() -> None:
    npm_install(INSTALL_BACKEND, "backend")
    npm_install(INSTALL_FRONTEND, "frontend")


def warn_backend_env() -> None:
    if INSTALL_BACKEND.exists() and not (BACKEND / ".env").exists():
        log(
            "Aviso: backend/.env nao encontrado. Copie backend/.env.example para "
            "backend/.env e preencha DATABASE_URL, JWT_SECRET e PARTNER_* antes do login."
        )


def open_browser_when_ready() -> None:
    log("Aguardando o frontend responder...")
    for _ in range(120):  # ate ~60s
        if port_in_use(HOST, FRONTEND_PORT):
            log(f"Frontend de pe. Abrindo {URL}")
            webbrowser.open(URL)
            return
        time.sleep(0.5)
    log("Frontend demorou para subir. Abra manualmente: " + URL)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inicia o app (Felixo System Design).")
    parser.add_argument("command", nargs="?", default="start", choices=["start", "restart"])
    parser.add_argument("--no-browser", action="store_true", help="nao abre o navegador")
    parser.add_argument("--no-install", action="store_true", help="pula a instalacao")
    args = parser.parse_args()

    os.chdir(ROOT)

    busy = port_in_use(HOST, BACKEND_PORT) or port_in_use(HOST, FRONTEND_PORT)
    if busy:
        if args.command == "restart":
            kill_port(BACKEND_PORT)
            kill_port(FRONTEND_PORT)
            time.sleep(1)
        else:
            log(
                f"As portas {BACKEND_PORT}/{FRONTEND_PORT} ja estao em uso. "
                "Use 'python start_app.py restart' para reiniciar."
            )
            if not args.no_browser:
                webbrowser.open(URL)
            return 0

    if not args.no_install:
        try:
            install_deps()
        except subprocess.CalledProcessError as e:
            log(f"Falha ao instalar dependencias: {e}. Resolva e rode de novo.")
            return 1
        except FileNotFoundError:
            log("npm nao encontrado. Instale o Node.js (https://nodejs.org) e rode de novo.")
            return 1

    warn_backend_env()

    log("Iniciando o backend (Express/Prisma/TS)...")
    try:
        backend_proc = subprocess.Popen(BACKEND_COMMAND, cwd=str(BACKEND))
    except FileNotFoundError:
        log("npm nao encontrado. Instale o Node.js e rode de novo.")
        return 1

    if not args.no_browser:
        import threading
        threading.Thread(target=open_browser_when_ready, daemon=True).start()

    log("Iniciando o frontend (Vite)... (Ctrl+C para parar)")
    try:
        frontend_proc = subprocess.Popen(FRONTEND_COMMAND, cwd=str(ROOT))
        frontend_proc.wait()
    except KeyboardInterrupt:
        log("Encerrado pelo usuario.")
    finally:
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_proc.kill()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
