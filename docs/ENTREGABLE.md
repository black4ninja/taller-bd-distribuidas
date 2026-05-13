# Entregable — Taller de Bases de Datos Distribuidas

**Alumno**:
**Matrícula**:
**Fecha**:
**Tiempo total empleado** (al cerrar `/solve` aparece en pantalla):
**Pistas usadas en total**:

> Llena este archivo después de resolver el caso y commitéalo a tu fork del repo.

---

## 1 · Tabla resumen de los 4 motores

Anota lo que entendiste de cada uno:

| Motor | Paradigma | ¿Qué guardaste aquí en el caso? | ¿Qué tipo de datos del mundo real va aquí? |
|---|---|---|---|
| PostgreSQL | relacional |  |  |
| MongoDB | documental (NoSQL) |  |  |
| Redis | key-value (in-memory) |  |  |
| Qdrant | vectorial |  |  |

---

## 2 · Diseño: si tú fueras el arquitecto

Si tuvieras que diseñar el sistema de evidencias desde cero, ¿dónde pondrías cada uno de estos datos y POR QUÉ?

| Dato | Motor que elegirías | Justificación (1 línea) |
|---|---|---|
| Catálogo de empleados del campus |  |  |
| Sesiones activas de usuarios logueados |  |  |
| Comentarios y reacciones de redes sociales |  |  |
| Búsqueda semántica de incidentes históricos por descripción |  |  |
| Inventario de equipos con sus seriales |  |  |
| Logs de acceso (millones por mes) |  |  |
| Embeddings de fotos de cámaras para reconocimiento facial |  |  |

---

## 3 · Vulnerabilidades encontradas

### E2 — MongoDB sin autenticación + listCollections expuesto

¿Por qué fue crítico que pudieras navegar TODAS las colecciones?

¿Cómo se mitigaría esto en producción? (al menos 2 medidas concretas)

### E3 — Redis sin password + `KEYS *` permitido

¿Por qué `KEYS *` no es solo un problema de seguridad sino también de DISPONIBILIDAD?

¿Cómo se debería listar keys en producción?

---

## 4 · El motor vectorial

**¿Por qué fue necesario un motor vectorial (Qdrant) para resolver E4?**

(pista: piensa qué habría pasado si los testimonios estuvieran en PostgreSQL y buscaras con `LIKE '%entrenador%'`)

---

## 5 · Consistencia y CAP

El caso quedó resuelto cruzando 4 motores. En el mundo real, esos 4 motores tendrían que **mantenerse coherentes** entre sí (si actualizo el nombre de Carlos Méndez en Postgres, ¿se actualiza en Mongo? ¿en los embeddings de Qdrant?).

¿Cuáles 2 problemas concretos podrían surgir por mantener 4 motores sincronizados? ¿Qué patrones conoces (o intuyes) para mitigarlos?

---

## 6 · Reflexión personal

¿Qué fue lo más difícil del taller para ti?

¿Qué motor te pareció más útil para casos reales y cuál te pareció más nicho?

Si tuvieras 1 hora más, ¿qué profundizarías? (replicación, sharding, transacciones distribuidas, eventos, etc.)
