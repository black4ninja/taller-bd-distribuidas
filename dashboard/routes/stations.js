import { Router } from 'express';
import { marked } from 'marked';
import { STATIONS, checkStation } from '../lib/validators.js';
import {
  ALL_STATIONS,
  recordStationOpen,
  getStationOpenedAt,
  isStationCompleted,
  markStationCompleted,
  previousStationBlocking,
  recordSubmitAttempt,
  decrementCredibility,
  getPlayer,
  hintLevelUnlocked,
  HINT_UNLOCK_SECONDS,
  checkAndApplyTimeout,
  getCase,
  effectiveNowMs
} from '../lib/game-state.js';

const router = Router();

const STATION_INTRO = {
  E1: {
    motor: 'PostgreSQL (relacional)',
    ui_url: 'http://localhost:8081',
    ui_label: 'Adminer (Postgres)',
    cheatsheet: 'postgres',
    why_this_db: `
**¿Por qué PostgreSQL para estos datos?**

Las personas, entrevistas y reportes de crimen forman un **dominio relacional clásico**:

- **Schema fijo y conocido**: toda persona tiene id, name, address; toda entrevista pertenece a UNA persona.
- **Integridad referencial**: una entrevista no puede existir sin la persona que la dio (FK \`person_id\`). Postgres lo garantiza con ACID; si fuera un archivo CSV o JSON suelto, podrías tener entrevistas huérfanas.
- **Queries ad-hoc complejas**: necesitas JOIN entre 3 tablas con filtros por dirección, gym_member_id y descripción. SQL fue diseñado exactamente para esto.
- **Consistencia inmediata**: cuando alguien del equipo agrega una entrevista, todos los demás la ven al instante (ACID).

Si pusieras esto en MongoDB: tendrías que duplicar la persona en cada entrevista, o referenciarla por id y "hacer el JOIN en código". Si fuera en Redis: las consultas tipo \`WHERE address LIKE 'Calle X%'\` requerirían escanear todas las keys.`,
    narrative: `
La fiscalía organizó la información oficial del caso en una base estructurada del campus. Adentro está el reporte oficial del crimen, el padrón de personas vinculadas a la investigación y las transcripciones de las entrevistas que se tomaron a los testigos esa noche.

El reporte oficial **identifica a los tres testigos** — no los nombra directamente, sino que los menciona por su dirección de domicilio o por su número de cliente del gimnasio. Tu trabajo es **localizar a esos tres testigos y leer sus declaraciones completas**.

Pon especial atención a las descripciones físicas que dan: son lo suficientemente específicas como para coincidir con **anotaciones internas** dejadas en el padrón sobre algunas personas. De esa coincidencia salen dos sospechosos físicos que la policía ya tiene en la mira.

**Submit**: el nombre completo de CUALQUIERA de los 2 sospechosos físicos.`
  },
  E2: {
    motor: 'MongoDB (documental, NoSQL)',
    ui_url: 'http://localhost:8082',
    ui_label: 'mongo-express',
    cheatsheet: 'mongo',
    why_this_db: `
**¿Por qué MongoDB para estos datos?**

Los posts sociales y los miembros del gimnasio son **datos semi-estructurados con variabilidad**:

- **Schema flexible**: algunos posts tienen \`photo_url\`, otros no; algunos tienen geo, otros caption sola. Mongo acepta esa irregularidad sin migración. Trainers tienen campo \`clients[]\`, clientes regulares tienen \`trainer_id\` — distinta estructura, misma colección.
- **Arrays nativos como ciudadanos de primera clase**: \`clients: [14782, 14745, ...]\` es indexable y filtrable directo (\`{"clients": 14782}\`). En SQL necesitarías tabla intermedia \`trainer_clients(trainer_id, client_id)\` + JOIN para la misma pregunta.
- **Documentos auto-contenidos**: un post trae user + timestamp + location + caption en un solo JSON. Para mostrarlo no necesitas N JOINs.
- **Escalabilidad horizontal**: redes sociales generan millones de posts/día. Mongo sharda naturalmente; Postgres requiere setup mucho más complejo.

Si esto fuera SQL: \`ALTER TABLE\` cada vez que un post agregue un campo opcional, JOIN obligatorio para arrays de clientes, performance degrada con escala.`,
    narrative: `
Identificaste a dos sospechosos físicos. Antes de ir tras ellos hay que **verificar si tenían coartada esa noche** — y eso vive en un sistema documental separado del padrón policial: ahí están las redes sociales y los registros del gimnasio del campus.

Si las coartadas de tus dos sospechosos resultan sólidas, **regresa al expediente y relee la declaración de la tercera testigo**: ella mencionó a alguien específico — no a un sospechoso físico, sino a una persona del entorno de la víctima que estaba alterada esa noche diciendo que iba a "arreglar las cosas". Tu siguiente paso: **identificar al entrenador personal de la víctima y conseguir su handle de redes sociales** — ese alias es lo que la Fiscalía está rastreando ya en otras plataformas.

**Cómo está modelada la base** (importante, porque te obliga a correlacionar):
- El padrón del gimnasio (\`gym_members\`) tiene a los clientes y a los entrenadores. Los entrenadores tienen un campo \`clients\` que es un **array** con los IDs de sus clientes. Pero los registros NO tienen el atajo inverso (el cliente no dice quién es su entrenador): tienes que hacer la búsqueda con el array.
- Las redes sociales (\`social_posts\`) usan **handles obscuros**, no \`nombre_apellido\`. Para vincular un post con una persona del padrón, cada post tiene un campo \`user_id\` que mapea a \`gym_members.member_id\`.
- Eso significa que para conseguir el handle del asesino necesitas correlacionar AMBAS colecciones (lookup cruzado o dos queries encadenadas).

**Detalle clave (vulnerabilidad real explotable)**: el servicio MongoDB del campus está corriendo **SIN autenticación**. El equipo de Fiscalía te dio acceso de shell vía la herramienta abajo. Hay **más de 270 personas registradas y cientos de posts** — el scan visual no es viable. Ejecuta queries.

Hay además una colección oculta (fuera del listado público) con chat-logs y reportes que te dan contexto del motivo.

**Submit**: el **handle de red social** (username) del entrenador personal de la víctima — el que aparece en el campo \`user\` de sus posts.`
  },
  E3: {
    motor: 'Redis (key-value, en memoria)',
    ui_url: 'http://localhost:8083',
    ui_label: 'RedisInsight',
    cheatsheet: 'redis',
    why_this_db: `
**¿Por qué Redis para estos datos?**

Redis tiene en producción **dos usos clásicos**, y el campus aprovecha ambos en la misma instancia:

1. **Cache / datos efímeros de alta frecuencia** — check-ins del torno, status de cámaras, métricas de temperatura. Cada vez que alguien pasa la tarjeta en el torno, el sistema debe decidir "abrir o no" en menos de 100ms. Redis lo hace en memoria; PostgreSQL en disco difícilmente alcanza.
2. **Cola / buffer de ingestión** — cuando una app necesita ACEPTAR datos rápido y procesarlos después en batch. El web form de la línea de denuncia anónima del campus es un ejemplo: cuando alguien envía una pista, el servidor escribe a Redis (sub-milisegundo, no bloquea al usuario) y un worker batch la mueve cada hora a la base permanente de la Fiscalía. Patrón **producer-consumer** clásico.

Otras cualidades clave:
- **TTL nativo**: las keys pueden auto-expirar (ideal para sesiones, tokens, métricas).
- **Tasa de escritura brutal**: 100k+ ops/s en una sola instancia.
- **Estructura simple**: key→value, sin relaciones complejas.

Por eso muchos sistemas reales **usan Redis Y SQL juntos**: Redis para el "ahora" (cache, sesiones, colas, métricas live), SQL para el "histórico" (reportes, análisis, registros permanentes).

En el caso: el testimonio anónimo entró por el formulario de denuncia y quedó en el buffer de Redis. El worker que lo iba a mover a la base permanente quedó **suspendido al abrirse la investigación** (para preservar cadena de custodia). Por eso sigue ahí.`,
    narrative: `
El sistema Redis del campus aloja tres cosas en la misma instancia: (1) cache de check-ins del gimnasio (\`gym:*\`, \`cam:*\`, \`temperature:*\`), (2) **buffer de la línea de denuncia anónima** del campus — las pistas que la gente envía por el formulario web entran aquí antes de pasar al sistema permanente de la Fiscalía, y (3) **documentación de pipelines del sistema** que dejó DevOps para que los servicios sepan cómo fluyen los datos entre componentes.

El worker que mueve las pistas a Fiscalía quedó **suspendido al abrirse la investigación** (cadena de custodia). Las pistas siguen en el buffer. Hay varias — la gente reportó cosas distintas estos días (cafetería, bicicleta robada, ruidos en otro edificio, etc.). **Tu trabajo es leerlas para identificar la relevante a este caso**: una donde el testigo describa algo que conecte con la víctima y el entrenador.

Cuando la identifiques, vas a tener el texto del testimonio. Pero ese texto, por sí solo, no nombra al asesino — solo lo describe. Para encontrar el nombre, vas a tener que pasar ese testimonio por un sistema de búsqueda semántica que indexa todos los testimonios históricos de la fiscalía. ¿Cuál sistema? **Eso te lo dice la documentación de pipelines de DevOps** — busca bajo el prefijo \`system:pipelines:*\`. Uno de esos pipelines describe el flujo de testimonios y nombra exactamente el archivo donde están indexados.

**Detalle clave (vulnerabilidad real)**: este servicio corre SIN contraseña. Cualquiera con acceso a la red interna puede listar todas las claves y leer sus valores — exponiendo no solo cache, sino los buffers de ingestión Y la documentación de arquitectura del sistema.

**Submit**: el nombre exacto del archivo de testimonios que aparece en la configuración del pipeline de búsqueda semántica.`
  },
  E4: {
    motor: 'Qdrant (vectorial)',
    ui_url: 'http://localhost:6333/dashboard',
    ui_label: 'Qdrant UI',
    cheatsheet: 'qdrant',
    why_this_db: `
**¿Por qué Qdrant para estos datos?**

Los testimonios anónimos son **texto libre que necesitas comparar por SIGNIFICADO, no por palabras exactas**:

- **Búsqueda semántica**: tu pista dice "entrenador con bolsa negra"; el testimonio guardado dice "instructor con mochila negra". Para PostgreSQL con \`LIKE '%entrenador%'\` o full-text search, esas son frases DISTINTAS. Qdrant las reconoce como **idénticas en significado** porque trabaja con vectores de embeddings que capturan semántica.
- **Manejo de sinónimos, paráfrasis y errores tipográficos** automático: "Pedro amenazó a su cliente" matchearía con "el entrenador intimidó al alumno" sin que tengas que listar sinónimos a mano.
- **Multilingüe**: el modelo \`paraphrase-multilingual-MiniLM-L12-v2\` entiende español, inglés, francés... y vectores semánticamente cercanos cruzan idiomas.
- **Indexación HNSW**: búsqueda sub-segundo entre millones de vectores. Sin esto, comparar 1 frase contra 10M de testimonios sería computacionalmente prohibitivo.

Aplicaciones reales: búsqueda de productos por descripción, retrieval para RAG (chatbots con LLMs), detección de duplicados, recomendación basada en contenido. Si tus datos son **texto, imágenes, audio o cualquier cosa que pueda volverse un embedding**, necesitas un vectorial.`,
    narrative: `
La fiscalía mantiene un archivo central de testimonios y registros indexado por **embeddings semánticos** — la búsqueda es por significado, no por keywords. Cada documento tiene una categoría que indica su origen (declaraciones de testigos, reportes formales, análisis OSINT, pistas archivadas).

El testimonio anónimo que rescataste de Redis describe la escena, pero el testigo **no sabe quién es el asesino — solo lo describe**. El nombre completo del asesino sí está en este archivo, pero la búsqueda semántica trae documentos similares al que ingreses: si pegas una descripción de testigo, vas a obtener más descripciones de testigos. Encontrar la respuesta no es un copy-paste — es **trabajo de detective**.

Algunas preguntas que te conviene contestar antes de empezar a buscar:

- ¿En qué **tipo** de documento de este archivo esperarías encontrar el nombre completo y formal de una persona, junto con sus datos identificables?
- De la información que **ya descubriste** en estaciones anteriores, ¿qué hecho específico del caso te permitiría distinguir al asesino de otras personas con perfiles similares (mismo gimnasio, mismo rol, mismo apellido)?
- ¿Cómo redactarías tu consulta para que el sistema semántico traiga ese documento específico — usando el lenguaje del archivo, no el del testigo?

El widget de abajo combina búsqueda vectorial con filtro por categoría (**hybrid search**, patrón estándar en producción). La primera consulta rara vez es la correcta. Itera. Refina.

**Submit**: el **nombre completo** del asesino (Nombre Apellido). Submits parciales no son aceptados — el archivo contiene varias personas con nombres y apellidos parecidos.`
  }
};

router.get('/station/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const station = STATIONS[id];
  const intro = STATION_INTRO[id];
  if (!station || !intro) return res.status(404).send('Estación no existe');

  const pid = req.playerId;
  checkAndApplyTimeout(pid);
  const player = getPlayer(pid);

  // Si game over, mostrar el screen de game over (no la estación)
  if (player?.game_over) {
    return res.render('game-over', { player, caseObj: getCase(pid) });
  }

  // ¿Bloqueada por estación anterior?
  const blockedBy = previousStationBlocking(pid, id);
  if (!blockedBy) {
    recordStationOpen(pid, id);
  }
  const openedAt = getStationOpenedAt(pid, id);

  // Calcular timers de pistas (usando effectiveNow para que dev accel cuente)
  const nowMs = effectiveNowMs(pid);
  const hintStatus = {};
  for (const level of [1, 2, 3]) {
    hintStatus[level] = hintLevelUnlocked(openedAt, level, nowMs);
  }

  res.render('station', {
    id,
    title: station.title,
    intro: {
      ...intro,
      narrative_html: marked.parse(intro.narrative),
      why_this_db_html: intro.why_this_db ? marked.parse(intro.why_this_db) : null
    },
    player,
    blockedBy: blockedBy || null,
    openedAt,
    hintStatus,
    HINT_UNLOCK_SECONDS,
    completed: isStationCompleted(pid, id),
    showVectorWidget: id === 'E4',
    showMongoShell: id === 'E2'
  });
});

router.post('/station/:id/check', (req, res) => {
  const id = req.params.id.toUpperCase();
  const pid = req.playerId;
  checkAndApplyTimeout(pid);
  const player = getPlayer(pid);

  if (player?.game_over) {
    return res.status(403).json({ ok: false, game_over: true, game_over_reason: player.game_over_reason, error: 'Caso cerrado.' });
  }
  // Bloqueo de orden
  const blockedBy = previousStationBlocking(pid, id);
  if (blockedBy) {
    return res.status(403).json({ ok: false, error: `Tienes que cerrar primero la estación ${blockedBy}.` });
  }

  const { answer } = req.body || {};
  const caseObj = getCase(pid);
  const result = checkStation(id, answer, caseObj);
  recordSubmitAttempt(pid, id, answer, result.ok);

  if (result.ok) {
    markStationCompleted(pid, id);
    return res.json({ ok: true });
  }

  // Falló — decrementar credibilidad
  decrementCredibility(pid);
  const updated = getPlayer(pid);
  return res.json({
    ok: false,
    error: result.error,
    credibility: updated.credibility,
    game_over: !!updated.game_over
  });
});

export default router;
export { STATION_INTRO };
