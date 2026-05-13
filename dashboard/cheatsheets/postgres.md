# Cheatsheet · PostgreSQL

> Para el taller, solo necesitas saber **SELECT**, **JOIN**, **WHERE** y **LIKE/ILIKE**.

## Conexión vía Adminer

http://localhost:8081

```
Sistema:    PostgreSQL
Servidor:   postgres
Usuario:    pg
Contraseña: pg
Base:       investigation
```

## Ver tablas

En el menú izquierdo verás 3 tablas. Click en cada una → "Select data" para ver los datos.

## Queries básicos

```sql
-- Todas las columnas
SELECT * FROM persons;

-- Filtro simple
SELECT name, occupation
FROM persons
WHERE address = 'Calle Tecnológico 1';

-- LIKE para coincidencia parcial (case sensitive)
SELECT * FROM persons WHERE address LIKE 'Av. Eugenio%';

-- ILIKE para coincidencia parcial (case INsensitive) - útil para notas
SELECT * FROM persons WHERE notes ILIKE '%barba%';

-- Filtrar por valor numérico
SELECT * FROM persons WHERE gym_member_id = 14730;
```

## JOIN: conectar persons con interviews

```sql
SELECT p.name, p.address, i.transcript
FROM persons p
JOIN interviews i ON i.person_id = p.id
WHERE p.gym_member_id = 14730
   OR p.address LIKE 'Calle Tecnológico%'
   OR p.address LIKE 'Av. Eugenio Garza Sada%';
```

## Combinar condiciones

```sql
SELECT name FROM persons
WHERE notes ILIKE '%rubio%' OR notes ILIKE '%rubia%';
```

## Errores comunes

- `relation "Persons" does not exist` → PostgreSQL es **case-sensitive** en nombres entre comillas. Usa `persons` (minúscula).
- `column "name" does not exist` → Verifica que estás en la tabla correcta. Click en la tabla para ver columnas.
- Tildes/acentos en LIKE: PostgreSQL distingue 'á' de 'a'. Usa el texto exacto.
