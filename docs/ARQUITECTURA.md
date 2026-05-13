# Arquitectura del Taller

## Diagrama lógico

```
        ┌────────────────────────────────────────────────────────────────────┐
        │                  ALUMNO (navegador web)                             │
        │   localhost:3000   localhost:8081/8082/8083   localhost:6333         │
        └───────┬────────────┬───────────────┬───────────────┬────────────────┘
                │            │               │               │
        ┌───────▼─────┐  ┌───▼─────┐    ┌────▼──────┐   ┌────▼──────┐
        │  DASHBOARD  │  │ Adminer │    │  mongo-   │   │ RedisInsig│
        │  Node+Expr  │  │ (PG UI) │    │  express  │   │           │
        │ :3000       │  │ :8081   │    │  :8082    │   │  :8083    │
        └──┬────────┬─┘  └────┬────┘    └────┬──────┘   └────┬──────┘
           │        │         │              │               │
           │        │   ┌─────▼──────┐ ┌─────▼──────┐  ┌─────▼──────┐  ┌─────────────┐
           │        │   │ PostgreSQL │ │  MongoDB   │  │   Redis    │  │   Qdrant    │
           │        │   │  :5432     │ │  :27017    │  │   :6379    │  │  :6333/4    │
           │        │   │            │ │ SIN AUTH   │  │ SIN PASSWD │  │             │
           │        │   └────────────┘ └────────────┘  └────────────┘  └──────▲──────┘
           │        │                                                         │
           │        └─────────────────────────────────────────────────────────┘
           │                       (POST /search-vectors)
           │
           ▼
    ┌──────────────┐       ┌─────────────────────────────────────────┐
    │ Cookie       │       │ SEEDER (one-shot)                       │
    │ firmada HMAC │       │ - corre 1 vez al levantar               │
    │ (progreso)   │       │ - puebla los 4 motores idempotentemente │
    └──────────────┘       │ - genera embeddings local (no API key)  │
                           └─────────────────────────────────────────┘
```

## Por qué cada motor está donde está

| Motor | Por qué este caso | Trade-off real |
|---|---|---|
| **PostgreSQL** | Entidades con relaciones rígidas (`persons` ↔ `interviews`). Necesitamos JOIN. ACID. | Escala vertical. Schemas rígidos cuestan migrar. |
| **MongoDB** | Posts sociales con campos opcionales (algunos tienen foto, otros no). Logs de gimnasio semi-estructurados. | Sin schema: garbage-in, garbage-out. Sin JOINs nativos eficientes. |
| **Redis** | Check-ins de gimnasio que se consultan miles de veces por segundo. Lecturas O(1). | Volátil (in-memory). No es base de verdad. `KEYS *` bloquea. |
| **Qdrant** | Búsqueda semántica de testimonios. PostgreSQL+LIKE fallaría con sinónimos. | Costoso para escribir (generar embeddings). No es para datos relacionales. |

## Flujo del seed (idempotente)

1. `docker compose up` levanta los 4 motores.
2. Healthchecks aseguran que cada motor responda antes de seguir.
3. `seeder` espera a los 4 healthchecks (`depends_on: service_healthy`).
4. Para cada motor, el seeder revisa si ya hay datos:
   - PostgreSQL: `SELECT COUNT(*) FROM persons` → si > 0, skip
   - MongoDB: `countDocuments` por colección → skip si > 0
   - Redis: `EXISTS evidence:hidden:trainer_log` → skip si existe
   - Qdrant: `getCollection().points_count` → skip si > N
5. Seed corre embeddings con `@xenova/transformers` (modelo local, 80MB).
6. Dashboard arranca después de que `seeder` haya completado exitosamente.

## Tamaño del entorno

- Imágenes Docker: ~2.5 GB primera vez (incluyen modelo de embeddings precacheado en build)
- RAM en uso: ~1.5 GB con todos los servicios
- Tiempo de arranque en frío: ~3 min (descarga + seed con embeddings)
- Tiempo de arranque en caliente: ~30s

## Persistencia

Cada motor monta un volumen nombrado de Docker. `docker compose down` **conserva** los datos. Para wipe completo:

```bash
docker compose down -v
```

## Por qué no Kubernetes / Kafka / etc.

Este taller enseña **el modelo mental** del polyglot persistence. No la operación real de un cluster. Para 1 hora con alumnos sin background, Docker Compose es el techo correcto. Las capas reales (replicación, sharding, eventos, CDC) son material de un curso completo.
