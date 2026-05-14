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
    1: 'Tienes shell access vía el widget "MongoDB shell" en esta página. Empieza por entender el dataset: cuenta cuántos documentos hay en cada colección.\n\n' +
       '```\n' +
       'db.gym_members.countDocuments({})\n' +
       'db.social_posts.countDocuments({})\n' +
       '```\n\n' +
       'Vas a ver que son muchos — no se pueden escanear visualmente. Para encontrar a la víctima necesitas filtrar. El expediente público te dio su apellido (Aguilar). Para encontrar a SU entrenador, necesitas su member_id primero.',
    2: 'La víctima es un Aguilar deceased. Pero **hay otros Aguilar en el sistema** (vivos) y **hay otros deceased que no son Aguilar**. Combina ambos filtros:\n\n' +
       '```\n' +
       'db.gym_members.find({name: /Aguilar/, status: "deceased"})\n' +
       '```\n\n' +
       'La regex `/Aguilar/` busca el apellido dentro del campo `name`. Combinado con `status: "deceased"` te queda UN solo documento.\n\n' +
       'Una vez tengas su `member_id`, encuentra al entrenador cuyo array `clients` lo contenga.',
    3: 'Dos queries en el shell:\n\n' +
       '```\n' +
       '// 1. Encuentra a la víctima (único Aguilar deceased)\n' +
       'db.gym_members.findOne({name: /Aguilar/, status: "deceased"})\n' +
       '// → member_id: 14782\n' +
       '\n' +
       '// 2. Encuentra al entrenador con la víctima en su array de clientes\n' +
       'db.gym_members.findOne({clients: 14782})\n' +
       '// → Carlos Méndez, member_id 9001\n' +
       '```\n\n' +
       'Filtrar dentro de un array con `{clients: 14782}` es una de las cosas que NoSQL hace bien — en SQL necesitarías tabla intermedia y JOIN. Submit el `member_id` del entrenador.\n\n' +
       'Bonus opcional (alibis): `db.social_posts.find({user: "sofia_linares"})` y lo mismo con `david_hernandez` confirma que ambos tenían dónde estar esa noche. Otra opción: `db.social_posts.find({timestamp: {$gte: "2026-03-15T22:00", $lt: "2026-03-15T23:30"}})` filtra por rango de fechas.'
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
