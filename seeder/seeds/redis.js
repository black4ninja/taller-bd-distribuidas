import Redis from 'ioredis';

// E3 explota la vulnerabilidad de "Redis sin password + KEYS *":
// - ~80 keys de check-ins normales del gym (ruido obvio)
// - ~10 keys de cámaras y temperatura (más ruido)
// - 1 key "escondida" en el patrón `evidence:hidden:trainer_log` que contiene
//   el testimonio anónimo a buscar semánticamente en Qdrant (E4)
// La pista (`evidence:hidden:trainer_log`) viene desde la colección oculta de Mongo.

const TRAINERS = [9001, 9050, 9077];
const MEMBERS = [14782, 14745, 14820, 14790, 14760, 14755, 14801, 14810];
const DATES = ['2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16'];

function checkinNoise() {
  const entries = [];
  for (const trainer of TRAINERS) {
    for (const date of DATES) {
      // Los entrenadores fichan a las 06:00 - 22:00 normalmente
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
  // El 15 de marzo Carlos NO hizo check-out a las 22:00 (anomalía sutil para alumnos atentos)
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

// La key clave (E3) — referenciada por la colección oculta de Mongo
const HIDDEN_EVIDENCE = {
  key: 'evidence:hidden:trainer_log',
  value: JSON.stringify({
    type: 'anonymous_testimony',
    received: '2026-03-16T03:00:00',
    submitted_via: 'campus tip line',
    testimony:
      'Vi al entrenador entrar al laboratorio del CETEC esa noche con un cable y una mochila negra. ' +
      'Reconozco al entrenador del gimnasio Get Fit Now, lo he visto trabajar con los alumnos.',
    instructions_for_investigator:
      'Esta es una pista textual. Para encontrar el NOMBRE COMPLETO del asesino, busca testimonios semánticamente similares en la colección "witness_testimonies" de Qdrant. El testimonio con score más alto contiene el nombre completo.'
  })
};

export async function seedRedis(log) {
  const redis = new Redis(process.env.REDIS_URL);
  log('redis: conectado');

  // Idempotencia: si ya existe la key escondida, skip
  const exists = await redis.exists(HIDDEN_EVIDENCE.key);
  if (exists) {
    log('redis: ya poblado, skip');
    await redis.quit();
    return;
  }

  const noise = [...checkinNoise(), ...cameraNoise(), ...tempNoise()];
  const pipeline = redis.pipeline();
  for (const { key, value } of noise) {
    pipeline.set(key, value);
  }
  pipeline.set(HIDDEN_EVIDENCE.key, HIDDEN_EVIDENCE.value);
  await pipeline.exec();

  log(`redis: ${noise.length + 1} keys insertadas (1 escondida en patron 'evidence:*')`);
  await redis.quit();
  log('redis: OK');
}
