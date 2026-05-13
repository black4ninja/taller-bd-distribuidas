# Cheatsheet · MongoDB

> MongoDB guarda **documentos JSON** en **colecciones** (equivalente a "tablas" pero sin esquema fijo).

## ¿Cuándo usar MongoDB en la vida real?

MongoDB (o cualquier base documental) brilla cuando:

- **Schema evoluciona rápido**: productos con campos opcionales que cambian por categoría (un libro tiene "autor"; una camiseta tiene "talla" y "color"). En SQL eso explota con `ALTER TABLE` o tablas EAV horribles.
- **Datos jerárquicos auto-contenidos**: un post de blog con sus comentarios anidados, un pedido con sus items, una página con sus widgets. En vez de N JOINs, lees 1 documento.
- **Arrays como ciudadanos de primera**: "etiquetas", "permisos", "clientes de un entrenador". Indexables y consultables sin tabla intermedia.
- **Escala horizontal natural**: redes sociales, eventos IoT, logs estructurados. Mongo sharda nativo; Postgres requiere setup avanzado (Citus, Aurora, etc).
- **Time-to-market crítico**: prototipos donde el modelo de datos aún no está fijo. Mongo te deja iterar sin migraciones.

Casos típicos: catálogos de e-commerce con productos heterogéneos, gestión de contenido (CMS), eventos de IoT/analytics, perfiles de usuario con preferencias variables, agregadores de logs aplicacionales.

**Cuándo NO**: transacciones financieras críticas (Postgres es más sólido aunque Mongo ya las soporta), reportes con muchos JOINs (SQL es más natural), búsqueda semántica (→ vectorial).

## Conexión vía mongo-express

http://localhost:8082

> **No pide login.** Esa es la vulnerabilidad que vas a aprovechar en E2.

## Ver bases y colecciones

1. Pantalla principal: lista de bases. Click en `investigation`.
2. Verás todas las colecciones de esa base — **incluyendo las "ocultas"** cuyo nombre empieza con `_`.

## Ver documentos de una colección

Click en el nombre de la colección. Verás todos sus documentos como JSON.

## Filtros (en la cajita "Search")

mongo-express acepta filtros en formato JSON. Ejemplos:

```js
// Documentos de un usuario específico
{"user": "sofia_linares"}

// Posts del 15 de marzo (regex sobre string ISO)
{"timestamp": {"$regex": "^2026-03-15"}}

// Tipo específico
{"type": "chat_log"}

// Buscar un valor DENTRO de un array
// (encuentra documentos donde el campo "clients" contiene 14782)
{"clients": 14782}

// Combinar condiciones (AND implícito)
{"user": "sofia_linares", "location": {"$regex": "Cancún"}}

// Posts en un rango de fechas
{"timestamp": {"$gte": "2026-03-15T22:00", "$lt": "2026-03-15T23:30"}}
```

**Detalle clave**: cuando el campo es un array (ej. `clients: [14782, 14745]`),
filtrar por `{"campo": valor}` busca *dentro* del array. Esto es una de las
razones para usar MongoDB sobre SQL: ahorra una tabla intermedia.

## Ver TODAS las colecciones (incluyendo ocultas)

mongo-express las muestra todas en la barra lateral. **Si una empieza con `_` o tiene nombre raro, es probable que sea no-pública** — exactamente lo que un investigador buscaría.

## Equivalencia mental con SQL

| SQL               | MongoDB                |
|-------------------|------------------------|
| tabla             | colección              |
| fila              | documento (JSON)       |
| columna           | campo                  |
| SELECT * FROM t   | (ver toda la colección) |
| WHERE col = X     | `{col: X}` filter      |

## Errores comunes

- Las colecciones que empiezan con `_` o `system.` son **internas**. Si encuentras una con nombre raro en `investigation`, **léela**: probablemente alguien la dejó sin protección.
- Si el filtro JSON no funciona, valida que es JSON válido (comillas dobles, no simples).
