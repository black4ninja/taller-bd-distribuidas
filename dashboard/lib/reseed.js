import pg from 'pg';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

const { Client } = pg;

// Singleton del modelo de embeddings (compartido con search.js si está activo)
let extractor = null;
async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  }
  return extractor;
}

// ───── POSTGRES ─────
async function reseedPostgres(c) {
  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  await client.connect();
  try {
    await client.query('TRUNCATE persons RESTART IDENTITY CASCADE; TRUNCATE crime_scene_report RESTART IDENTITY;');
    // 3 testigos
    const persons = [];
    persons.push({ name: c.witnesses[0].name, address: c.witnesses[0].address,                            gym_id: null,                          occupation: 'Profesor',  notes: 'Saca a pasear a su perro todas las noches' });
    persons.push({ name: c.witnesses[1].name, address: c.witnesses[1].address,                            gym_id: null,                          occupation: 'Doctora',   notes: 'Vecina del campus' });
    persons.push({ name: c.witnesses[2].name, address: 'Calle Junco de la Vega 87',                       gym_id: c.witnesses[2].gym_member_id,  occupation: 'Estudiante',notes: `Asiste al gimnasio ${c.gym}` });
    // 2 sospechosos físicos con notas que matcheen las descripciones de los testigos
    persons.push({ name: c.physical_suspects[0].name, address: 'Av. Universidad 100',                     gym_id: null,                          occupation: 'Estudiante',notes: `${c.physical_suspects[0].traits.hair}, ${c.physical_suspects[0].traits.extra}, estudiante` });
    persons.push({ name: c.physical_suspects[1].name, address: 'Calle Hidalgo 45',                        gym_id: null,                          occupation: 'Ingeniero', notes: `${c.physical_suspects[1].traits.hair}, ${c.physical_suspects[1].traits.extra}` });
    // Asesino (en el padrón de personas, también es member del gym)
    persons.push({ name: c.killer.name, address: c.killer.residence,                                      gym_id: c.killer.gym_member_id,        occupation: `Entrenador personal ${c.gym}`, notes: 'Entrenador con reportes internos de conducta agresiva' });
    // Víctima
    persons.push({ name: c.victim.name, address: 'Calle CETEC 50',                                        gym_id: c.victim.gym_member_id,        occupation: c.victim.occupation, notes: 'Víctima' });
    // Ruido (filler) — usa otros members
    for (const m of c.other_members.slice(0, 20)) {
      persons.push({ name: m.name, address: `Calle ${randStreet(m.matricula)} ${100 + (parseInt(m.matricula.slice(-2),10) || 0)}`, gym_id: m.gym_member_id, occupation: m.occupation, notes: null });
    }
    for (const p of persons) {
      await client.query(
        'INSERT INTO persons (name, address, gym_member_id, occupation, notes) VALUES ($1, $2, $3, $4, $5)',
        [p.name, p.address, p.gym_id, p.occupation, p.notes]
      );
    }
    // crime_scene_report parametrizado
    await client.query(
      `INSERT INTO crime_scene_report (date, city, type, description) VALUES ($1, $2, $3, $4)`,
      [
        c.date,
        'Monterrey',
        'homicide',
        `Cuerpo encontrado en el ${c.location} del ITESM Campus Monterrey a las 23:45 del 15 de marzo de 2026. Causa de muerte: asfixia con un ${c.weapon}. ` +
        'Se identificaron tres testigos durante el levantamiento: ' +
        `(1) El primer testigo vive en la primera casa de Calle Tecnológico (Col. Tecnológico). ` +
        `(2) La segunda testigo reside en Av. Eugenio Garza Sada 2300. ` +
        `(3) La tercera testigo es miembro #${c.witnesses[2].gym_member_id} del gimnasio "${c.gym}". ` +
        'Recolectar entrevistas de los tres y cruzar nombres con sus descripciones físicas.'
      ]
    );
    // Interviews — narrativa neutral en género
    const interviews = [
      { name: c.witnesses[0].name, transcript: `Salí a pasear a mi perro a eso de las 11 de la noche el 15 de marzo. Vi salir corriendo del ${c.location} a alguien con ${c.physical_suspects[0].traits.hair} y ${c.physical_suspects[0].traits.extra}. Parecía alumno del campus.` },
      { name: c.witnesses[1].name, transcript: `El 15 de marzo, alrededor de las 10:30 de la noche, escuché una discusión fuerte en el estacionamiento. Vi a una persona con ${c.physical_suspects[1].traits.hair}, ${c.physical_suspects[1].traits.extra}, peleando con alguien más a quien no alcancé a ver.` },
      { name: c.witnesses[2].name, transcript: `Conocía a la víctima del gimnasio ${c.gym}. ${c.nicknames.victim_short} era cliente regular ahí. Esa noche, antes del crimen, vi a su entrenador personal muy alterado al terminar la última clase, lo escuché decir "yo voy a arreglar esto esta noche". Nunca lo había visto así.` }
    ];
    for (const i of interviews) {
      await client.query(
        `INSERT INTO interviews (person_id, transcript) SELECT id, $1 FROM persons WHERE name = $2`,
        [i.transcript, i.name]
      );
    }
  } finally {
    await client.end();
  }
}
function randStreet(matricula) {
  const streets = ['Hidalgo', 'Juárez', 'Madero', 'Allende', 'Zaragoza', 'Galeana', 'Independencia', '5 de Mayo'];
  return streets[parseInt(matricula.slice(-1), 10) % streets.length];
}

// ───── MONGO ─────
async function reseedMongo(c) {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  try {
    const db = client.db('investigation');
    await Promise.all([
      db.collection('gym_members').drop().catch(() => {}),
      db.collection('social_posts').drop().catch(() => {}),
      db.collection('_evidence_archive').drop().catch(() => {})
    ]);

    // gym_members: trainers (decoys + asesino) + members + víctima
    const trainers = [
      { member_id: c.killer.gym_member_id, name: c.killer.name, role: 'trainer', status: 'active', gym: c.gym, join_date: c.killer.join_date, clients: [c.victim.gym_member_id, ...c.other_members.slice(0, 4).map(m => m.gym_member_id)] }
    ];
    for (const t of c.decoy_trainers) {
      const clients = c.other_members.slice(5).filter((_, i) => i % 5 === parseInt(t.matricula.slice(-1), 10) % 5).slice(0, 3).map(m => m.gym_member_id);
      trainers.push({ member_id: t.gym_member_id, name: t.name, role: 'trainer', status: 'active', gym: t.gym, join_date: '2023-01-01', clients });
    }
    // Members (con la víctima)
    const members = [
      { member_id: c.victim.gym_member_id, name: c.victim.name, status: 'deceased', gym: c.gym, join_date: '2024-01-15', deceased_date: c.date, occupation: c.victim.occupation },
      { member_id: c.witnesses[2].gym_member_id, name: c.witnesses[2].name, status: 'active', gym: c.gym, join_date: '2024-03-01', occupation: 'Estudiante' }
    ];
    for (const m of c.other_members) {
      members.push({ member_id: m.gym_member_id, name: m.name, status: 'active', gym: c.gym, join_date: '2024-06-20', occupation: m.occupation });
    }
    await db.collection('gym_members').insertMany([...trainers, ...members]);

    // social_posts — alibis de los sospechosos físicos + post del asesino + ruido
    const posts = [];
    // Sospechosa F (alibi: Cancún)
    const handleF = `sl_${c.physical_suspects[0].matricula.slice(-4)}`;
    posts.push({ user_id: 0, user: handleF, timestamp: `${c.date}T18:00:00`, location: 'Aeropuerto MTY',    caption: 'Por fin vacaciones! 🌴' });
    posts.push({ user_id: 0, user: handleF, timestamp: `${c.date}T20:30:00`, location: 'Hotel Riu Cancún',  caption: 'Llegamos al hotel #cancun' });
    posts.push({ user_id: 0, user: handleF, timestamp: `${c.date}T22:45:00`, location: 'Playa Delfines, Cancún', caption: 'Cena en la playa 💕' });
    // Sospechoso M (alibi: oficina)
    const handleM = `dhc_${c.physical_suspects[1].matricula.slice(-4)}`;
    posts.push({ user_id: 1, user: handleM, timestamp: `${c.date}T19:00:00`, location: 'TI Solutions, Centro Monterrey', caption: 'Otra noche de overtime' });
    posts.push({ user_id: 1, user: handleM, timestamp: `${c.date}T23:50:00`, location: 'TI Solutions, Centro Monterrey', caption: 'Deploy listo' });
    // Asesino (3 posts)
    posts.push({ user_id: c.killer.gym_member_id, user: c.killer.handle, timestamp: `${c.date}T17:00:00`, location: c.gym, caption: 'Última clase del día 💪' });
    posts.push({ user_id: c.killer.gym_member_id, user: c.killer.handle, timestamp: `${c.date}T17:30:00`, location: c.gym, caption: 'Lunes de pesas 🔥' });
    posts.push({ user_id: c.killer.gym_member_id, user: c.killer.handle, timestamp: '2026-03-16T08:00:00', location: c.gym, caption: 'Buenos días' });
    // Ruido — otros members con handles random
    for (const m of c.other_members.slice(0, 12)) {
      posts.push({
        user_id: m.gym_member_id,
        user: `${m.matricula.slice(-3)}_user`,
        timestamp: `2026-03-${13 + Math.floor(Math.random()*4)}T${10 + Math.floor(Math.random()*12)}:00:00`,
        location: pickRandom(['Casa', 'Café Punta del Cielo', 'Galerías', 'Parque Fundidora', 'Cinépolis']),
        caption: pickRandom(['Buen día', 'Cenando', 'Tarea de la uni', 'Domingo en familia', 'Trabajando'])
      });
    }
    await db.collection('social_posts').insertMany(posts);

    // _evidence_archive (colección oculta)
    await db.collection('_evidence_archive').insertMany([
      {
        type: 'chat_log', source: 'recovered_from_victim_phone',
        date: '2026-03-14T23:12:00',
        participants: ['victim', 'unknown_friend'],
        content: `${c.nicknames.victim_short}: ${c.nicknames.killer_short} otra vez me amenazó hoy. Ya van varias veces que me dice que si denuncio se "encarga personalmente" de mí. ` +
                 `Le dije a ${c.witnesses[2].name.split(' ')[0]} que si me pasa algo, ella sabe quién fue.`
      },
      {
        type: 'evidence_hint', classification: 'investigator_note',
        content: `La línea de denuncia anónima del campus recibió varias pistas estos días. Todas entran al buffer de Redis bajo el prefijo evidence:tip:* antes de moverse al sistema permanente de la Fiscalía. Como suspendimos el worker que las mueve al abrir la investigación (cadena de custodia), las pistas siguen en Redis sin procesar. Hay que leerlas — la mayoría no es de este caso — para identificar la relevante. Adicionalmente, los pipelines del sistema están documentados bajo el prefijo system:pipelines:* — ahí ven cómo fluyen los datos entre componentes.`
      },
      {
        type: 'background_check', subject_member_id: c.killer.gym_member_id,
        content: `${c.killer.name} tiene ${c.killer.reports_count} reportes internos previos por agresión verbal en el gimnasio ${c.gym}. RRHH no actuó. Acceso de tarjeta del campus ITESM activo desde 2025 (instructor invitado en programa de wellness).`
      }
    ]);
  } finally {
    await client.close();
  }
}
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ───── REDIS ─────
async function reseedRedis(c) {
  const redis = new Redis(process.env.REDIS_URL);
  try {
    // Limpia keys del caso (mantén checkins genéricos del seeder)
    const tipKeys    = await redis.keys('evidence:*');
    const systemKeys = await redis.keys('system:pipelines:*');
    if (tipKeys.length)    await redis.del(...tipKeys);
    if (systemKeys.length) await redis.del(...systemKeys);

    // 12 tips: 11 ruido + 1 del caso
    const noiseTips = [
      'En el estacionamiento norte hay tres autos abandonados desde hace dos semanas.',
      'Me robaron la bicicleta del biciestacionamiento del edificio CIA.',
      'La cafetería sirvió pollo crudo el martes. Yo y dos compañeros nos enfermamos.',
      'Hay un grupo de personas usando el laboratorio CIA después de las 11pm sin permiso.',
      `En el gimnasio ${c.gym} un instructor acosa verbalmente a las clientas.`,
      'La máquina de café del edificio Aulas 2 lleva una semana descompuesta.',
      'Vi a un grupo de jóvenes vandalizando los baños del Centro Estudiantil.',
      'Llevamos meses pidiendo que arreglen el elevador del edificio CETEC.',
      'Hay un alumno que claramente consume sustancias dentro del campus.',
      'Una persona me viene siguiendo desde hace tres días entre la biblioteca y mi dorm.',
      'En el salón 304 del edificio CIA hay grafiti nuevo desde el lunes.'
    ];
    const realTip = `Vi al entrenador entrar al ${c.location} esa noche con un ${c.weapon} y una mochila negra. Reconozco al entrenador del gimnasio ${c.gym}, lo he visto trabajar con los alumnos. Salió como a las 11:30 caminando rápido.`;
    const allTips = [
      ...noiseTips.slice(0, 7),
      realTip,  // tip del caso entre el ruido
      ...noiseTips.slice(7)
    ];
    const pipeline = redis.pipeline();
    for (let i = 0; i < allTips.length; i++) {
      const day = 13 + Math.floor(i / 4);
      const hour = String(8 + (i * 3) % 12).padStart(2, '0');
      pipeline.set(`evidence:tip:2026031${day}_${hour}00_anon`, JSON.stringify({
        type: 'anonymous_tip',
        source: 'campus_tip_line_web_form',
        received: `2026-03-${day}T${hour}:00:00`,
        pending_move_to_fiscalia: true,
        testimony: allTips[i]
      }));
    }
    // system:pipelines:*
    pipeline.set('system:pipelines:tip_intake', JSON.stringify({
      name: 'Campus Tip Line Ingestion',
      flow: 'web_form -> Redis (evidence:tip:*) -> worker (hourly) -> Postgres fiscalia.tips',
      worker_status: `SUSPENDED — investigación abierta ${c.case_id}`,
      suspended_since: '2026-03-16T00:00:00'
    }));
    pipeline.set('system:pipelines:semantic_search', JSON.stringify({
      name: 'Semantic Testimony Indexing',
      description: 'Los testimonios marcados como relevantes se embeden y se indexan en Qdrant para retrieval por similitud',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      vector_size: 384,
      distance: 'Cosine',
      qdrant_host: 'qdrant:6333',
      qdrant_collection: 'witness_testimonies'
    }));
    pipeline.set('system:pipelines:gym_checkin', JSON.stringify({
      name: 'Gym Check-in Buffer',
      flow: `tarjeta NFC -> Redis (gym:checkin:*) -> batch (5min) -> Postgres ${c.gym.toLowerCase().replace(/\s/g,'_')}.access_log`
    }));
    await pipeline.exec();
  } finally {
    await redis.quit();
  }
}

// ───── QDRANT ─────
async function reseedQdrant(c) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL });
  const COLLECTION = 'witness_testimonies';
  try { await client.deleteCollection(COLLECTION); } catch {}
  await client.createCollection(COLLECTION, { vectors: { size: 384, distance: 'Cosine' } });
  try { await client.createPayloadIndex(COLLECTION, { field_name: 'category', field_schema: 'keyword' }); } catch {}

  const extract = await getExtractor();

  // Testimonios genéricos (witness_account, anonymous_tip, social_media_intel) — ninguno nombra
  const generic = [
    { id: 1,  text: `He visto al entrenador del gimnasio ${c.gym} entrar al ${c.location} del ITESM con una mochila negra grande en varias ocasiones. La última vez fue alrededor del 15 de marzo.`, category: 'witness_account' },
    { id: 2,  text: `Un entrenador del gimnasio ${c.gym} suele entrar al edificio del ITESM con bolsas grandes. Lleva una sudadera oscura. No sé su nombre.`, category: 'witness_account' },
    { id: 3,  text: `Vi a un hombre con uniforme de gimnasio cargando algo pesado cerca del ${c.location} una noche. Salió rápido, no le vi la cara.`, category: 'witness_account' },
    { id: 4,  text: `Hace tiempo escuché que un instructor del ${c.gym} amenazó a un cliente del gimnasio.`, category: 'witness_account' },
    { id: 5,  text: `El instructor que da las clases de las 7pm en ${c.gym} siempre se queda hasta tarde, después del cierre del gimnasio.`, category: 'witness_account' },
    { id: 6,  text: 'Algunos entrenadores del gimnasio tienen tarjetas de acceso al campus ITESM por el programa de wellness.', category: 'witness_account' },
    { id: 7,  text: 'Vi a un entrenador alterado en el estacionamiento del gimnasio el día del crimen, gritándole a alguien por teléfono.', category: 'witness_account' },
    { id: 8,  text: `Hubo una discusión fuerte entre un instructor y un cliente del gimnasio ${c.gym} la semana pasada.`, category: 'witness_account' },
    { id: 9,  text: `Las cámaras de seguridad del ${c.location} capturaron a una persona con uniforme deportivo entrando alrededor de las 22:15 esa noche.`, category: 'witness_account' },
    { id: 10, text: 'Un colega me comentó que la víctima estaba en pleito con uno de los instructores del gimnasio donde entrenaba.', category: 'witness_account' },
    { id: 200, text: `Análisis del usuario ${c.killer.handle} (vinculado a un entrenador del gimnasio ${c.gym}): publicaciones regulares desde el gimnasio. Sin actividad entre las 22:00 del 15-marzo y las 08:00 del 16-marzo. Ausencia notable.`, category: 'social_media_intel' },
    { id: 201, text: 'Análisis general OSINT: ningún usuario del gimnasio reportó actividad inusual la noche del crimen excepto la ausencia ya señalada.', category: 'social_media_intel' },
    { id: 300, text: `Pista anónima archivada: hay equipo del gimnasio ${c.gym} que desaparece sin reporte. Sospechan de un empleado interno.`, category: 'anonymous_tip' },
    { id: 301, text: 'Pista anónima: alguien menciona que un entrenador del campus tiene problemas con su cliente principal.', category: 'anonymous_tip' },
    { id: 400, text: 'Vi un auto rojo estacionado mal afuera del CETEC durante varios días.', category: 'witness_account' },
    { id: 401, text: 'Robaron mi bicicleta del estacionamiento del campus la semana pasada.', category: 'anonymous_tip' },
    { id: 402, text: 'El elevador del edificio CIA se atascó dos veces en marzo.', category: 'anonymous_tip' },
    { id: 405, text: 'Encontré una cartera en el pasillo del CETEC y la entregué a vigilancia.', category: 'witness_account' }
  ];

  // 1 background_check que nombra al asesino + 17 decoy background_checks
  const bgKiller = {
    id: 100,
    text: `Reporte sobre ${c.killer.name} (matrícula ${c.killer.matricula}), instructor del gimnasio ${c.gym} desde marzo de 2022. Fungió como entrenador personal asignado al ${c.victim.name} (matrícula ${c.victim.matricula}) durante los últimos dos años; el ${c.nicknames.victim_short} fue reportado deceased el 15 de marzo de 2026. En el expediente interno figuran ${c.killer.reports_count} quejas formales por agresión verbal a clientes presentadas durante 2024 y 2025, ambas archivadas sin escalamiento disciplinario. Cuenta con credencial activa de acceso al campus ITESM desde marzo de 2025 por convenio del programa de wellness. Residencia registrada: ${c.killer.residence}. Sin antecedentes penales.`,
    category: 'background_check'
  };
  const decoyBgs = c.decoy_trainers.slice(0, 17).map((t, i) => ({
    id: 101 + i,
    text: `Reporte sobre ${t.name} (matrícula ${t.matricula}), instructor del gimnasio ${t.gym} desde ${2018 + (i % 7)}. ${t.reports_count === 0 ? 'Expediente limpio, sin quejas formales.' : `En el expediente figuran ${t.reports_count} ${t.reports_count === 1 ? 'queja' : 'quejas'} por ${pickRandom(['impuntualidad','discusión con cliente','conducta inapropiada','retardo de pago'])}.`} ${t.has_campus_access ? 'Cuenta con credencial activa de acceso al campus ITESM.' : 'Sin acceso al campus.'}`,
    category: 'background_check'
  }));

  const all = [...generic, bgKiller, ...decoyBgs];
  const points = [];
  for (const t of all) {
    const out = await extract(t.text, { pooling: 'mean', normalize: true });
    points.push({ id: t.id, vector: Array.from(out.data), payload: { text: t.text, category: t.category } });
  }
  await client.upsert(COLLECTION, { wait: true, points });
}

// Export individual motor reseeds (para restore tras attack)
export { reseedMongo, reseedRedis };

// ───── orquestador ─────
export async function reseedAllMotors(caseObj, log = () => {}) {
  log('reseed: postgres...');  await reseedPostgres(caseObj);
  log('reseed: mongo...');      await reseedMongo(caseObj);
  log('reseed: redis...');      await reseedRedis(caseObj);
  log('reseed: qdrant...');     await reseedQdrant(caseObj);
  log('reseed: completo');
}
