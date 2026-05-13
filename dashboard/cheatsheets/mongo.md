# Cheatsheet · MongoDB

> MongoDB guarda **documentos JSON** en **colecciones** (equivalente a "tablas" pero sin esquema fijo).

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

// Posts del 15 de marzo
{"timestamp": {"$regex": "^2026-03-15"}}

// Tipo específico
{"type": "chat_log"}
```

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
