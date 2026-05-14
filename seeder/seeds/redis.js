import Redis from 'ioredis';

// Redis del campus aloja DOS sistemas en la misma instancia:
//   1. Cache de check-ins del gimnasio (gym:*, cam:*, temperature:*) — uso clásico de cache
//   2. Buffer de la línea de denuncia anónima (evidence:*) — uso clásico de cola/buffer
//      donde un worker mueve las pistas al sistema permanente cada hora.
//
// Al abrirse la investigación se suspendió el worker (cadena de custodia), por eso
// la pista anónima sobre el caso sigue ahí. La narrativa cuadra: Redis sirve a
// ambos use-cases reales y la presencia del testimonio tiene justificación.

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

// Pista del buffer de la línea de denuncia anónima.
// Estructura corresponde a un mensaje que el worker movería a la base
// permanente de Fiscalía (incluyendo source y received timestamp).
const HIDDEN_EVIDENCE = {
  key: 'evidence:hidden:trainer_log',
  value: JSON.stringify({
    type: 'anonymous_tip',
    source: 'campus_tip_line_web_form',
    received: '2026-03-16T03:00:00',
    pending_move_to_fiscalia: true,
    note: 'Worker suspendido durante investigación abierta (cadena de custodia)',
    testimony:
      'Vi al entrenador entrar al laboratorio del CETEC esa noche con un cable y una mochila negra. ' +
      'Reconozco al entrenador del gimnasio Get Fit Now, lo he visto trabajar con los alumnos.',
    instructions_for_investigator:
      'Esta pista llegó por la línea de denuncia. Para encontrar el NOMBRE COMPLETO del asesino, busca testimonios semánticamente similares en la colección "witness_testimonies" de Qdrant. El testimonio con score más alto contiene el nombre completo.'
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
