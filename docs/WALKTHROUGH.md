# WALKTHROUGH · E0 paso a paso

> Este archivo recorre la **Estación 0** (ejemplo) y te calibra para las estaciones reales (E1-E4). Léelo antes de empezar el cronómetro.

**Tiempo estimado**: 5 min.

---

## Contexto del caso

Eres un investigador del ITESM. El 15 de marzo de 2026 encontraron al Dr. Ernesto Aguilar muerto en el Laboratorio CETEC del campus Monterrey. El equipo de seguridad distribuyó las evidencias en 4 bases de datos distintas, cada una con la información del dominio que mejor le corresponde. Tu trabajo es reconstruir el caso pasando por las 4 y entregar el flag final: **asesino + arma + lugar**.

## Paso 1 — Levanta el entorno

Desde la raíz del repo:

```bash
docker compose up -d
```

Espera 1-2 minutos al primer arranque (descarga imágenes + corre seed). En arranques posteriores tarda 15-30s. Verifica que estén arriba:

```bash
./scripts/verify-setup.sh
```

Abre el dashboard del taller: <http://localhost:3000>

## Paso 2 — Abre Adminer

Adminer es una UI web minimalista para PostgreSQL.

URL: <http://localhost:8081>

Pantalla de login:

```
Sistema:     PostgreSQL
Servidor:    postgres
Usuario:     pg
Contraseña:  pg
Base:        investigation
```

Click "Login".

## Paso 3 — Identifica las tablas

En el menú izquierdo verás 3 tablas: `crime_scene_report`, `persons` e `interviews`. Click en `crime_scene_report` → "Select data". Verás 1 fila.

## Paso 4 — Tu primer SELECT

En la barra superior: "SQL command". Pega:

```sql
SELECT date, city, type, description
FROM crime_scene_report
WHERE date = '2026-03-15' AND city = 'Monterrey';
```

Click "Execute".

## Paso 5 — Lee la `description` con cuidado

El campo `description` contiene **3 pistas que vas a necesitar todo el taller**:

1. **Arma**: el texto menciona explícitamente cómo murió el Dr. Aguilar. Anótalo — lo necesitas para el flag final en `/solve`.
2. **Lugar**: el laboratorio específico. Anótalo — también va al flag final.
3. **Tres testigos**: cómo identificarlos (dirección + `gym_member_id` para uno de ellos).

> **No copies y pegues** la respuesta al flag final ahora mismo. Resolver el caso requiere pasar por E1 → E4. Solo tomas nota.

## Paso 6 — El patrón pedagógico

Cada estación E1-E4 sigue este flujo:

1. **Abre la UI del motor** (links en la barra superior del dashboard).
2. **Lee el cheatsheet** del motor si no recuerdas la sintaxis (botón "Cheatsheet" en la estación).
3. **Explora hasta encontrar la pista**. Cada estación tiene UNA respuesta concreta.
4. **Submit la respuesta** en el cuadro al final de la estación. Si es correcta, se desbloquea la siguiente.
5. **¿Te atoraste?** Usa las pistas progresivas (nivel 1 suave → 3 fuerte). Quedan registradas pero no descuentan puntos.

## Paso 7 — Empieza

Vuelve a <http://localhost:3000> y abre **E1**. ¡Suerte!

---

## Si algo no funciona

- ¿No carga `http://localhost:3000`? El dashboard tarda en arrancar después del seed. Espera 30-60s y refresca.
- ¿No conecta Adminer? Verifica que el servidor sea `postgres` (NO `localhost`) — Adminer corre dentro de la red Docker.
- Para los demás motores, los hosts dentro de Docker son: `postgres`, `mongo`, `redis`, `qdrant`. Desde tu navegador siempre `localhost`.
