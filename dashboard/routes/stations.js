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
    narrative: `
Los 2 sospechosos están en redes sociales. Verifica sus coartadas en la colección \`social_posts\` (base \`investigation\`).
Vas a ver que ambos tienen alibis sólidos esa noche — no son ellos.

**El detalle clave**: mongo-express está corriendo SIN AUTENTICACIÓN — cualquiera con acceso a la red puede ver TODAS las colecciones, incluyendo las que el equipo nunca documentó públicamente. No están "ocultas": están expuestas porque nadie configuró auth. Aprovecha esto y revisa todas las colecciones (las que empiezan con \`_\` son una pista visual de que son internas).

**Submit**: el nombre EXACTO de una clave de Redis mencionada en la pista que encontraste.`
  },
  E3: {
    motor: 'Redis (key-value, en memoria)',
    ui_url: 'http://localhost:8083',
    ui_label: 'RedisInsight',
    cheatsheet: 'redis',
    narrative: `
Tienes el nombre de una clave. Pero Redis también está SIN PASSWORD — cualquiera con acceso a la red puede listar TODAS las claves con \`KEYS *\`.
Conéctate, encuentra la clave y lee su valor (es JSON).

**Submit**: el nombre EXACTO de la collection en Qdrant que la nota interna te indica consultar.`
  },
  E4: {
    motor: 'Qdrant (vectorial)',
    ui_url: 'http://localhost:6333/dashboard',
    ui_label: 'Qdrant UI',
    cheatsheet: 'qdrant',
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
    intro: { ...intro, narrative_html: marked.parse(intro.narrative) },
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
