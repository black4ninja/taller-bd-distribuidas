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
          'Porque cifra los datos en disco para que el atacante no pueda leerlos',
          'Porque sin un usuario en la base, ningún cliente puede pasar el AUTH cuando autorización esté habilitada',
          'Porque limita las conexiones por IP de origen'
        ],
        correct: 1
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
          'Porque ralentiza queries de atacantes hasta que se rinden',
          'Porque registra los accesos al audit log para investigación posterior',
          'Porque sin --auth, MongoDB aceptaba conexiones anónimas — aún con usuarios creados, las credenciales no se verifican'
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
          'Cifra la conexión con TLS para esos rangos',
          'Restringe el socket de Mongo a interfaces locales/privadas — el puerto deja de aceptar conexiones desde IPs públicas',
          'Limita el throughput a 10 MB/s por IP'
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
          'Porque consume RAM que necesita el motor principal',
          'Porque cifra el tráfico administrativo',
          'Porque mongo-express es una UI sin autenticación nativa — exponerla deja que cualquiera enumere y modifique la base con un browser'
        ],
        correct: 2
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
          'Acelera findOne porque omite checks de seguridad',
          'Cifra los datos sensibles automáticamente al leerse',
          'Si una credencial de aplicación se filtra, el atacante solo puede ejecutar las acciones de ese rol — no toda la base'
        ],
        correct: 2
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
          'Defense in depth: si alguien mal-configura bindIp a 0.0.0.0 por error, el firewall sigue cortando conexiones externas',
          'Reduce la latencia de queries al filtrar paquetes inválidos'
        ],
        correct: 1
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
          'Sniffing de red: sin TLS, credenciales y datos viajan en plaintext y un atacante en path los lee directo',
          'TLS comprime los datos para ahorrar ancho de banda',
          'TLS añade un segundo factor de autenticación al login'
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
          'Porque consume mucho disco y ralentiza el motor',
          'Porque solo detecta, no previene — pero sin él no sabes que te enumeraron hasta que ya pasó el daño',
          'Porque solo loggea cambios de schema, no queries'
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
          'Cifra los valores en memoria con AES por default',
          'Activa replicación a un nodo secundario',
          'El servidor acepta cualquier conexión TCP sin autenticar — quien llegue al puerto puede leer/escribir cualquier key'
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
          'Hace los comandos más rápidos al saltar el parser',
          'Porque incluso con AUTH válido, un atacante con credenciales (o una app comprometida) puede destruir todo con FLUSHALL — renombrar a "" deshabilita el comando',
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
          'Cifra los valores en disco con AES',
          'Limita el número de keys por base de datos',
          'Bloquea conexiones desde interfaces no-loopback si no hay bind explícito ni password — es el "default seguro" para evitar la catástrofe en localhost expuesto'
        ],
        correct: 2
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
          'Cifra automáticamente las conexiones locales con TLS',
          'Activa persistencia AOF a disco',
          'Restringe el socket de Redis a las interfaces de loopback (IPv4 e IPv6) — el puerto deja de aceptar conexiones de otras IPs'
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
          'Granularidad: cada usuario puede tener un set específico de comandos y patrones de keys permitidos — un servicio readonly no puede ejecutar FLUSHALL',
          'Acelera los GET porque cachea el resultado del último ACL check',
          'Reemplaza la necesidad de requirepass'
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
          'Reduce el RAM consumido por conexiones rechazadas',
          'Defense in depth: si alguien mal-configura bind a 0.0.0.0 o quita requirepass por accidente, el firewall sigue cortando paquetes externos',
          'Comprime el protocolo Redis a nivel de red'
        ],
        correct: 1
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
          'Hace los comandos más rápidos al usar binario en vez de RESP texto',
          'Sin TLS, el comando `AUTH <password>` viaja en plaintext en cada conexión — un sniffer en path captura el requirepass',
          'TLS habilita persistencia AOF cifrada'
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
          'Es solo detección — caro de mantener continuamente porque copia cada comando, pero ventanas cortas detectan enumeración con KEYS *',
          'Bloquea automáticamente las IPs sospechosas',
          'Cifra el log de comandos para auditoría legal'
        ],
        correct: 0
      }
    }
  ]
};

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
    catalog: DEFENSES[stationId].map(d => ({
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
