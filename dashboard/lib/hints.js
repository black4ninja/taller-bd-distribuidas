// Pistas progresivas (3 niveles) por estación.
// Nivel 1: orientación general - "dónde buscar"
// Nivel 2: estructura concreta - "qué tabla/colección/key"
// Nivel 3: query casi completo - "copia-pega esto"

export const HINTS = {
  E1: {
    1: 'Abre Adminer en http://localhost:8081 (servidor: postgres, usuario: pg, pass: pg, db: investigation). ' +
       'Hay 3 tablas: crime_scene_report, persons, interviews. El crime_scene_report describe la dirección de 3 testigos.',
    2: 'Necesitas un JOIN entre persons e interviews filtrando por dirección (las primeras 2 testigos) y por gym_member_id (la tercera — fíjate en el número que aparece en el crime_scene_report). ' +
       'Una vez tengas las 3 entrevistas, las descripciones físicas mencionan a 2 sospechosos. La 3ra entrevista abre un hilo distinto (lee la palabra "entrenador").',
    3: '```sql\n' +
       'SELECT p.name, i.transcript\n' +
       'FROM persons p\n' +
       'JOIN interviews i ON i.person_id = p.id\n' +
       'WHERE p.address LIKE \'Calle Tecnológico%\'\n' +
       '   OR p.address LIKE \'Av. Eugenio Garza Sada%\'\n' +
       '   OR p.gym_member_id = 14730;\n' +
       '```\n\n' +
       'Lee LAS TRES entrevistas con cuidado — incluyendo la de Diana (la tercera). ' +
       'Las dos primeras dan descripciones físicas que llevan a 2 sospechosos visibles. La tercera abre un hilo distinto (la palabra clave es "entrenador") que vas a explotar en E2.\n\n' +
       'Para sospechosos físicos:\n' +
       '```sql\n' +
       'SELECT name FROM persons WHERE notes ILIKE \'%rubio%\' OR notes ILIKE \'%rubia%\' OR notes ILIKE \'%barba%\';\n' +
       '```\n' +
       'Submit cualquiera de los 2 nombres encontrados.'
  },

  E2: {
    1: 'Abre mongo-express en http://localhost:8082 (sin login — vulnerabilidad intencional). ' +
       'En la base "investigation" hay 3 colecciones: social_posts, gym_members y _evidence_archive. ' +
       'Para la respuesta principal vas a trabajar con gym_members.',
    2: 'En gym_members, los entrenadores tienen un campo `clients` que es un ARRAY con los member_id de sus clientes. ' +
       'La víctima tiene member_id 14782. Necesitas encontrar al entrenador cuyo array `clients` contenga 14782. ' +
       'En mongo-express, dentro de gym_members, usa el cuadro "search" arriba de la lista de documentos y pega un filtro JSON.',
    3: 'En la barra de búsqueda de gym_members pega exactamente este filtro JSON:\n' +
       '```json\n' +
       '{"clients": 14782}\n' +
       '```\n' +
       'MongoDB busca el valor 14782 DENTRO del array clients de cada documento. ' +
       'Te devolverá UN solo documento — el del asesino. Su campo `member_id` (4 dígitos) es la respuesta.\n\n' +
       'Bonus opcional (alibis): en social_posts puedes pegar `{"user": "sofia_linares"}` o `{"user": "david_hernandez"}` para ver que ambos tienen alibi.'
  },

  E3: {
    1: 'Abre RedisInsight en http://localhost:8083. Sigue los pasos del cheatsheet para agregar la BD (Host=redis, Port=6379, sin password). ' +
       'Hay cientos de keys; la mayoría son `gym:checkin:*` y otras "normales".',
    2: 'La key del testimonio NO sigue el patrón normal del gimnasio. Empieza con `evidence:`. ' +
       'En el Workbench de RedisInsight ejecuta `KEYS evidence:*` para listar SOLO las keys de ese patrón. ' +
       'Hay exactamente UNA. Luego haz GET de esa key.',
    3: 'En el Workbench ejecuta:\n' +
       '```\n' +
       'KEYS evidence:*\n' +
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
