import { Router } from 'express';
import { marked } from 'marked';
import { STATIONS, checkStation } from '../lib/validators.js';
import { getProgress, saveProgress, markCompleted, ALL_STATIONS } from '../lib/progress.js';

const router = Router();

// Narrativa específica de cada estación.
// Diseñada para que un alumno sin experiencia previa pueda entender QUÉ hacer.
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
- **Consistencia inmediata**: cuando un investigador agrega una entrevista, todos los demás la ven al instante (ACID).

Si pusieras esto en MongoDB: tendrías que duplicar la persona en cada entrevista, o referenciarla por id y "hacer el JOIN en código". Si fuera en Redis: las consultas tipo \`WHERE address LIKE 'Calle X%'\` requerirían escanear todas las keys.`,
    narrative: `
La policía rescató un sistema con 3 tablas: \`crime_scene_report\`, \`persons\` y \`interviews\`.
El reporte oficial menciona a 3 testigos identificados por su dirección o número de gimnasio.
**Tu misión**: encuentra las entrevistas de los 3 testigos y cruza las descripciones físicas con la columna \`notes\` de la tabla \`persons\` para identificar a los 2 sospechosos físicos.

**Submit**: el nombre completo de CUALQUIERA de los 2 sospechosos.`
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
Tienes 2 sospechosos físicos (Sofía y David). Pero **relee la entrevista de Diana** — la tercera testigo: ella menciona específicamente al **entrenador personal de la víctima** "muy alterado, diciendo que iba a arreglar las cosas esa noche". Ese hilo es lo que vas a investigar en MongoDB.

Usa mongo-express en la base \`investigation\`.

**Tarea 1 (alibis)**: filtra la colección \`social_posts\` por usuario. Los usernames siguen el patrón \`nombre_apellido\` en minúsculas (ej. \`sofia_linares\`, \`david_hernandez\`). Vas a confirmar que ambos sospechosos tienen alibis sólidos esa noche — no son ellos.

**Tarea 2 (el verdadero culpable — gating)**: en la colección \`gym_members\`, los entrenadores tienen un campo \`clients\` que es un ARRAY con los \`member_id\` de sus clientes. La víctima (Dr. Aguilar) tiene \`member_id: 14782\`. Encuentra al entrenador cuyo array \`clients\` contiene 14782 usando un filtro JSON. Eso te da al asesino.

**Pista de vulnerabilidad**: mongo-express corre sin auth (intencional). Si quieres más contexto sobre el motivo (chat-log entre la víctima y un amigo, background check del sospechoso), revisa la colección \`_evidence_archive\` — está expuesta porque nadie configuró autenticación.

**Submit**: el \`member_id\` (4 dígitos) del entrenador asesino.`
  },
  E3: {
    motor: 'Redis (key-value, en memoria)',
    ui_url: 'http://localhost:8083',
    ui_label: 'RedisInsight',
    cheatsheet: 'redis',
    why_this_db: `
**¿Por qué Redis para estos datos?**

Los check-ins de gimnasio, lecturas de cámara y métricas de temperatura son **datos de alta frecuencia con acceso ultra-rápido**:

- **Latencia sub-milisegundo**: cada vez que alguien pasa la tarjeta en el torno, el sistema debe decidir "abrir o no" en menos de 100ms. Redis lo hace en memoria; PostgreSQL en disco difícilmente alcanza.
- **Datos efímeros / time-series ligero**: \`gym:checkin:trainer:9001:2026-03-15T06:00\` es un dato que importa hoy pero no en 5 años. Redis tiene TTL nativo (auto-expiración) y patrones de keys jerárquicas.
- **Tasa de escritura brutal**: en hora pico un gimnasio puede tener 50 check-ins/min, sin contar lecturas de cámara cada segundo. Redis maneja 100k+ ops/s en una sola instancia.
- **Estructura simple**: key→value es suficiente; no necesitas relaciones complejas para "¿fichó el trainer X hoy?".

Por eso muchos sistemas reales **usan Redis y SQL juntos**: Redis para el "ahora" (cache, sesiones, métricas live), SQL para el "histórico" (reportes mensuales, análisis). La pista del informante quedó aquí porque el sistema del gimnasio guarda todo en Redis — incluido lo que no debería.`,
    narrative: `
Tienes el \`member_id\` del entrenador asesino (un número de 4 dígitos). El sistema de seguridad del gimnasio guarda check-ins en Redis con el patrón normal \`gym:checkin:trainer:<id>:<fecha>:<hora>\`.

Pero alguien dejó una clave **fuera del patrón estándar**: empieza con \`evidence:\` en lugar de \`gym:\`. Redis corre SIN PASSWORD (cualquiera con acceso a la red puede listar todas las claves), así que puedes encontrarla con \`KEYS evidence:*\`. Hay solo una.

Lee su valor (es JSON con varios campos). Adentro, un campo apunta al SIGUIENTE motor.

**Submit**: el nombre EXACTO de la collection vectorial en Qdrant que la nota interna te indica consultar.`
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
- **Manejo de sinónimos, paráfrasis y errores tipográficos** automático: "Carlos amenazó a su cliente" matchearía con "el entrenador intimidó al alumno" sin que tengas que listar sinónimos a mano.
- **Multilingüe**: el modelo \`paraphrase-multilingual-MiniLM-L12-v2\` entiende español, inglés, francés... y vectores semánticamente cercanos cruzan idiomas.
- **Indexación HNSW**: búsqueda sub-segundo entre millones de vectores. Sin esto, comparar 1 frase contra 10M de testimonios sería computacionalmente prohibitivo.

Aplicaciones reales: búsqueda de productos por descripción, retrieval para RAG (chatbots con LLMs), detección de duplicados, recomendación basada en contenido. Si tus datos son **texto, imágenes, audio o cualquier cosa que pueda volverse un embedding**, necesitas un vectorial.`,
    narrative: `
Tienes el nombre de una collection con embeddings de testimonios anónimos.
Como tú no sabes generar embeddings a mano, usa el widget de abajo para hacer búsqueda semántica:
pega la frase de testimonio que encontraste en Redis y verás los testimonios más similares.

**Submit**: el nombre completo del asesino (que aparece textualmente en el testimonio con score más alto).`
  }
};

router.get('/station/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const station = STATIONS[id];
  const intro = STATION_INTRO[id];
  if (!station || !intro) return res.status(404).send('Estación no existe');

  const progress = getProgress(req);
  const idx = ALL_STATIONS.indexOf(id);
  const previousStations = ALL_STATIONS.slice(0, idx);
  const blockedBy = previousStations.find(p => !progress.completed.includes(p));

  res.render('station', {
    id,
    title: station.title,
    intro: {
      ...intro,
      narrative_html: marked.parse(intro.narrative),
      why_this_db_html: intro.why_this_db ? marked.parse(intro.why_this_db) : null
    },
    progress,
    blockedBy: blockedBy || null,
    showVectorWidget: id === 'E4'
  });
});

router.post('/station/:id/check', (req, res) => {
  const id = req.params.id.toUpperCase();
  const { answer } = req.body || {};
  const result = checkStation(id, answer);
  const progress = getProgress(req);

  if (result.ok) {
    markCompleted(progress, id);
    saveProgress(res, progress);
  }
  res.json(result);
});

export default router;
export { STATION_INTRO };
