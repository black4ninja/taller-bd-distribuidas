import Redis from 'ioredis';

// Redis del campus aloja TRES sistemas en la misma instancia:
//   1. Cache de check-ins del gimnasio (gym:*, cam:*, temperature:*)
//   2. Buffer de la línea de denuncia anónima (evidence:tip:*) — patrón producer-consumer
//      donde un worker mueve las pistas al sistema permanente cada hora.
//      Al abrirse la investigación se suspendió el worker (cadena de custodia) — las
//      pistas siguen ahí.
//   3. Configuración de pipelines del sistema (system:pipelines:*) — documentación de
//      arquitectura que dejó DevOps. Una describe el flujo testimonios → Qdrant.

const TRAINERS = [9001, 9050, 9077];
const MEMBERS = [14782, 14745, 14820, 14790, 14760, 14755, 14801, 14810];
const DATES = ['2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16'];

function checkinNoise() {
  const entries = [];
  for (const trainer of TRAINERS) {
    for (const date of DATES) {
      entries.push({ key: `gym:checkin:trainer:${trainer}:${date}T06:00`, value: 'IN'  });
      entries.push({ key: `gym:checkin:trainer:${trainer}:${date}T22:00`, value: 'OUT' });
    }
  }
  for (const member of MEMBERS) {
    for (const date of DATES) {
      entries.push({ key: `gym:checkin:member:${member}:${date}T18:30`, value: 'IN'  });
      entries.push({ key: `gym:checkin:member:${member}:${date}T19:45`, value: 'OUT' });
    }
  }
  // El 15 de marzo Carlos NO hizo check-out a las 22:00 (anomalía sutil)
  return entries.filter(e => !(e.key === 'gym:checkin:trainer:9001:2026-03-15T22:00'));
}

function cameraNoise() {
  const cams = ['cam01', 'cam02', 'cam03', 'cam04'];
  const entries = [];
  for (const cam of cams) {
    for (const date of DATES) {
      entries.push({ key: `cam:feed:${cam}:${date}:status`,   value: 'online' });
      entries.push({ key: `cam:feed:${cam}:${date}:incidents`, value: '0' });
    }
  }
  entries.push({ key: 'cam:feed:cam03:2026-03-15:incidents', value: '1 - motion detected near CETEC lab at 22:10' });
  return entries;
}

function tempNoise() {
  const entries = [];
  for (const date of DATES) {
    entries.push({ key: `temperature:cetec_lab:${date}`,    value: '22.5C avg' });
    entries.push({ key: `temperature:gym:${date}`,          value: '24.0C avg' });
    entries.push({ key: `cache:user:active_sessions:${date}`, value: Math.floor(Math.random() * 500).toString() });
  }
  return entries;
}

// ── PIPELINES (system:*) ─────────────────────────────────────────────
// Bridge narrativo a Qdrant: una de estas keys describe el flujo
// "testimonios → embeddings → Qdrant collection". Realista — DevOps
// documenta arquitectura en Redis para que servicios la lean en runtime.
const PIPELINE_CONFIG = [
  {
    key: 'system:pipelines:tip_intake',
    value: JSON.stringify({
      name: 'Campus Tip Line Ingestion',
      web_form: 'https://campus.itesm.mx/denuncia-anonima',
      flow: 'web_form -> Redis (evidence:tip:*) -> worker (hourly) -> Postgres fiscalia.tips',
      worker_status: 'SUSPENDED — investigación abierta CSI-2026-0315',
      suspended_since: '2026-03-16T00:00:00',
      owner: 'devops@itesm.mx'
    })
  },
  {
    key: 'system:pipelines:semantic_search',
    value: JSON.stringify({
      name: 'Semantic Testimony Indexing',
      description: 'Los testimonios marcados como relevantes se embeden con un modelo multilingual y se indexan en Qdrant para retrieval por similitud semántica',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      vector_size: 384,
      distance: 'Cosine',
      qdrant_host: 'qdrant:6333',
      qdrant_collection: 'witness_testimonies',
      owner: 'data-team@itesm.mx'
    })
  },
  {
    key: 'system:pipelines:gym_checkin',
    value: JSON.stringify({
      name: 'Gym Check-in Buffer',
      flow: 'tarjeta NFC -> Redis (gym:checkin:*) -> batch (5min) -> Postgres gym.access_log',
      retention_days: 90,
      owner: 'gym-ops@itesm.mx'
    })
  }
];

// ── TIPS (evidence:tip:*) ────────────────────────────────────────────
// 12 tips reales recibidos por la línea de denuncia en los últimos días.
// El worker que las movía a Postgres fue suspendido. Solo UNA es del caso
// del Dr. Aguilar — el alumno debe leerlas para identificarla.
const TIPS = [
  {
    key: 'evidence:tip:20260313_1042_anon',
    received: '2026-03-13T10:42:00',
    testimony:
      'En el estacionamiento norte hay tres autos que llevan dos semanas abandonados. Uno tiene los cristales rotos. Es un problema de seguridad e imagen para el campus.'
  },
  {
    key: 'evidence:tip:20260313_2018_anon',
    received: '2026-03-13T20:18:00',
    testimony:
      'Me robaron la bicicleta del biciestacionamiento del edificio CIA. La candadeé pero igual desapareció. Es la tercera vez en un mes que pasa.'
  },
  {
    key: 'evidence:tip:20260314_0823_anon',
    received: '2026-03-14T08:23:00',
    testimony:
      'Quiero reportar que la cafetería del CETEC sirvió pollo crudo el martes. Yo y dos compañeros nos enfermamos. Adjunto fotos del platillo. Necesitan revisar sanidad.'
  },
  {
    key: 'evidence:tip:20260314_1542_anon',
    received: '2026-03-14T15:42:00',
    testimony:
      'Hay un grupo de personas que usa el laboratorio del edificio CIA después de las 11pm sin permiso. Las luces se quedan prendidas y se escucha música. Tengo videos.'
  },
  {
    key: 'evidence:tip:20260315_0930_anon',
    received: '2026-03-15T09:30:00',
    testimony:
      'En el gimnasio Get Fit Now hay un entrenador que acosa verbalmente a las clientas. Le he visto hacer comentarios incómodos a dos personas distintas. RRHH lo sabe y no hacen nada.'
  },
  {
    key: 'evidence:tip:20260315_1745_anon',
    received: '2026-03-15T17:45:00',
    testimony:
      'Reporto que la máquina de café del edificio Aulas 2 lleva una semana descompuesta y nadie viene a arreglarla. Pago al mes una membresía cafetera por esto.'
  },
  {
    key: 'evidence:tip:20260316_0142_anon',
    received: '2026-03-16T01:42:00',
    testimony:
      'Vi a un grupo de jóvenes vandalizando los baños del Centro Estudiantil esta noche. Eran tres, llevaban sudaderas oscuras. Salieron corriendo hacia el estacionamiento sur.'
  },
  {
    key: 'evidence:tip:20260316_0300_anon',  // <-- PISTA DEL CASO (entre las demás, sin destacar visualmente)
    received: '2026-03-16T03:00:00',
    testimony:
      'Vi al entrenador entrar al laboratorio del CETEC esa noche con un cable y una mochila negra. Reconozco al entrenador del gimnasio Get Fit Now, lo he visto trabajar con los alumnos. Salió como a las 11:30 caminando rápido.'
  },
  {
    key: 'evidence:tip:20260316_0822_anon',
    received: '2026-03-16T08:22:00',
    testimony:
      'Llevamos meses pidiendo que arreglen el elevador del edificio CETEC. Se atasca por lo menos dos veces por semana. Es un riesgo para personas con discapacidad.'
  },
  {
    key: 'evidence:tip:20260316_1102_anon',
    received: '2026-03-16T11:02:00',
    testimony:
      'Hay un alumno en mi dormitorio que claramente consume sustancias dentro del campus. Lo huelo cada noche. No quiero dar mi nombre pero alguien tiene que checar el piso 3 del dorm B.'
  },
  {
    key: 'evidence:tip:20260316_1428_anon',
    received: '2026-03-16T14:28:00',
    testimony:
      'Una persona me viene siguiendo desde hace tres días entre la biblioteca y mi dorm. Es hombre, alto, llevaba gorra azul ayer. Me da miedo salir de noche.'
  },
  {
    key: 'evidence:tip:20260316_1907_anon',
    received: '2026-03-16T19:07:00',
    testimony:
      'En el salón 304 del edificio CIA hay grafiti nuevo desde el lunes. Mantenimiento no ha hecho nada. Adjunto fotos.'
  }
];

export async function seedRedis(log) {
  const redis = new Redis(process.env.REDIS_URL);
  log('redis: conectado');

  // Idempotencia: si ya existe la pipeline config, asumimos seed completo
  const exists = await redis.exists('system:pipelines:semantic_search');
  if (exists) {
    log('redis: ya poblado, skip');
    await redis.quit();
    return;
  }

  const noise = [...checkinNoise(), ...cameraNoise(), ...tempNoise()];
  const pipeline = redis.pipeline();
  for (const { key, value } of noise) pipeline.set(key, value);
  for (const cfg of PIPELINE_CONFIG) pipeline.set(cfg.key, cfg.value);
  for (const tip of TIPS) {
    pipeline.set(tip.key, JSON.stringify({
      type: 'anonymous_tip',
      source: 'campus_tip_line_web_form',
      received: tip.received,
      pending_move_to_fiscalia: true,
      testimony: tip.testimony
    }));
  }
  await pipeline.exec();

  log(`redis: ${noise.length} keys de noise + ${PIPELINE_CONFIG.length} system:pipelines + ${TIPS.length} evidence:tip:*`);
  await redis.quit();
  log('redis: OK');
}
