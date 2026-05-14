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
    1: 'Necesitas correlacionar **dos colecciones**: `gym_members` (donde está la víctima y el entrenador con su array de clients) y `social_posts` (donde están los handles de redes sociales vinculados por `user_id`).\n\n' +
       'Arranca entendiendo cuántos documentos hay:\n\n' +
       '```\n' +
       'db.gym_members.countDocuments({})\n' +
       'db.social_posts.countDocuments({})\n' +
       '```\n\n' +
       'El expediente público te dio el apellido de la víctima (Aguilar). Pero **hay más de un Aguilar** en el sistema y **más de un deceased**. Filtra por la intersección.',
    2: 'Plan de tres pasos:\n\n' +
       '1. Encuentra a la víctima: filtra por regex de apellido + status deceased.\n' +
       '2. Encuentra al entrenador: en `gym_members`, los trainers tienen un campo `clients` (array de member_ids). Busca al trainer cuyo array contenga el member_id de la víctima.\n' +
       '3. Encuentra el handle social del entrenador: en `social_posts`, los posts tienen `user_id` que mapea a `member_id`. Busca un post con el user_id del entrenador y lee su campo `user`.\n\n' +
       'Ese `user` es el handle (no es `nombre_apellido` — fue ofuscado a propósito).',
    3: 'Tres queries (o una aggregation con $lookup):\n\n' +
       '```\n' +
       '// 1. Víctima\n' +
       'db.gym_members.findOne({name: /Aguilar/, status: "deceased"})\n' +
       '//   → member_id: 14782\n' +
       '\n' +
       '// 2. Entrenador (filtro por array)\n' +
       'db.gym_members.findOne({clients: 14782})\n' +
       '//   → member_id: 9001 (Carlos Méndez)\n' +
       '\n' +
       '// 3. Handle social del entrenador (cross-collection!)\n' +
       'db.social_posts.findOne({user_id: 9001}, {user: 1, _id: 0})\n' +
       '//   → { user: "pro_coach_mtz" }\n' +
       '```\n\n' +
       'El handle `pro_coach_mtz` es la respuesta.\n\n' +
       'Alternativa elegante con aggregation pipeline (un solo query):\n' +
       '```\n' +
       'db.gym_members.aggregate([\n' +
       '  { $match: { clients: 14782 } },\n' +
       '  { $lookup: { from: "social_posts", localField: "member_id", foreignField: "user_id", as: "posts" } },\n' +
       '  { $project: { _id: 0, name: 1, handle: { $arrayElemAt: ["$posts.user", 0] } } }\n' +
       '])\n' +
       '```\n\n' +
       'Bonus opcional (alibis): primero busca el member_id de los sospechosos físicos (`db.gym_members.findOne({name: /Linares/})` y `/Hernández/`), luego sus posts (`db.social_posts.find({user_id: <id>, timestamp: {$gte: "2026-03-15T22:00", $lt: "2026-03-15T23:30"}})`).'
  },

  E3: {
    1: 'Abre RedisInsight en http://localhost:8083. Sigue los pasos del cheatsheet para agregar la BD (Host=redis, Port=6379, sin password). ' +
       'Hay cientos de keys agrupadas en varios prefijos: cache del gimnasio (`gym:*`, `cam:*`, `temperature:*`), ' +
       'pistas pendientes del buffer de denuncia (`evidence:tip:*`), y documentación de pipelines (`system:pipelines:*`). ' +
       'Para responder esta estación necesitas trabajar con los DOS últimos.',
    2: 'Plan:\n\n' +
       '1. Lista las pistas pendientes (`KEYS evidence:tip:*`) — hay como una docena, sobre temas distintos. Léelas (GET cada una) hasta identificar la relacionada con el caso (la que menciona laboratorio CETEC, entrenador, cable, mochila negra). El testimonio que contenga lo necesitarás en E4.\n\n' +
       '2. Para saber a qué sistema externo va a parar la búsqueda semántica de testimonios, mira los pipelines documentados por DevOps (`KEYS system:pipelines:*`). Uno de ellos describe el flujo testimonios → embeddings → archivo. El nombre del archivo (collection) está como uno de los campos del JSON.',
    3: 'Tres queries en el Workbench:\n\n' +
       '```\n' +
       '// 1. Listar todas las pistas pendientes\n' +
       'KEYS evidence:tip:*\n' +
       '\n' +
       '// 2. Leer cada una hasta encontrar la del caso\n' +
       '//    (la que menciona CETEC, entrenador, mochila negra).\n' +
       '//    En el ejemplo: evidence:tip:20260316_0300_anon\n' +
       'GET evidence:tip:20260316_0300_anon\n' +
       '//    El campo `testimony` es la frase que vas a usar en E4.\n' +
       '\n' +
       '// 3. Buscar el pipeline de semantic search\n' +
       'GET system:pipelines:semantic_search\n' +
       '//    El campo `qdrant_collection` contiene el nombre\n' +
       '//    exacto del archivo — esa es la respuesta de E3.\n' +
       '```'
  },

  E4: {
    1: 'Usa el widget de búsqueda semántica abajo. Empieza pegando la frase del campo `testimony` que rescataste de Redis. ' +
       'NO uses filtro todavía — corre la búsqueda sin filtro primero para entender qué tipo de testimonios hay en el archivo.\n\n' +
       'Vas a notar que los top resultados son **descripciones de la escena** (alguien que vio al entrenador, una bolsa negra, el laboratorio) pero **ninguno te da el nombre completo del asesino**.',
    2: 'Los nombres de personas — con apellido, matrícula, antecedentes — viven en reportes formales, no en testimonios anónimos. ' +
       'Qdrant permite **hybrid search**: vector + filtro de payload. Restringe la búsqueda a la categoría donde la fiscalía guarda los reportes formales.\n\n' +
       'Mira las opciones del dropdown del widget. ¿Cuál suena a "reporte formal con datos de personas identificadas"?',
    3: 'Plan completo:\n\n' +
       '1. Pega esta frase en el widget (la del testimonio anónimo de Redis):\n\n' +
       '> Vi al entrenador entrar al laboratorio del CETEC esa noche con un cable y una mochila negra.\n\n' +
       '2. Selecciona en el dropdown la categoría **`background_check`** (donde están los reportes formales con matrículas y antecedentes).\n\n' +
       '3. Ejecuta. El testimonio TOP bajo ese filtro nombra al asesino con nombre Y apellido. Submit ese nombre completo.\n\n' +
       'Esto es **hybrid search** (vector + payload filter), un patrón real de producción en Qdrant, Pinecone, Weaviate. Sin el filtro, las descripciones anónimas dominan; con el filtro, surfaces los reportes que contienen información identificable.'
  }
};
