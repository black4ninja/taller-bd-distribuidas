import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { stmts } from './db.js';
import {
  effectiveNowMs, parseSqlTime, getPlayer, getCase, decrementCredibility
} from './game-state.js';
import { reseedMongo, reseedRedis } from './reseed.js';

export const ATTACK_STATIONS = ['E2', 'E3'];
export const PENDING_MIN_SECONDS = 60;   // ataque dispara al menos 60s tras abrir estación
export const PENDING_MAX_SECONDS = 180;  // ...y máximo a los 3 min
export const DEFENSE_WINDOW_SECONDS = 90; // ventana real (wall-clock) para responder al ataque
export const DEFENSE_THRESHOLD = 5;

const WEIGHT = { critical: 4, high: 2, medium: 1, low: 0.5 };

export const DEFENSES = {
  E2: [
    {
      id: 'auth_user',
      label: 'Crear usuario admin con contraseña fuerte',
      command: 'db.createUser({ user: "admin", pwd: "<strong-pass>", roles: ["root"] })',
      weight: 'critical',
      explanation: 'Crea el primer usuario autenticable. Sin un usuario, --auth no sirve. Combínalo con security.authorization.',
      quiz: {
        question: '¿Por qué crear un usuario es la base para bloquear el ataque actual?',
        options: [
          'Sin un usuario creado nadie puede pasar AUTH al activar authz',
          'Cifra los datos guardados en disco para que el atacante jamás los lea',
          'Limita las conexiones entrantes según su IP de origen'
        ],
        correct: 0
      }
    },
    {
      id: 'enable_authz',
      label: 'Activar autorización (security.authorization: enabled)',
      command: 'mongod --auth   # o en mongod.conf:\nsecurity:\n  authorization: enabled',
      weight: 'critical',
      explanation: 'Hace que MongoDB rechace conexiones sin credenciales. Sin esto, crear usuarios es decorativo: el bypass sigue activo.',
      quiz: {
        question: '¿Por qué activar `security.authorization: enabled` es lo que realmente cierra el bypass?',
        options: [
          'Ralentiza tanto las queries del atacante que termina por rendirse solo',
          'Registra los accesos en el audit log para investigar luego',
          'Sin authz Mongo acepta conexiones anónimas aunque haya usuarios'
        ],
        correct: 2
      }
    },
    {
      id: 'bind_ip',
      label: 'Restringir bindIp a localhost o red privada',
      command: 'net:\n  bindIp: 127.0.0.1,10.0.0.0/8',
      weight: 'high',
      explanation: 'Por default Mongo aceptaba conexiones en 0.0.0.0. Bindeo restringido bloquea atacantes externos a nivel de socket.',
      quiz: {
        question: '¿Qué hace exactamente `net.bindIp: 127.0.0.1,10.0.0.0/8`?',
        options: [
          'Cifra con TLS las conexiones que vengan de esos rangos de IP',
          'Ata el socket de Mongo a interfaces locales o de red privada',
          'Limita el throughput permitido a cada IP cliente a 10 MB por segundo'
        ],
        correct: 1
      }
    },
    {
      id: 'disable_express',
      label: 'Apagar mongo-express en producción',
      command: 'docker compose stop mongo-express',
      weight: 'high',
      explanation: 'mongo-express es UI de debugging. Expuesto sin auth en producción, un atacante enumera toda la base con un browser.',
      quiz: {
        question: '¿Por qué apagar mongo-express en producción es una defensa real?',
        options: [
          'Es una UI sin autenticación nativa: cualquiera enumera la base',
          'Libera la RAM que necesita el proceso principal de Mongo',
          'Cifra todo el tráfico administrativo entre el panel web y el motor'
        ],
        correct: 0
      }
    },
    {
      id: 'rbac',
      label: 'Crear roles con least privilege (RBAC)',
      command: 'db.createRole({ role: "investigator", privileges: [{ resource: {db:"investigation", collection:""}, actions:["find"] }] })',
      weight: 'medium',
      explanation: 'Usar root para todo es un anti-patrón. Roles granulares limitan el daño si una credencial se filtra (defense in depth).',
      quiz: {
        question: '¿Qué aporta RBAC con least privilege como capa adicional?',
        options: [
          'Acelera findOne porque se salta los checks de seguridad',
          'Si una credencial se filtra solo expone las acciones de su rol',
          'Cifra de forma automática los campos sensibles cada vez que se leen'
        ],
        correct: 1
      }
    },
    {
      id: 'firewall',
      label: 'Firewall: bloquear puerto 27017 público',
      command: 'iptables -A INPUT -p tcp --dport 27017 ! -s 10.0.0.0/8 -j DROP',
      weight: 'medium',
      explanation: 'Capa de red. Si bindIp se mal-configura, el firewall corta el acceso desde fuera de la red interna.',
      quiz: {
        question: '¿Por qué el firewall a nivel de SO es valioso aún si Mongo ya tiene bindIp?',
        options: [
          'Comprime el tráfico de Mongo para ahorrar ancho de banda',
          'Reduce la latencia de las queries filtrando antes los paquetes inválidos',
          'Si bindIp se mal-configura a 0.0.0.0, el firewall aún corta'
        ],
        correct: 2
      }
    },
    {
      id: 'tls',
      label: 'Habilitar TLS en conexiones',
      command: 'net.tls.mode: requireTLS\nnet.tls.certificateKeyFile: /etc/ssl/mongo.pem',
      weight: 'medium',
      explanation: 'Sin TLS, credenciales y datos viajan en plaintext. TLS cifra el canal y permite validación de hostname.',
      quiz: {
        question: '¿Qué ataque específico mitiga TLS en la conexión a Mongo?',
        options: [
          'Sniffing: sin TLS credenciales y datos viajan en plaintext',
          'Comprime los datos en tránsito para así ahorrar ancho de banda de red',
          'Agrega un segundo factor de autenticación al hacer login'
        ],
        correct: 0
      }
    },
    {
      id: 'audit',
      label: 'Activar auditLog para detectar enumeración',
      command: 'auditLog:\n  destination: file\n  path: /var/log/mongo/audit.json',
      weight: 'low',
      explanation: 'Detección, no prevención. Sin logs no sabes que te atacaron. Audit registra listCollections, find, schema changes, etc.',
      quiz: {
        question: '¿Por qué auditLog tiene poco peso (low) como defensa?',
        options: [
          'Consume demasiado disco y por eso termina ralentizando el motor entero',
          'Solo detecta, no previene: avisa cuando el daño ya ocurrió',
          'Solo registra cambios de schema, nunca las queries find'
        ],
        correct: 1
      }
    }
  ],
  E3: [
    {
      id: 'requirepass',
      label: 'Setear requirepass con contraseña fuerte',
      command: 'CONFIG SET requirepass "<long-random-string>"',
      weight: 'critical',
      explanation: 'Sin requirepass Redis acepta cualquier conexión. Una sola línea bloquea el ataque automatizado más común.',
      quiz: {
        question: '¿Qué pasa en Redis sin requirepass?',
        options: [
          'Cifra los valores en memoria con AES de forma automática',
          'Activa por defecto la replicación a un nodo secundario',
          'Acepta cualquier conexión TCP sin autenticar al cliente'
        ],
        correct: 2
      }
    },
    {
      id: 'rename_commands',
      label: 'Renombrar comandos peligrosos (FLUSHALL, KEYS, CONFIG)',
      command: 'rename-command FLUSHALL ""\nrename-command CONFIG ""\nrename-command KEYS ""',
      weight: 'critical',
      explanation: 'Incluso con auth, un atacante con credenciales puede destruir todo con FLUSHALL. Renombrar a "" deshabilita el comando.',
      quiz: {
        question: '¿Por qué renombrar FLUSHALL/CONFIG/KEYS a "" es crítico aún teniendo requirepass?',
        options: [
          'Hace que esos comandos sean más rápidos al saltarse el parser RESP',
          'Una app o credencial comprometida ya no puede destruir todo',
          'Comprime los argumentos del comando para ahorrar bandwidth'
        ],
        correct: 1
      }
    },
    {
      id: 'protected_mode',
      label: 'Activar protected-mode yes',
      command: 'protected-mode yes',
      weight: 'high',
      explanation: 'En versiones modernas, protected-mode bloquea conexiones externas si no hay bind ni password. Default seguro.',
      quiz: {
        question: '¿Qué hace `protected-mode yes` en Redis 7+?',
        options: [
          'Bloquea conexiones no-loopback si no hay bind ni password',
          'Cifra los valores persistidos en disco usando AES-256',
          'Limita el número máximo de keys permitidas por cada base de datos'
        ],
        correct: 0
      }
    },
    {
      id: 'bind_ip',
      label: 'Bind a localhost o red privada',
      command: 'bind 127.0.0.1 ::1',
      weight: 'high',
      explanation: 'Por default Redis aceptaba conexiones de cualquier IP. bind restringe a interfaces específicas.',
      quiz: {
        question: '¿Qué hace `bind 127.0.0.1 ::1`?',
        options: [
          'Cifra automáticamente con TLS las conexiones locales',
          'Activa la persistencia AOF escribiendo a disco cada op',
          'Ata el socket de Redis solo a las interfaces loopback'
        ],
        correct: 2
      }
    },
    {
      id: 'acl',
      label: 'Crear ACL users con least privilege (Redis 6+)',
      command: 'ACL SETUSER reader on >pass ~evidence:* +@read +@connection',
      weight: 'medium',
      explanation: 'Granularidad por comando + por key pattern. Un servicio que solo lee evidence:* no debería poder FLUSHALL.',
      quiz: {
        question: '¿Qué aporta ACL sobre solo tener requirepass?',
        options: [
          'Cada usuario tiene comandos y patrones de key acotados',
          'Acelera los GET cacheando el último chequeo de ACL hecho',
          'Hace innecesario seguir configurando un requirepass'
        ],
        correct: 0
      }
    },
    {
      id: 'firewall',
      label: 'Firewall: bloquear puerto 6379 al exterior',
      command: 'iptables -A INPUT -p tcp --dport 6379 ! -s 10.0.0.0/8 -j DROP',
      weight: 'medium',
      explanation: 'Capa de red. Si bind/auth se mal-configuran, el firewall corta el ataque externo.',
      quiz: {
        question: '¿Por qué el firewall es valioso aún si Redis ya tiene bind + requirepass?',
        options: [
          'Reduce la cantidad de RAM que consumen las conexiones rechazadas',
          'Comprime el protocolo Redis a nivel de capa de red',
          'Si bind o requirepass se rompen, aún corta lo externo'
        ],
        correct: 2
      }
    },
    {
      id: 'tls',
      label: 'Activar TLS (tls-port 6380)',
      command: 'tls-port 6380\nport 0\ntls-cert-file /etc/ssl/redis.crt',
      weight: 'medium',
      explanation: 'Sin TLS, requirepass viaja en plaintext en cada AUTH. TLS cifra el canal completo.',
      quiz: {
        question: '¿Qué problema específico resuelve TLS en Redis?',
        options: [
          'Hace que los comandos sean más rápidos al usar binario y no texto',
          'Sin TLS el AUTH viaja en plaintext y un sniffer lo captura',
          'Habilita la persistencia AOF cifrada automáticamente'
        ],
        correct: 1
      }
    },
    {
      id: 'audit',
      label: 'Auditar comandos peligrosos con MONITOR (sesión limitada)',
      command: 'MONITOR  # en sesión separada, archivar a SIEM',
      weight: 'low',
      explanation: 'Detección. MONITOR es caro (no usar continuamente) pero ventanas detectan enumeración con KEYS *.',
      quiz: {
        question: '¿Por qué MONITOR tiene poco peso (low) como defensa?',
        options: [
          'Solo detecta y es caro porque copia cada comando entrante',
          'Bloquea de forma automática las IPs que le parezcan sospechosas',
          'Cifra el log de comandos para tener evidencia legal'
        ],
        correct: 0
      }
    }
  ]
};

// Baraja determinística: mismo seed → mismo orden. La usamos para que las
// cards de defensa salgan en orden distinto por jugador (el aprendizaje sea
// por contenido, no por memorizar "la 1ª y la 2ª"), pero ESTABLE durante todo
// el ataque (seed incluye scheduled_at) para que no salten en cada poll.
function seededShuffle(arr, seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let s = h || 1;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function attackKey(stationId) { return stationId.toLowerCase(); } // 'e2' | 'e3'

function getRawState(playerId, stationId) {
  const player = getPlayer(playerId);
  if (!player) return null;
  const k = attackKey(stationId);
  return {
    state: player[`attack_${k}_state`],
    scheduled_at: player[`attack_${k}_scheduled_at`],
    activated_at: player[`attack_${k}_activated_at`],
    defenses_json: player[`attack_${k}_defenses`],
    quiz_failed_json: player[`attack_${k}_quiz_failed`],
    resolved_at: player[`attack_${k}_resolved_at`]
  };
}

export function defenseWeight(stationId, defenseId) {
  const def = DEFENSES[stationId]?.find(d => d.id === defenseId);
  return def ? WEIGHT[def.weight] : 0;
}

export function scoreDefenses(stationId, defenseIds) {
  return defenseIds.reduce((acc, id) => acc + defenseWeight(stationId, id), 0);
}

// Schedule attack si no hay state previo. Idempotente.
export function scheduleAttack(playerId, stationId) {
  if (!ATTACK_STATIONS.includes(stationId)) return null;
  const raw = getRawState(playerId, stationId);
  if (raw?.state) return raw;
  const delayMs = (PENDING_MIN_SECONDS + Math.random() * (PENDING_MAX_SECONDS - PENDING_MIN_SECONDS)) * 1000;
  const scheduledAt = new Date(effectiveNowMs(playerId) + delayMs).toISOString();
  stmts[`scheduleAttack_${stationId}`].run(scheduledAt, playerId);
  return { state: 'pending', scheduled_at: scheduledAt };
}

// Transición pending → active. force=true ignora el reloj (DEV trigger).
function maybeActivate(playerId, stationId, force = false) {
  const raw = getRawState(playerId, stationId);
  if (!raw || raw.state !== 'pending') return raw;
  const now = effectiveNowMs(playerId);
  const sched = raw.scheduled_at ? parseSqlTime(raw.scheduled_at) : null;
  if (!force && (!sched || now < sched)) return raw;
  const activatedAt = new Date().toISOString(); // wall-clock — la ventana de 90s es real
  stmts[`activateAttack_${stationId}`].run(activatedAt, playerId);
  return { ...raw, state: 'active', activated_at: activatedAt };
}

async function executeAttack(playerId, stationId) {
  try {
    if (stationId === 'E2') {
      const c = new MongoClient(process.env.MONGO_URL);
      await c.connect();
      try {
        const db = c.db('investigation');
        await Promise.all([
          db.collection('gym_members').drop().catch(() => {}),
          db.collection('social_posts').drop().catch(() => {}),
          db.collection('_evidence_archive').drop().catch(() => {})
        ]);
      } finally { await c.close(); }
    } else if (stationId === 'E3') {
      const r = new Redis(process.env.REDIS_URL);
      try {
        // Borrar el buffer forense (evidence:*) + documentación de pipelines (system:pipelines:*)
        // Mantenemos gym:* / cam:* para no romper el resto de la narrativa post-restore.
        const evid = await r.keys('evidence:*');
        const sys  = await r.keys('system:pipelines:*');
        if (evid.length) await r.del(...evid);
        if (sys.length)  await r.del(...sys);
      } finally { await r.quit(); }
    }
  } catch (err) {
    console.error(`[attack:${stationId}] execute error`, err);
  }
  stmts[`resolveAttack_${stationId}`].run('failed', new Date().toISOString(), playerId);
}

// Devuelve estado completo para el polling del cliente.
// async porque puede gatillar executeAttack si el tiempo expiró.
export async function getAttackStatus(playerId, stationId) {
  if (!ATTACK_STATIONS.includes(stationId)) return { state: null };

  let raw = maybeActivate(playerId, stationId);
  if (!raw || !raw.state) return { state: null };

  let defenses = [];
  let quizFailed = [];
  try { defenses = JSON.parse(raw.defenses_json || '[]'); } catch {}
  try { quizFailed = JSON.parse(raw.quiz_failed_json || '[]'); } catch {}
  const score = scoreDefenses(stationId, defenses);

  // Si está activo y se acabó el tiempo sin alcanzar threshold → ejecutar ataque
  if (raw.state === 'active') {
    const elapsed = Math.floor((Date.now() - parseSqlTime(raw.activated_at)) / 1000);
    if (elapsed >= DEFENSE_WINDOW_SECONDS && score < DEFENSE_THRESHOLD) {
      await executeAttack(playerId, stationId);
      raw = getRawState(playerId, stationId);
    }
  }

  const result = {
    state: raw.state,
    defenses,
    quiz_failed: quizFailed,
    score,
    threshold: DEFENSE_THRESHOLD,
    // Orden barajado por jugador+estación+ataque (estable durante el ataque).
    catalog: seededShuffle(
      DEFENSES[stationId],
      `${playerId}:${stationId}:${raw.scheduled_at || 'noseed'}`
    ).map(d => ({
      id: d.id, label: d.label, command: d.command, weight: d.weight, points: WEIGHT[d.weight], explanation: d.explanation,
      // Solo enviamos la pregunta y opciones — NUNCA el índice correcto.
      quiz: d.quiz ? { question: d.quiz.question, options: d.quiz.options } : null,
      quiz_locked: quizFailed.includes(d.id)
    }))
  };
  if (raw.state === 'pending') {
    const now = effectiveNowMs(playerId);
    const sched = parseSqlTime(raw.scheduled_at);
    result.pendingSecLeft = Math.max(0, Math.ceil((sched - now) / 1000));
  } else if (raw.state === 'active') {
    const elapsed = Math.floor((Date.now() - parseSqlTime(raw.activated_at)) / 1000);
    result.activeSecLeft = Math.max(0, DEFENSE_WINDOW_SECONDS - elapsed);
  }
  return result;
}

export async function applyDefense(playerId, stationId, defenseId, quizAnswer) {
  if (!ATTACK_STATIONS.includes(stationId)) return { ok: false, error: 'Estación inválida' };
  maybeActivate(playerId, stationId); // por si justo expiró el pending
  const raw = getRawState(playerId, stationId);
  if (!raw || raw.state !== 'active') {
    return { ok: false, error: 'No hay ataque activo' };
  }
  const def = DEFENSES[stationId].find(d => d.id === defenseId);
  if (!def) return { ok: false, error: 'Defensa desconocida' };

  let defenses = [];
  let quizFailed = [];
  try { defenses = JSON.parse(raw.defenses_json || '[]'); } catch {}
  try { quizFailed = JSON.parse(raw.quiz_failed_json || '[]'); } catch {}

  if (defenses.includes(defenseId)) {
    return { ok: true, state: 'active', score: scoreDefenses(stationId, defenses), defenses, already_applied: true };
  }
  if (quizFailed.includes(defenseId)) {
    return { ok: false, error: 'Defensa bloqueada: ya fallaste el quiz de esta defensa en este ataque', quiz_locked: true };
  }
  if (def.quiz) {
    if (typeof quizAnswer !== 'number' || quizAnswer < 0 || quizAnswer >= def.quiz.options.length) {
      return { ok: false, error: 'Selecciona una respuesta al quiz antes de aplicar la defensa', quiz_required: true };
    }
    if (quizAnswer !== def.quiz.correct) {
      // Quiz fallido → defensa queda bloqueada para este ataque
      quizFailed.push(defenseId);
      stmts[`setQuizFailed_${stationId}`].run(JSON.stringify(quizFailed), playerId);
      return {
        ok: false,
        quiz_wrong: true,
        correct: def.quiz.correct,
        correct_text: def.quiz.options[def.quiz.correct],
        error: 'Respuesta incorrecta. La defensa queda bloqueada para este ataque.',
        explanation: def.explanation
      };
    }
  }
  defenses.push(defenseId);
  stmts[`setDefenses_${stationId}`].run(JSON.stringify(defenses), playerId);
  const score = scoreDefenses(stationId, defenses);
  if (score >= DEFENSE_THRESHOLD) {
    stmts[`resolveAttack_${stationId}`].run('defended', new Date().toISOString(), playerId);
    return { ok: true, state: 'defended', score, defenses };
  }
  return { ok: true, state: 'active', score, defenses };
}

export async function devTriggerAttack(playerId, stationId) {
  if (!ATTACK_STATIONS.includes(stationId)) return { ok: false, error: 'Estación inválida' };
  const raw = getRawState(playerId, stationId);
  if (!raw?.state) scheduleAttack(playerId, stationId);
  const result = maybeActivate(playerId, stationId, true);
  if (!result || result.state !== 'active') return { ok: false, error: 'No se pudo activar' };
  return { ok: true, state: result.state };
}

export async function restoreFromBackup(playerId, stationId) {
  const raw = getRawState(playerId, stationId);
  if (raw?.state !== 'failed') return { ok: false, error: 'No hay breach que restaurar' };
  const caseObj = getCase(playerId);
  if (!caseObj) return { ok: false, error: 'Caso no inicializado' };
  if (stationId === 'E2') await reseedMongo(caseObj);
  else if (stationId === 'E3') await reseedRedis(caseObj);
  decrementCredibility(playerId);
  stmts[`resolveAttack_${stationId}`].run('restored', new Date().toISOString(), playerId);
  const updated = getPlayer(playerId);
  return { ok: true, state: 'restored', credibility: updated.credibility, game_over: !!updated.game_over };
}

// Reset (para /new-game)
export function resetAttacks(playerId) {
  stmts.resetAttack_E2.run(playerId);
  stmts.resetAttack_E3.run(playerId);
}
