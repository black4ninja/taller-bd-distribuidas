// Pistas progresivas (3 niveles) por estación.
// Nivel 1: orientación general - "dónde buscar"
// Nivel 2: estructura concreta - "qué tabla/colección/key"
// Nivel 3: query casi completo - "copia-pega esto"

export const HINTS = {
  E1: {
    1: 'Abre Adminer en http://localhost:8081 (servidor: postgres, usuario: pg, pass: pg, db: investigation). ' +
       'Hay 3 tablas: crime_scene_report, persons, interviews. El crime_scene_report describe la dirección de 3 testigos.',
    2: 'Necesitas un JOIN entre persons e interviews filtrando por dirección y por gym_member_id=14782. ' +
       'Una vez tengas las entrevistas, las descripciones físicas que mencionan los testigos coinciden con la columna "notes" de otras personas (sospechosos).',
    3: '```sql\n' +
       'SELECT p.name, i.transcript\n' +
       'FROM persons p\n' +
       'JOIN interviews i ON i.person_id = p.id\n' +
       'WHERE p.address LIKE \'Calle Tecnológico%\'\n' +
       '   OR p.address LIKE \'Av. Eugenio Garza Sada%\'\n' +
       '   OR p.gym_member_id = 14782;\n' +
       '```\n\n' +
       'Luego, para sospechosos:\n' +
       '```sql\n' +
       'SELECT name FROM persons WHERE notes ILIKE \'%rubio%\' OR notes ILIKE \'%rubia%\' OR notes ILIKE \'%barba%\';\n' +
       '```\n' +
       'Submit cualquiera de los 2 nombres encontrados.'
  },

  E2: {
    1: 'Abre mongo-express en http://localhost:8082 (sin login — vulnerabilidad intencional). ' +
       'Hay una base "investigation". Revisa todas las colecciones (no solo las obvias).',
    2: 'social_posts muestra que ambos sospechosos tienen alibi (Cancún / oficina). ' +
       'Pero hay UNA colección cuyo nombre empieza con guión bajo "_" — esas suelen ser ocultas en convenciones de Mongo. Ábrela.',
    3: 'La colección oculta es `_evidence_archive`. Abre los 3 documentos. ' +
       'El documento `evidence_hint` contiene textualmente el nombre exacto de una clave de Redis que comienza con `evidence:`. ' +
       'Ese nombre completo (con los dos puntos) es la respuesta a esta estación.'
  },

  E3: {
    1: 'Abre RedisInsight en http://localhost:8083. Agrega una base de datos: Host=redis, Port=6379, sin password. ' +
       'Una vez conectado, vas a ver cientos de keys distintas.',
    2: 'El nombre exacto de la key te lo dio MongoDB en la estación anterior. Búscala directamente con GET o usando el filtro. ' +
       'Su valor es un JSON con varios campos.',
    3: 'En RedisInsight ejecuta:\n' +
       '```\n' +
       'GET evidence:hidden:trainer_log\n' +
       '```\n' +
       'El JSON resultante tiene un campo `instructions_for_investigator` que menciona el NOMBRE EXACTO de una collection en Qdrant ' +
       '(empieza con "witness_"). Ese nombre es la respuesta.'
  },

  E4: {
    1: 'Abre el dashboard de Qdrant en http://localhost:6333/dashboard. Verás la collection que descubriste en Redis. ' +
       'No vas a buscar a mano: en ESTA página (dashboard del taller, abajo) hay un widget de búsqueda semántica.',
    2: 'Usa el widget "Buscar testimonio similar" abajo. Pega la frase del campo `testimony` que encontraste en Redis. ' +
       'Verás los 3 testimonios con mayor similitud semántica.',
    3: 'Pega exactamente esta frase en el widget:\n\n' +
       '> "Vi al entrenador entrar al laboratorio del CETEC esa noche con un cable y una mochila negra."\n\n' +
       'El testimonio TOP (score más alto) menciona el NOMBRE COMPLETO del asesino. Submit ese nombre.'
  }
};
