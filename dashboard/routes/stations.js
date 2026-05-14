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
La fiscalía organizó la información oficial del caso en una base estructurada del campus. Adentro está el reporte oficial del crimen, el padrón de personas vinculadas a la investigación y las transcripciones de las entrevistas que se tomaron a los testigos esa noche.

El reporte oficial **identifica a los tres testigos** — no los nombra directamente, sino que los menciona por su dirección de domicilio o por su número de cliente del gimnasio. Tu trabajo es **localizar a esos tres testigos y leer sus declaraciones completas**.

Pon especial atención a las descripciones físicas que dan: son lo suficientemente específicas como para coincidir con **anotaciones internas** que el investigador anterior dejó sobre algunas personas del padrón. De esa coincidencia salen dos sospechosos físicos que la policía ya tiene en la mira.

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
Identificaste a dos sospechosos físicos. Antes de ir tras ellos hay que **verificar si tenían coartada esa noche** — y eso vive en un sistema documental separado del padrón policial: ahí están las redes sociales y los registros del gimnasio del campus, donde caben posts con fotos, ubicaciones, listas de clientes por entrenador, conversaciones.

Si las coartadas de tus dos sospechosos resultan sólidas, vas a tener que **regresar al expediente y releer la declaración de la tercera testigo**. Ella mencionó a alguien específico — no a un sospechoso físico, sino a una **persona del entorno de la víctima** que estaba alterada esa noche diciendo que iba a "arreglar las cosas". Tu siguiente paso: **identificar quién era exactamente el entrenador personal de la víctima**.

**Detalle clave (vulnerabilidad real explotable)**: el servicio MongoDB del campus está corriendo **SIN autenticación**. El equipo de Fiscalía te dio acceso de shell vía la herramienta que ves abajo en esta página. **El sistema tiene más de 250 personas registradas y cientos de posts** — no vas a poder navegarlo visualmente. Tienes que **ejecutar queries reales** para extraer la información que necesitas.

Hay además una colección oculta (fuera del listado público) con chat-logs y reportes que te dan contexto del motivo, también accesible porque no hay autenticación.

**Submit**: el número de cliente (4 dígitos) del entrenador personal de la víctima.`
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
El gimnasio del campus usa un sistema de check-in con tarjeta: cada entrada genera un registro. Las cámaras de seguridad, los sensores de temperatura y los contadores de uso también escriben aquí. Es un sistema optimizado para velocidad — necesita responder en milisegundos cuando alguien pasa la tarjeta del torno.

Tienes el número de cliente del nuevo sospechoso (del paso anterior). Por ahí puedes empezar a buscar entre los miles de registros del sistema. Pero hay algo más interesante esperándote: **alguien dejó un registro que no encaja con ningún patrón rutinario del sistema**. Los registros normales siguen formatos predecibles (acceso de gimnasio, lectura de cámara, métrica de temperatura), pero **una clave rompe ese patrón** y fue añadida fuera del flujo automático. Es información que alguien quiso preservar.

Cuando la encuentres y leas su contenido, vas a tener **un testimonio anónimo en texto** — y ese testimonio te apunta directamente al sistema donde vas a confirmar la identidad del asesino.

**Detalle clave (vulnerabilidad real)**: este sistema corre SIN contraseña — otro error real de configuración. Cualquiera con acceso a la red puede listar todas las claves del sistema y leer sus valores. En producción, esto sería catastrófico.

**Submit**: el nombre exacto del archivo de testimonios que la nota interna te indica consultar a continuación.`
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
La fiscalía recibió decenas de testimonios anónimos sobre el caso a través de su línea de denuncia. Los testimonios están indexados con embeddings semánticos — no se buscan por palabras exactas sino **por significado**. Esto importa: el testimonio que encontraste en el sistema del gimnasio describe al asesino sin nombrarlo. Necesitas localizar **otros testimonios que digan lo mismo con otras palabras** — incluyendo, esperamos, alguno que sí lo nombre por completo.

Como tú no vas a calcular embeddings a mano (eso lo hace un modelo de machine learning), usa el **widget de búsqueda semántica que aparece abajo**: pega la frase del testimonio del paso anterior y el sistema buscará los testimonios más cercanos en significado dentro del archivo de la fiscalía. El que tenga el score más alto contendrá el nombre completo del asesino.

**Submit**: el nombre completo del asesino (nombre y apellido, tal como aparece textualmente en el testimonio con score más alto).`
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
    showVectorWidget: id === 'E4',
    showMongoShell: id === 'E2'
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
