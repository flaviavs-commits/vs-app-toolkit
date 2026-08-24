#!/usr/bin/env sh
set -eu
git config core.hooksPath .githooks
printf '%s\n' 'Proteção local habilitada: .githooks/pre-commit'
