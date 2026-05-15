// Pistas progresivas dinámicas por caso del jugador.
//
// Cada hint es una función que recibe el caseObj del player y devuelve el texto
// con los valores específicos sustituidos (víctima, asesino, IDs, handle, etc.).

function lastName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(/\s+/);
  return parts[parts.length - 2] || parts[parts.length - 1];
}

export function getHints(stationId, c) {
  if (!c) return { 1: 'Caso no inicializado.', 2: '', 3: '' };
  const victimSurname = lastName(c.victim.name);
  const witness3GymId = c.witnesses[2].gym_member_id;

  switch (stationId) {
    case 'E1': return {
      1: 'Abre Adminer en http://localhost:8081 (servidor: postgres, usuario: pg, pass: pg, db: investigation). ' +
         'Hay 3 tablas: crime_scene_report, persons, interviews. El crime_scene_report describe la dirección de 3 testigos.',
      2: `Necesitas un JOIN entre persons e interviews filtrando por dirección (las primeras 2 testigos) y por gym_member_id (la tercera — fíjate en el número que aparece en el crime_scene_report). ` +
         'Una vez tengas las 3 entrevistas, las descripciones físicas mencionan a 2 sospechosos. La 3ra entrevista abre un hilo distinto (lee la palabra "entrenador").',
      3: '```sql\n' +
         'SELECT p.name, i.transcript\n' +
         'FROM persons p\n' +
         'JOIN interviews i ON i.person_id = p.id\n' +
         `WHERE p.address LIKE 'Calle Tecnológico%'\n` +
         `   OR p.address LIKE 'Av. Eugenio Garza Sada%'\n` +
         `   OR p.gym_member_id = ${witness3GymId};\n` +
         '```\n\n' +
         'Lee LAS TRES entrevistas con cuidado — incluyendo la del tercer testigo. ' +
         'Las dos primeras dan descripciones físicas que llevan a 2 sospechosos visibles. La tercera abre un hilo distinto (la palabra clave es "entrenador") que vas a explotar en E2.\n\n' +
         'Para sospechosos físicos (los traits varían por caso):\n' +
         '```sql\n' +
         `SELECT name FROM persons WHERE notes ILIKE '%rubio%' OR notes ILIKE '%barba%' OR notes ILIKE '%alto%' OR notes ILIKE '%rapado%' OR notes ILIKE '%pelirrojo%' OR notes ILIKE '%castaño%' OR notes ILIKE '%teñido%' OR notes ILIKE '%corto%';\n` +
         '```\n' +
         'Submit cualquiera de los 2 nombres encontrados.'
    };

    case 'E2': return {
      1: 'Necesitas correlacionar **dos colecciones**: `gym_members` (donde está la víctima y el entrenador con su array de clients) y `social_posts` (donde están los handles de redes sociales vinculados por `user_id`).\n\n' +
         'Arranca entendiendo cuántos documentos hay:\n\n' +
         '```\n' +
         'db.gym_members.countDocuments({})\n' +
         'db.social_posts.countDocuments({})\n' +
         '```\n\n' +
         `El expediente público te dio el nombre de la víctima. Filtra por el apellido (regex) intersectado con status: "deceased".`,
      2: `Plan de tres pasos:\n\n` +
         `1. Encuentra a la víctima: filtra por regex de apellido (${victimSurname}) + status deceased.\n` +
         '2. Encuentra al entrenador: en `gym_members`, los trainers tienen un campo `clients` (array de member_ids). Busca al trainer cuyo array contenga el member_id de la víctima.\n' +
         '3. Encuentra el handle social del entrenador: en `social_posts`, los posts tienen `user_id` que mapea a `member_id`. Busca un post con el user_id del entrenador y lee su campo `user`.\n\n' +
         'Ese `user` es el handle social del asesino — esa es la respuesta de E2.',
      3: 'Tres queries (o una aggregation con $lookup):\n\n' +
         '```\n' +
         '// 1. Víctima\n' +
         `db.gym_members.findOne({name: /${victimSurname}/, status: "deceased"})\n` +
         '//   → ahí ves su member_id\n' +
         '\n' +
         '// 2. Entrenador (filtro por array)\n' +
         'db.gym_members.findOne({clients: <member_id de la víctima>})\n' +
         '//   → su member_id\n' +
         '\n' +
         '// 3. Handle social del entrenador (cross-collection!)\n' +
         'db.social_posts.findOne({user_id: <member_id del entrenador>}, {user: 1, _id: 0})\n' +
         '//   → el campo `user` es la respuesta\n' +
         '```\n\n' +
         'Alternativa elegante con aggregation pipeline:\n' +
         '```\n' +
         'db.gym_members.aggregate([\n' +
         `  { $match: { name: /${victimSurname}/, status: "deceased" } },\n` +
         '  { $project: { member_id: 1 } }\n' +
         ']);\n' +
         '// con el member_id resultante:\n' +
         'db.gym_members.aggregate([\n' +
         '  { $match: { clients: <victim_member_id> } },\n' +
         '  { $lookup: { from: "social_posts", localField: "member_id", foreignField: "user_id", as: "posts" } },\n' +
         '  { $project: { _id: 0, name: 1, handle: { $arrayElemAt: ["$posts.user", 0] } } }\n' +
         '])\n' +
         '```'
    };

    case 'E3': return {
      1: 'Abre RedisInsight en http://localhost:8083. Sigue los pasos del cheatsheet para agregar la BD (Host=redis, Port=6379, sin password). ' +
         'Hay cientos de keys agrupadas en varios prefijos: cache del gimnasio (`gym:*`, `cam:*`, `temperature:*`), ' +
         'pistas pendientes del buffer de denuncia (`evidence:tip:*`), y documentación de pipelines (`system:pipelines:*`). ' +
         'Para responder esta estación necesitas trabajar con los DOS últimos.',
      2: 'Plan:\n\n' +
         '1. Lista las pistas pendientes (`KEYS evidence:tip:*`) — hay como una docena, sobre temas distintos. Léelas (GET cada una) hasta identificar la relacionada con el caso (la que menciona el lugar del crimen, entrenador, mochila negra). El testimonio que contenga lo necesitarás en E4.\n\n' +
         '2. Para saber a qué sistema externo va a parar la búsqueda semántica de testimonios, mira los pipelines documentados por DevOps (`KEYS system:pipelines:*`). Uno de ellos describe el flujo testimonios → embeddings → archivo. El nombre del archivo (collection) está como uno de los campos del JSON.',
      3: 'Tres queries en el Workbench:\n\n' +
         '```\n' +
         '// 1. Listar todas las pistas pendientes\n' +
         'KEYS evidence:tip:*\n' +
         '\n' +
         '// 2. Leer cada una hasta encontrar la del caso\n' +
         '//    (la que menciona el lugar del crimen, entrenador, mochila negra).\n' +
         '//    GET <key>\n' +
         '//    El campo `testimony` es la frase que vas a usar en E4.\n' +
         '\n' +
         '// 3. Buscar el pipeline de semantic search\n' +
         'GET system:pipelines:semantic_search\n' +
         '//    El campo `qdrant_collection` contiene el nombre\n' +
         '//    exacto del archivo — esa es la respuesta de E3.\n' +
         '```'
    };

    case 'E4': return {
      1: 'La búsqueda semántica devuelve documentos similares al texto que ingreses. Si pegas una descripción de testigo, vas a obtener más descripciones de testigos — ninguna nombra al asesino.\n\n' +
         'Pregúntate: ¿en qué TIPO de documento del archivo esperarías encontrar el nombre completo de una persona, su matrícula, sus clientes y sus antecedentes? Las categorías disponibles son: witness_account, anonymous_tip, background_check, social_media_intel.\n\n' +
         'Filtra a esa categoría para reducir el ruido antes de iterar.',
      2: 'Cuando filtras a los reportes formales vas a ver muchos perfiles similares: varios instructores del mismo gimnasio, varios con antecedentes parecidos. La búsqueda semántica plana no los distingue bien.\n\n' +
         `El asesino tiene una característica que NINGÚN otro reporte comparte: una **relación documentada con la víctima** (recuerda el nombre completo de la víctima del expediente público — ${c.victim.name}). Esa relación específica está escrita en uno de los reportes.\n\n` +
         'Formula tu búsqueda en el lenguaje del reporte (relación de trabajo, cliente, vínculo) y mencionando la información del caso que conoces.',
      3: 'Path completo:\n\n' +
         '1. Selecciona la categoría **`background_check`** en el dropdown del widget.\n' +
         `2. Pega como consulta (ejemplo):\n\n` +
         `> instructor cuyo cliente principal era ${c.victim.name} con antecedentes de agresión verbal\n\n` +
         '3. El top-1 nombra al asesino con nombre Y apellido completo.\n\n' +
         'Submit el **nombre completo** (Nombre Apellido). El validador no acepta partials — hay varios reportes con apellidos similares.'
    };

    default: return { 1: '', 2: '', 3: '' };
  }
}
