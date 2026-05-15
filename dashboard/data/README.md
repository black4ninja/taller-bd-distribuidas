# Datos del taller

## `students.example.json` (committeable)

Lista ficticia de 55 estudiantes con nombres y matrículas inventadas
(las matrículas empiezan con `F` para marcarlas como sintéticas). Se
usa para que el taller funcione out-of-the-box al clonar el repo, sin
exponer datos personales reales.

## `students.json` (LOCAL, gitignored)

Si lo creas, `case-generator.js` lo usa preferentemente. Aquí puedes
poner la lista REAL de alumnos del grupo en el que vayas a impartir el
taller, para que cada jugador vea nombres de personas que conoce — lo
cual sube mucho el engagement narrativo.

**Importante**:
- El archivo está en `.gitignore`. Nunca lo commitees.
- Mismo formato que el example: `[{ "name": "Nombre Apellido Apellido", "matricula": "1234567" }, ...]`.
- Si lo borras, el taller sigue funcionando con `students.example.json`.

### Cómo construir el `students.json` desde un CSV de calificaciones

Si tienes un CSV de Canvas / Brightspace / Schoology con columnas como
`Estudiante` y `Matrícula`, en una línea:

```bash
python3 -c "
import csv, json
out = []
seen = set()
with open('/ruta/al/csv/Calificaciones.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name = row.get('Estudiante') or row.get('Nombre') or row.get('Name')
        mat  = row.get('Matrícula') or row.get('Matricula') or row.get('ID')
        if not name or not mat: continue
        key = (name.strip(), str(mat).strip())
        if key in seen: continue
        seen.add(key)
        out.append({'name': name.strip(), 'matricula': str(mat).strip()})
json.dump(out, open('dashboard/data/students.json','w'), indent=2, ensure_ascii=False)
print(f'wrote {len(out)} students')
"
```

Después: rebuildea el dashboard (`docker compose up -d --build dashboard`)
para que el contenedor pille el archivo nuevo.
