import { MongoClient } from 'mongodb';

// Coherencia narrativa:
// - social_posts: muestra que Sofía (Cancún) y David (oficina) tienen alibis sólidos
// - gym_members: catálogo oficial — la víctima 14782 tiene asignado al trainer 9001 (Carlos Méndez)
// - _evidence_archive: colección OCULTA (no listada en ninguna parte) que solo se descubre con
//   listCollections en mongo-express. Contiene el chat-log de la víctima donde acusa a su entrenador,
//   y la pista de qué key buscar en Redis (E3).

const SOCIAL_POSTS = [
  // Sofia Linares — alibi: estaba en Cancún
  { user: 'sofia_linares',   timestamp: '2026-03-15T18:00:00', location: 'Aeropuerto MTY',    caption: 'Por fin vacaciones! 🌴', photo_url: 'https://photos.example/sl1.jpg' },
  { user: 'sofia_linares',   timestamp: '2026-03-15T20:30:00', location: 'Hotel Riu Cancún',  caption: 'Llegamos al hotel #cancun #vacaciones', photo_url: 'https://photos.example/sl2.jpg' },
  { user: 'sofia_linares',   timestamp: '2026-03-15T22:45:00', location: 'Playa Delfines, Cancún', caption: 'Cena en la playa con las amigas 💕', photo_url: 'https://photos.example/sl3.jpg' },
  { user: 'sofia_linares',   timestamp: '2026-03-16T09:00:00', location: 'Hotel Riu Cancún',  caption: 'Buenos días desde el paraíso', photo_url: 'https://photos.example/sl4.jpg' },

  // David Hernandez — alibi: trabajando overtime en TI Solutions
  { user: 'david_hernandez', timestamp: '2026-03-15T19:00:00', location: 'TI Solutions, Centro Monterrey', caption: 'Otra noche de overtime 😩 release mañana', photo_url: null },
  { user: 'david_hernandez', timestamp: '2026-03-15T21:30:00', location: 'TI Solutions, Centro Monterrey', caption: 'Pizza del trabajo 🍕', photo_url: 'https://photos.example/dh1.jpg' },
  { user: 'david_hernandez', timestamp: '2026-03-15T23:50:00', location: 'TI Solutions, Centro Monterrey', caption: 'Deploy listo. Hora de casa.', photo_url: null },

  // Ruido de otros usuarios
  { user: 'mariana_cabrera', timestamp: '2026-03-15T20:00:00', location: 'Restaurante La Catarina', caption: 'Cena con la familia', photo_url: null },
  { user: 'felipe_aragon',   timestamp: '2026-03-15T21:00:00', location: 'Cinepolis Galerías', caption: 'Peli con la novia', photo_url: null },
  { user: 'oscar_mendez',    timestamp: '2026-03-15T22:00:00', location: 'Taxi - en ruta', caption: 'Otro turno largo', photo_url: null },
  { user: 'carlos_mendez',   timestamp: '2026-03-15T17:00:00', location: 'Get Fit Now',      caption: 'Última clase del día 💪', photo_url: null },
  { user: 'carlos_mendez',   timestamp: '2026-03-16T08:00:00', location: 'Get Fit Now',      caption: 'Buenos días, a entrenar', photo_url: null },
  { user: 'brenda_ochoa',    timestamp: '2026-03-15T19:45:00', location: 'Café Punta del Cielo', caption: 'Estudiando #vidadeprogramadora', photo_url: null },
  { user: 'jorge_tapia',     timestamp: '2026-03-15T22:15:00', location: 'Biblioteca ITESM', caption: 'Examen mañana', photo_url: null }
];

const GYM_MEMBERS = [
  { member_id: 14782, name: 'Ernesto Aguilar',  trainer_id: 9001, status: 'deceased',   join_date: '2024-01-15' },
  { member_id: 9001,  name: 'Carlos Méndez',    role: 'trainer',  status: 'active',     join_date: '2022-03-10', clients: [14782, 14745, 14790, 14820, 14760] },
  { member_id: 9050,  name: 'Roberto Silva',    role: 'trainer',  status: 'active',     join_date: '2023-08-01', clients: [14801, 14810] },
  { member_id: 14745, name: 'Paola Gutierrez',  trainer_id: 9001, status: 'active',     join_date: '2024-06-20' },
  { member_id: 14820, name: 'Jorge Tapia',      trainer_id: 9001, status: 'active',     join_date: '2025-01-05' },
  { member_id: 14790, name: 'Brenda Ochoa',     trainer_id: 9001, status: 'active',     join_date: '2024-11-12' },
  { member_id: 14760, name: 'Karen Beltrán',    trainer_id: 9001, status: 'active',     join_date: '2024-09-01' },
  { member_id: 14755, name: 'Daniela Núñez',    trainer_id: 9050, status: 'active',     join_date: '2024-04-08' },
  { member_id: 14801, name: 'Andrea Ríos',      trainer_id: 9050, status: 'active',     join_date: '2024-02-14' },
  { member_id: 14810, name: 'Lucía Domínguez',  trainer_id: 9050, status: 'active',     join_date: '2024-05-22' }
];

// Coleccion OCULTA — no se menciona en el dashboard ni en cheatsheets.
// Solo se encuentra haciendo "listCollections" o navegando en mongo-express.
// Es el corazón de la vulnerabilidad de E2.
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
    redis_key: 'evidence:hidden:trainer_log',
    content:
      'Para confirmar el caso contra el entrenador Carlos Méndez (gym_member_id 9001) revisa los logs de check-in del gimnasio en Redis. ' +
      'El testimonio anónimo que recibimos hoy quedó guardado FUERA del patrón gym:checkin:* en la clave exacta: evidence:hidden:trainer_log. ' +
      'Cópiala literal cuando hagas GET en Redis.'
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

  // Idempotencia por colección
  if ((await db.collection('social_posts').countDocuments()) === 0) {
    await db.collection('social_posts').insertMany(SOCIAL_POSTS);
    log(`mongo: ${SOCIAL_POSTS.length} social_posts insertados`);
  } else {
    log('mongo: social_posts ya poblada, skip');
  }

  if ((await db.collection('gym_members').countDocuments()) === 0) {
    await db.collection('gym_members').insertMany(GYM_MEMBERS);
    log(`mongo: ${GYM_MEMBERS.length} gym_members insertados`);
  } else {
    log('mongo: gym_members ya poblada, skip');
  }

  if ((await db.collection('_evidence_archive').countDocuments()) === 0) {
    await db.collection('_evidence_archive').insertMany(EVIDENCE_ARCHIVE);
    log(`mongo: ${EVIDENCE_ARCHIVE.length} docs en _evidence_archive (colección OCULTA)`);
  } else {
    log('mongo: _evidence_archive ya poblada, skip');
  }

  await client.close();
  log('mongo: OK');
}
