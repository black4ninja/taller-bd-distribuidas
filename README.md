# Taller · Crime Scene Investigation: Bases de Datos Distribuidas

> Taller práctico para introducir bases de datos distribuidas a alumnos **sin conocimiento previo** de PostgreSQL, MongoDB, Redis ni motores vectoriales. Resuelves un caso de homicidio que tiene las evidencias repartidas en 4 motores.
>
> **Duración**: 2 horas (countdown integrado en el dashboard — si el reloj llega a 0, el asesino escapa al extranjero y se cierra la investigación).

---

## Para el alumno: lee primero

1. Tienes **2 horas** desde que pulses "Iniciar investigación". Cuando el reloj llegue a 0, el asesino escapa al extranjero y la fiscalía cierra el caso.
2. **No necesitas saber** los motores de antemano. El taller te enseña mientras juegas.
3. Vas a usar 5 interfaces web (todas locales): el dashboard del taller + 4 UIs gráficas para cada motor.
4. Si te atoras, cada estación tiene **3 pistas progresivas**. Úsalas sin culpa.
5. El objetivo final es identificar **asesino + arma + lugar** del crimen.

## Quick start

Requisitos: Docker Desktop o Docker Engine con `docker compose` v2+.

```bash
git clone https://github.com/black4ninja/taller-bd-distribuidas.git
cd taller-bd-distribuidas
docker compose up -d
```

Primer arranque: ~3 min (descarga imágenes + corre seed con embeddings).
Arranques posteriores: ~30s.

**Verifica que todo esté arriba**:

```bash
./scripts/verify-setup.sh
```

**Abre el dashboard**: <http://localhost:3000>

**Reset si algo se rompe**:

```bash
./scripts/reset.sh
```

## Flujo del taller (2 horas)

| Tiempo aprox. | Estación | Motor | Lo que aprenderás |
|---|---|---|---|
| 5 min | **E0** Walkthrough | PostgreSQL | Cómo abrir Adminer, hacer un SELECT, leer la descripción del caso |
| ~20 min | **E1** Las entrevistas | PostgreSQL | `JOIN`, `WHERE`, `LIKE` y regex para conectar tablas |
| ~25 min | **E2** Shell + cross-collection | MongoDB | Shell real, filtros JSON, queries dentro de arrays, `$lookup` cross-collection, vulnerabilidad sin auth |
| ~25 min | **E3** Triaje de pistas + pipelines | Redis | Key-value, `KEYS pattern`, buffer de cola, documentación de pipelines, vulnerabilidad sin password |
| ~25 min | **E4** Hybrid search detectivesco | Qdrant (vectorial) | Embeddings, filtros de payload, razonamiento sobre query language |
| 5 min | **/solve** Flag final | — | Submit `asesino + arma + lugar` |
| ~15 min | Debrief técnico | — | Discusión: CAP, consistencia, ¿por qué no todo en SQL? |

> El countdown integrado en el dashboard pone presión real: 2 horas. Si llega a 0, el sospechoso escapa al extranjero y se cierra la investigación (game over narrativo).

## URLs locales

| Servicio | URL |
|---|---|
| Dashboard del taller | <http://localhost:3000> |
| Adminer (PostgreSQL UI) | <http://localhost:8081> |
| mongo-express | <http://localhost:8082> |
| RedisInsight | <http://localhost:8083> |
| Qdrant UI | <http://localhost:6333/dashboard> |

## Estructura del repo

```
taller-bd-distribuidas/
├── README.md                  # estás aquí
├── docker-compose.yml         # 4 motores + 4 UIs + seeder + dashboard
├── .env.example               # credenciales (algunas débiles por diseño)
├── docs/
│   ├── WALKTHROUGH.md         # E0 paso a paso (LÉELO PRIMERO)
│   ├── ENTREGABLE.md          # plantilla que entregas al final
│   ├── INSTRUCTOR_NOTES.md    # ⚠️ NO ABRIR si eres alumno
│   ├── ARQUITECTURA.md        # diagrama y por qué cada motor
│   └── CHEATSHEETS/           # 1 referencia rápida por motor
├── dashboard/                 # Node.js + Express con la narrativa
├── seeder/                    # one-shot que puebla los 4 motores
└── scripts/
    ├── reset.sh
    └── verify-setup.sh
```

## Para instructores

Lee `docs/INSTRUCTOR_NOTES.md`. Incluye:
- Cronograma detallado de 2 horas
- Solución completa por estación
- Guion para el debrief
- Checklist de validación pre-clase

## Diseño pedagógico

- **Scaffolding agresivo**: UIs gráficas (no CLI), cheatsheets por motor, walkthrough resuelto (E0).
- **Pistas progresivas**: 3 niveles por estación. Quedan registradas pero no descuentan puntos.
- **Narrativa breadcrumb**: cada estación da una pista que es input de la siguiente. No puedes saltarte una.
- **Flag autovalidante**: el instructor no tiene que revisar a mano — el sistema lo valida.
- **Vulnerabilidades intencionales**: 2 motores (Mongo y Redis) corren SIN auth. Explotar esas malas configuraciones es parte del aprendizaje.

## Troubleshooting

| Problema | Fix |
|---|---|
| Dashboard tarda en cargar | El seeder corre primero. Espera 1-2 min al primer arranque. |
| mongo-express dice "connection refused" | `docker compose restart mongo-express` |
| Qdrant collection vacía | `docker compose restart seeder` |
| Embedding tarda 60s | Normal en frío. La imagen del dashboard cachea el modelo, así que no se repite. |
| Nada funciona, quiero empezar de cero | `./scripts/reset.sh` |

## Licencia

MIT — úsalo y modifícalo para tus propios talleres.
