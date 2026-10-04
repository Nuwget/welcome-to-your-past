#!/usr/bin/env bash
# Abre o site por um servidor local (necessário para o áudio reativo e o waveform).
cd "$(dirname "$0")"
PORT="${1:-8000}"
( sleep 1; xdg-open "http://localhost:$PORT" >/dev/null 2>&1 ) &
exec python3 -m http.server "$PORT"
