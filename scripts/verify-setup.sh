#!/usr/bin/env bash
# Health check rápido de los 4 motores + dashboard.
# Imprime un check ✓/✗ por servicio y sale 0 si todo OK.

set -uo pipefail

ok=0
fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  [✓] $label"
    ok=$((ok+1))
  else
    echo "  [✗] $label"
    fail=$((fail+1))
  fi
}

echo "Verificando servicios..."

check "dashboard :3000"      curl -fsS http://localhost:3000/progress
check "Adminer (PG UI) :8081" curl -fsS http://localhost:8081
check "PostgreSQL :5432"     docker exec tbd-postgres pg_isready -U pg -d investigation
check "MongoDB :27017"       docker exec tbd-mongo mongosh --quiet --eval "db.runCommand({ping:1}).ok"
check "mongo-express :8082"  curl -fsS http://localhost:8082
check "Redis :6379"          docker exec tbd-redis redis-cli ping
check "RedisInsight :8083"   curl -fsS http://localhost:8083
check "Qdrant :6333"         curl -fsS http://localhost:6333/healthz
check "Qdrant collection"    curl -fsS http://localhost:6333/collections/witness_testimonies

echo
echo "Resultado: $ok OK, $fail FALLIDOS"
[[ $fail -eq 0 ]] && exit 0 || exit 1
