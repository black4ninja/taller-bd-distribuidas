import { MongoClient } from 'mongodb';

// Coherencia narrativa (corazón del caso, NO se debe modificar):
// - víctima: Ernesto Aguilar, member_id 14782, status: deceased, trainer_id 9001
// - asesino: Carlos Méndez, member_id 9001, trainer, su array clients contiene 14782
// - Sofía y David son sospechosos físicos con alibi en social_posts
// - Diana Castro (member_id 14730) es la tercera testigo

// Todo lo demás es ruido procedural y debe ser denso (~250 gym_members,
// ~150 social_posts) para que la única forma viable de encontrar al asesino
// sea ejecutando queries reales en MongoDB, no escaneando visualmente.

const FIRST = [
  'María','José','Juan','Ana','Pedro','Laura','Sofía','Miguel','Carmen','Roberto',
  'Lucía','Diego','Patricia','Javier','Elena','Andrés','Daniela','Fernando','Valentina','Ricardo',
  'Isabel','Alejandro','Camila','Pablo','Mónica','Sebastián','Adriana','Mauricio','Gabriela','Eduardo',
  'Verónica','Jorge','Beatriz','Hugo','Cecilia','Raúl','Silvia','César','Rosa','Brenda',
  'Felipe','Karen','Iván','Tomás','Paola','Andrea','Lucas','Mariana','Esteban','Sandra'
];
const LAST = [
  'González','Rodríguez','García','Hernández','Martínez','López','Pérez','Sánchez','Ramírez','Cruz',
  'Flores','Gómez','Reyes','Morales','Ortiz','Jiménez','Torres','Vázquez','Mendoza','Ruiz',
  'Álvarez','Castillo','Romero','Vargas','Salas','Rivera','Cabrera','Núñez','Silva','Tapia',
  'Mata','Robles','Rangel','Olivares','Coronado','Beltrán','Domínguez','Ochoa','Aragón','Fuentes',
  'Acosta','Espinoza','Cervantes','Delgado','Carrillo','Estrada','Soto','Valdez','Guerrero','Padilla'
];

function makePRNG(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rand = makePRNG(20260315);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- TRAINERS (30, IDs entre 8501–9420 — Carlos NO es el primero) ----------
// Cada uno con 5–14 clientes. Carlos Méndez (9001) está mezclado, no destacado.
const HAND_TRAINERS = [
  { member_id: 8501, name: 'Alma Garza',         role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2018-09-12' },
  { member_id: 8624, name: 'Beto Rojas',         role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2019-04-01' },
  { member_id: 8702, name: 'Carmen Villarreal',  role: 'trainer', status: 'inactive', gym: 'Get Fit Now', join_date: '2020-06-15' },
  { member_id: 8805, name: 'Damián Cortés',      role: 'trainer', status: 'active',   gym: 'Iron Studio', join_date: '2021-02-20' },
  { member_id: 8888, name: 'Elena Quiroz',       role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2020-08-08' },
  { member_id: 8920, name: 'Fabián Treviño',     role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2022-01-11' },
  { member_id: 8999, name: 'Gisela Morales',     role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2021-07-04' },
  { member_id: 9001, name: 'Carlos Méndez',      role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2022-03-10' },
  { member_id: 9050, name: 'Roberto Silva',      role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2023-08-01' },
  { member_id: 9077, name: 'Hector Vargas',      role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2021-11-04' },
  { member_id: 9120, name: 'Ricardo Aguilar Salas', role: 'trainer', status: 'active', gym: 'Get Fit Now', join_date: '2021-05-22' },
  { member_id: 9145, name: 'Sergio Domínguez',   role: 'trainer', status: 'deceased', gym: 'Get Fit Now', join_date: '2019-02-01', deceased_date: '2024-07-12', deceased_cause: 'paro cardíaco durante competencia' },
  { member_id: 9158, name: 'Manuel Estrada',     role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2024-01-15' },
  { member_id: 9172, name: 'Pablo Ruiz',         role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2022-09-08' },
  { member_id: 9190, name: 'Lucía Reyes',        role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2023-06-30' },
  { member_id: 9210, name: 'Tomás Acosta',       role: 'trainer', status: 'inactive', gym: 'Get Fit Now', join_date: '2020-04-17' },
  { member_id: 9223, name: 'Mariana Espinoza',   role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2023-12-01' },
  { member_id: 9241, name: 'Andrés Carrillo',    role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2022-07-22' },
  { member_id: 9268, name: 'Adriana Soto',       role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2024-02-14' },
  { member_id: 9285, name: 'Diego Padilla',      role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2021-10-09' },
  { member_id: 9301, name: 'Cecilia Fuentes',    role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2024-08-05' },
  { member_id: 9320, name: 'Hugo Valdez',        role: 'trainer', status: 'inactive', gym: 'Get Fit Now', join_date: '2020-11-30' },
  { member_id: 9355, name: 'Itzel Bautista',     role: 'trainer', status: 'active',   gym: 'Iron Studio', join_date: '2023-03-18' },
  { member_id: 9378, name: 'Joaquín Ramírez',    role: 'trainer', status: 'active',   gym: 'Get Fit Now', join_date: '2021-09-25' },
  { member_id: 9402, name: 'Karina Estévez',     role: 'trainer', status: 'active',   gym: 'BodyForge',   join_date: '2024-06-12' }
];

// ---------- HAND-CRAFTED MEMBERS (corazón del caso) ----------
// NOTA: trainer_id existe internamente para construir clients[] de los trainers,
// pero se STRIPEA antes de insertar — el alumno NO tiene un atajo directo desde
// el doc de la víctima al trainer. Debe hacer la query inversa con clients[].
const HAND_MEMBERS = [
  // VÍCTIMA — único Aguilar deceased en TODO el dataset
  { member_id: 14782, name: 'Ernesto Aguilar', trainer_id: 9001, status: 'deceased', gym: 'Get Fit Now', join_date: '2024-01-15', deceased_date: '2026-03-15', occupation: 'Investigador ITESM' },

  // Tercera testigo
  { member_id: 14730, name: 'Diana Castro', trainer_id: 9050, status: 'active', gym: 'Get Fit Now', join_date: '2024-03-01', occupation: 'Estudiante' },

  // Sospechosos físicos de E1 — son TAMBIÉN gym members con sus social handles
  { member_id: 14502, name: 'Sofía Linares',     trainer_id: 9268, status: 'cancelled', gym: 'BodyForge',   join_date: '2023-04-10', occupation: 'Estudiante Diseño' },
  { member_id: 14999, name: 'David Hernández',   trainer_id: 9355, status: 'active',    gym: 'Iron Studio', join_date: '2024-08-22', occupation: 'Ingeniero TI' },

  // Clientes activos de Carlos (incluyen a la víctima)
  { member_id: 14745, name: 'Paola Gutierrez',  trainer_id: 9001, status: 'active', gym: 'Get Fit Now', join_date: '2024-06-20', occupation: 'Diseñadora' },
  { member_id: 14820, name: 'Jorge Tapia',      trainer_id: 9001, status: 'active', gym: 'Get Fit Now', join_date: '2025-01-05', occupation: 'Estudiante' },
  { member_id: 14790, name: 'Brenda Ochoa',     trainer_id: 9001, status: 'active', gym: 'Get Fit Now', join_date: '2024-11-12', occupation: 'Programadora' },
  { member_id: 14760, name: 'Karen Beltrán',    trainer_id: 9001, status: 'active', gym: 'Get Fit Now', join_date: '2024-09-01', occupation: 'Maestra' },

  // Clientes activos de Roberto Silva (9050)
  { member_id: 14755, name: 'Daniela Núñez',    trainer_id: 9050, status: 'active', gym: 'Get Fit Now', join_date: '2024-04-08', occupation: 'Periodista' },
  { member_id: 14801, name: 'Andrea Ríos',      trainer_id: 9050, status: 'active', gym: 'Get Fit Now', join_date: '2024-02-14', occupation: 'Abogada' },
  { member_id: 14810, name: 'Lucía Domínguez',  trainer_id: 9050, status: 'active', gym: 'Get Fit Now', join_date: '2024-05-22', occupation: 'Enfermera' }
];

// ---------- NOISE: Aguilar adicionales (vivos) + deceased no-Aguilar ----------
const NOISE_HAND = [
  // Otros Aguilar (vivos) — ruido para queries por nombre
  { member_id: 14123, name: 'María Aguilar Pérez',     trainer_id: 9050, status: 'active',    gym: 'Get Fit Now', join_date: '2023-05-10', occupation: 'Contadora' },
  { member_id: 14456, name: 'Pedro Aguilar Vega',       trainer_id: 9077, status: 'cancelled', gym: 'BodyForge',   join_date: '2022-08-19', occupation: 'Ingeniero' },
  { member_id: 14988, name: 'Isabel Aguilar',           trainer_id: 9190, status: 'active',    gym: 'Get Fit Now', join_date: '2025-02-03', occupation: 'Veterinaria' },

  // Deceased no-Aguilar — ruido para queries por status
  { member_id: 14501, name: 'José Pérez Ortiz',         trainer_id: 9050, status: 'deceased', gym: 'Get Fit Now', join_date: '2021-03-18', deceased_date: '2024-12-02', deceased_cause: 'accidente vehicular' },
  { member_id: 14622, name: 'Carmen López',             trainer_id: 9077, status: 'deceased', gym: 'BodyForge',    join_date: '2020-07-04', deceased_date: '2024-09-15', deceased_cause: 'enfermedad prolongada' },
  { member_id: 14888, name: 'Raúl Méndez Salazar',      trainer_id: 9001, status: 'deceased', gym: 'Get Fit Now', join_date: '2022-11-11', deceased_date: '2025-04-08', deceased_cause: 'causas naturales' },
  { member_id: 14905, name: 'Sofía Ramírez Vega',       trainer_id: 9050, status: 'deceased', gym: 'Get Fit Now', join_date: '2023-01-25', deceased_date: '2025-11-30', deceased_cause: 'paro cardíaco' },
  { member_id: 14066, name: 'Mauricio Vázquez',          trainer_id: 9077, status: 'deceased', gym: 'BodyForge',   join_date: '2021-10-09', deceased_date: '2024-03-21', deceased_cause: 'accidente deportivo' },
  { member_id: 14199, name: 'Patricia Cruz Domínguez',   trainer_id: 9190, status: 'deceased', gym: 'Get Fit Now', join_date: '2022-06-15', deceased_date: '2025-08-17', deceased_cause: 'enfermedad' }
];

// ---------- PROCEDURAL NOISE (200+ miembros random) ----------
function generateProceduralMembers() {
  const out = [];
  const usedIds = new Set([
    ...HAND_TRAINERS.map(t => t.member_id),
    ...HAND_MEMBERS.map(m => m.member_id),
    ...NOISE_HAND.map(m => m.member_id)
  ]);
  const trainerIds = HAND_TRAINERS.filter(t => t.status === 'active' || t.status === 'inactive').map(t => t.member_id);
  const gyms = ['Get Fit Now', 'BodyForge', 'Iron Studio', 'Fitness Pro'];
  const statuses = ['active','active','active','active','active','active','cancelled','inactive']; // 75% active
  const occupations = ['Estudiante','Profesionista','Comerciante','Ingeniero','Empleado','Médico','Maestro','Diseñador','Programador','Contador','Abogado','Vendedor'];

  let nextId = 14001;
  while (out.length < 220) {
    if (usedIds.has(nextId)) { nextId++; continue; }
    usedIds.add(nextId);
    const first = pick(FIRST);
    const last1 = pick(LAST);
    const last2 = pick(LAST);
    const name = `${first} ${last1} ${last2}`;
    const trainer_id = trainerIds[Math.floor(rand() * trainerIds.length)];
    const status = pick(statuses);
    const year = 2020 + Math.floor(rand() * 6);
    const mo = String(1 + Math.floor(rand() * 12)).padStart(2,'0');
    const dy = String(1 + Math.floor(rand() * 28)).padStart(2,'0');
    const doc = {
      member_id: nextId,
      name,
      trainer_id,
      status,
      gym: pick(gyms),
      join_date: `${year}-${mo}-${dy}`,
      occupation: pick(occupations)
    };
    if (status === 'deceased') {
      // Improbable random deceased — pero hay algunos para hacer ruido
      doc.status = 'active'; // Forzamos a active, los deceased son curados
    }
    out.push(doc);
    nextId++;
  }
  return out;
}

// ---------- TRAINERS con sus arrays de clients (calculados desde members) ----------
function buildTrainersWithClients(allMembers) {
  return HAND_TRAINERS.map(t => {
    const clients = allMembers
      .filter(m => m.trainer_id === t.member_id)
      .map(m => m.member_id);
    return { ...t, clients };
  });
}

// ---------- SOCIAL POSTS ----------
// CADA POST TIENE user_id (vincula a gym_members.member_id) + user (handle no-predecible).
// El handle NO se puede adivinar del nombre — el alumno DEBE consultar social_posts
// para descubrirlo. Esta es la pista cross-collection de E2.
const HAND_POSTS = [
  // Sofía Linares — alibi: Cancún (user_id 14502, handle "sl_traveler")
  { user_id: 14502, user: 'sl_traveler',  timestamp: '2026-03-15T18:00:00', location: 'Aeropuerto MTY',    caption: 'Por fin vacaciones! 🌴', photo_url: 'https://photos.example/sl1.jpg' },
  { user_id: 14502, user: 'sl_traveler',  timestamp: '2026-03-15T20:30:00', location: 'Hotel Riu Cancún',  caption: 'Llegamos al hotel #cancun #vacaciones', photo_url: 'https://photos.example/sl2.jpg' },
  { user_id: 14502, user: 'sl_traveler',  timestamp: '2026-03-15T22:45:00', location: 'Playa Delfines, Cancún', caption: 'Cena en la playa con las amigas 💕', photo_url: 'https://photos.example/sl3.jpg' },
  { user_id: 14502, user: 'sl_traveler',  timestamp: '2026-03-16T09:00:00', location: 'Hotel Riu Cancún',  caption: 'Buenos días desde el paraíso', photo_url: 'https://photos.example/sl4.jpg' },

  // David Hernández — alibi: oficina (user_id 14999, handle "dhc_dev")
  { user_id: 14999, user: 'dhc_dev',      timestamp: '2026-03-15T19:00:00', location: 'TI Solutions, Centro Monterrey', caption: 'Otra noche de overtime 😩 release mañana', photo_url: null },
  { user_id: 14999, user: 'dhc_dev',      timestamp: '2026-03-15T21:30:00', location: 'TI Solutions, Centro Monterrey', caption: 'Pizza del trabajo 🍕', photo_url: 'https://photos.example/dh1.jpg' },
  { user_id: 14999, user: 'dhc_dev',      timestamp: '2026-03-15T23:50:00', location: 'TI Solutions, Centro Monterrey', caption: 'Deploy listo. Hora de casa.', photo_url: null },

  // Carlos Méndez (ASESINO) — user_id 9001, handle "pro_coach_mtz" — ESTA ES LA RESPUESTA DE E2
  { user_id: 9001,  user: 'pro_coach_mtz', timestamp: '2026-03-15T17:00:00', location: 'Get Fit Now',       caption: 'Última clase del día 💪', photo_url: null },
  { user_id: 9001,  user: 'pro_coach_mtz', timestamp: '2026-03-16T08:00:00', location: 'Get Fit Now',       caption: 'Buenos días, a entrenar', photo_url: null },
  { user_id: 9001,  user: 'pro_coach_mtz', timestamp: '2026-03-13T17:30:00', location: 'Get Fit Now',       caption: 'Lunes de pesas 🔥', photo_url: null },

  // Diana Castro (testigo 3) — user_id 14730, handle "dianax_fit"
  { user_id: 14730, user: 'dianax_fit',   timestamp: '2026-03-15T19:30:00', location: 'Get Fit Now',       caption: 'Última clase con mi grupo 💕', photo_url: null },

  // Ruido curado (otros members)
  { user_id: 14745, user: 'paolacreativa', timestamp: '2026-03-15T20:00:00', location: 'Restaurante La Catarina', caption: 'Cena con amigas', photo_url: null },
  { user_id: 14790, user: 'brenda_codes', timestamp: '2026-03-15T19:45:00', location: 'Café Punta del Cielo', caption: 'Estudiando #vidadeprogramadora', photo_url: null },
  { user_id: 14820, user: 'tapiajorge',   timestamp: '2026-03-15T22:15:00', location: 'Biblioteca ITESM',  caption: 'Examen mañana', photo_url: null }
];

function generateProceduralPosts(allMembers) {
  const captions = [
    'Buen día!','Cenando con amigos','Tarea de la uni 📚','Cafecito ☕','Día de gym 💪','Domingo en familia',
    'Por fin viernes 🎉','Otro día más','Que rico está el clima','Insomnio','Trabajando duro','Estudiando para finales',
    'Concierto épico 🎸','Película en casa 🍿','Domingo de futbol','Cita médica 🤒','Carrera matutina 🏃','Compras 🛒',
    'Viendo serie','Día de spa','En el aeropuerto ✈️','Boda de mi primo','Visita al abuelo','Estoy molida'
  ];
  const locations = [
    'Casa','Oficina','Café Punta del Cielo','Galerías Monterrey','Plaza Fiesta','Restaurante El Rey',
    'Parque Fundidora','Gimnasio Get Fit Now','Universidad ITESM','Centro Monterrey','Hospital Zambrano','Casa de mi mamá',
    'Cinépolis','Bar La Catarina','Estadio BBVA','Macroplaza','Iglesia del Roble','Mercado Juárez'
  ];
  // Generadores de handles NO-predecibles (no siguen patrón nombre_apellido)
  const handlePrefixes = ['fit','pro','run','iron','flex','spark','quick','blue','red','wild','calm','vibe','luna','solar','urban','ace','prime'];
  const handleSuffixes = ['mty','01','mx','rg','99','x','pro','vibe','life','fit','runs','dev','code','art','gtg'];

  const out = [];
  // Take 40 random member_ids from the existing pool to be "posters" — others stay silent.
  const posterPool = [];
  while (posterPool.length < 40) {
    const m = allMembers[Math.floor(rand() * allMembers.length)];
    if (!posterPool.find(p => p.member_id === m.member_id)) posterPool.push(m);
  }
  // Assign a handle to each poster
  const handleByMemberId = new Map();
  for (const p of posterPool) {
    const handle = `${pick(handlePrefixes)}_${pick(handleSuffixes)}${Math.floor(rand()*99)}`;
    handleByMemberId.set(p.member_id, handle);
  }

  for (let i = 0; i < 130; i++) {
    const p = posterPool[Math.floor(rand() * posterPool.length)];
    const day = 13 + Math.floor(rand() * 4);
    const hour = String(7 + Math.floor(rand() * 16)).padStart(2,'0');
    const min  = String(Math.floor(rand() * 60)).padStart(2,'0');
    out.push({
      user_id: p.member_id,
      user: handleByMemberId.get(p.member_id),
      timestamp: `2026-03-${String(day).padStart(2,'0')}T${hour}:${min}:00`,
      location: pick(locations),
      caption: pick(captions),
      photo_url: rand() > 0.5 ? `https://photos.example/p${i}.jpg` : null
    });
  }
  return out;
}

// ---------- EVIDENCE ARCHIVE (colección expuesta sin auth) ----------
const EVIDENCE_ARCHIVE = [
  {
    type: 'chat_log',
    source: 'recovered_from_victim_phone',
    date: '2026-03-14T23:12:00',
    participants: ['victim', 'unknown_friend'],
    content:
      'Ernesto: Carlos otra vez me amenazó hoy. Ya van 3 veces que me dice que si denuncio lo del equipo robado del gimnasio se "encarga personalmente" de mí. ' +
      'Le dije a Diana que si me pasa algo, ella sabe quién fue.'
  },
  {
    type: 'evidence_hint',
    classification: 'investigator_note',
    content:
      'La línea de denuncia anónima del campus recibió un testimonio sobre este caso. Las pistas entran al buffer de Redis ' +
      'bajo el prefijo evidence:* antes de moverse al sistema permanente de la Fiscalía. ' +
      'Como suspendimos el worker que las mueve al abrir la investigación (cadena de custodia), las pistas siguen en Redis. ' +
      'Listar las keys con KEYS evidence:* las recupera.'
  },
  {
    type: 'background_check',
    subject_member_id: 9001,
    content:
      'Carlos Méndez tiene 2 reportes internos previos por agresión verbal en el gimnasio Get Fit Now. RRHH no actuó. ' +
      'Acceso de tarjeta del campus ITESM activo desde 2025 (instructor invitado en programa de wellness).'
  }
];

export async function seedMongo(log) {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  log('mongo: conectado');

  const db = client.db('investigation');

  // gym_members con noise procedural
  let allMembersForPosts = [];
  if ((await db.collection('gym_members').countDocuments()) === 0) {
    const procedural = generateProceduralMembers();
    const allMembers = [...HAND_MEMBERS, ...NOISE_HAND, ...procedural];
    const trainersWithClients = buildTrainersWithClients(allMembers);

    // STRIP trainer_id de los member docs antes de insertar — fuerza al alumno
    // a usar el clients[] del trainer en lugar de leer el atajo directo.
    const membersStripped = allMembers.map(({ trainer_id, ...rest }) => rest);

    // Insertion order MIXED — trainers y members intercalados para que Carlos no
    // sea el primero al abrir la colección en mongo-express.
    const everyone = [...trainersWithClients, ...membersStripped];
    everyone.sort((a, b) => {
      // Pseudo-random shuffle estable basado en member_id
      return ((a.member_id * 2654435761) >>> 0) - ((b.member_id * 2654435761) >>> 0);
    });
    await db.collection('gym_members').insertMany(everyone);
    log(`mongo: ${everyone.length} gym_members insertados (${trainersWithClients.length} trainers + ${membersStripped.length} members, trainer_id stripped, shuffled)`);
    allMembersForPosts = everyone;
  } else {
    log('mongo: gym_members ya poblada, skip');
    allMembersForPosts = await db.collection('gym_members').find({}).toArray();
  }

  // social_posts con noise procedural
  if ((await db.collection('social_posts').countDocuments()) === 0) {
    const procedural = generateProceduralPosts(allMembersForPosts);
    const all = [...HAND_POSTS, ...procedural];
    await db.collection('social_posts').insertMany(all);
    log(`mongo: ${all.length} social_posts insertados (${HAND_POSTS.length} curados + ${procedural.length} ruido)`);
  } else {
    log('mongo: social_posts ya poblada, skip');
  }

  if ((await db.collection('_evidence_archive').countDocuments()) === 0) {
    await db.collection('_evidence_archive').insertMany(EVIDENCE_ARCHIVE);
    log(`mongo: ${EVIDENCE_ARCHIVE.length} docs en _evidence_archive`);
  } else {
    log('mongo: _evidence_archive ya poblada, skip');
  }

  await client.close();
  log('mongo: OK');
}
