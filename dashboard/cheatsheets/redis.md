# Cheatsheet · Redis

> Redis guarda pares **clave → valor**. Las claves son strings (suelen usar `:` como separador jerárquico, ej. `usuario:42:nombre`).

## Conexión vía RedisInsight

http://localhost:8083

1. Click en "Add Redis Database".
2. Selecciona "Connect to a Redis Database" → "Manually configure".
3. Datos:
   ```
   Host:     redis
   Port:     6379
   Password: (déjalo vacío — sin password, intencional para el taller)
   Alias:    investigation
   ```
4. Click "Test connection" → debe pasar. Luego "Add Redis Database".

## Comandos esenciales

Dentro de RedisInsight → tab "Workbench" o "CLI":

```
-- Listar TODAS las keys (CUIDADO en producción, pero aquí es el ejercicio)
KEYS *

-- Filtrar por patrón
KEYS gym:checkin:*
KEYS evidence:*

-- Obtener el valor de una key
GET evidence:hidden:trainer_log

-- Cuántas keys hay en total
DBSIZE

-- Ver el tipo de una key
TYPE evidence:hidden:trainer_log
```

## El valor puede ser JSON

Si haces `GET key` y el valor es JSON, RedisInsight lo formatea bonito. **Léelo entero** — adentro puede haber instrucciones, otras keys, o referencias a otras bases.

## ¿Por qué `KEYS *` es peligroso en producción?

- `KEYS *` recorre **todas** las claves en memoria. Si tienes 10M de keys, bloquea el servidor entero por segundos.
- Para producción se usa `SCAN` (paginado, no bloqueante).
- Aquí, con solo unos cientos de keys, `KEYS *` es seguro y nos sirve para enseñar el problema.

## ¿Por qué no tiene password?

Es **inseguro a propósito** — exactamente el error que MUCHOS equipos cometen al desplegar Redis en redes "privadas". Cualquiera con acceso a la red puede leer y modificar todo.

## Errores comunes

- "NOAUTH": olvidaste poner el password (en producción real). Aquí no aplica.
- Si conectas desde tu máquina con `redis-cli`, el host es `127.0.0.1` (no `redis`).
