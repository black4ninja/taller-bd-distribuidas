#!/usr/bin/env bash
# Reset completo: borra volúmenes, vuelve a levantar todo desde cero.
# Útil si los alumnos rompen el seed o si quieres una sesión fresca.

set -euo pipefail
cd "$(dirname "$0")/.."

echo ">> Bajando contenedores y borrando volúmenes..."
docker compose down -v

echo ">> Levantando entorno limpio (esto puede tardar 1-3 min la primera vez)..."
docker compose up -d --build

echo ">> Esperando a que el seeder termine..."
# El seeder es 'restart: no', así que su estado final indica éxito
while true; do
  status=$(docker inspect -f '{{.State.Status}}' tbd-seeder 2>/dev/null || echo "missing")
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' tbd-seeder 2>/dev/null || echo "?")
  if [[ "$status" == "exited" && "$exit_code" == "0" ]]; then
    echo ">> Seeder completó OK"
    break
  fi
  if [[ "$status" == "exited" && "$exit_code" != "0" ]]; then
    echo "!! Seeder falló con exit code $exit_code. Logs:"
    docker compose logs seeder
    exit 1
  fi
  sleep 2
done

echo ">> Listo. Dashboard: http://localhost:3000"
