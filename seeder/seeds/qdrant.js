import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

// E4 — Hybrid search + reasoning detectivesco:
//
// El alumno DEBE iterar varias búsquedas con queries distintos. Pegar la frase
// de Redis no es suficiente:
//   - Top results (witness_account) describen la escena pero NO nombran a nadie.
//   - Hay ~18 background_checks con estructura similar (matrícula, gym, cliente,
//     antecedentes). Varios mencionan "Get Fit Now", varios "instructor con
//     reportes", varios "Carlos" (Vega, Treviño, Romero), varios "Aguilar"
//     (Ricardo, Pedro). NINGUNO contiene las palabras "CETEC" ni "mochila negra".
//   - Solo UNA background_check menciona "Dr. Ernesto Aguilar (14782, deceased)"
//     como cliente principal — esa es la del asesino, Carlos Méndez.
//
// El alumno tiene que reasonar: el asesino es el instructor de la víctima.
// La query semántica correcta para surfacearlo es algo como "instructor cuyo
// cliente principal era Dr. Ernesto Aguilar". El validator pide nombre completo
// (no acepta "Carlos" solo) — fuerza identificación específica entre múltiples
// Carlos y Aguilar.

const TESTIMONIES = [
  // ── witness_account (describen la escena, NUNCA nombran personas) ─────────
  {
    id: 1,
    text: 'He visto al entrenador del gimnasio Get Fit Now entrar al Laboratorio CETEC del ITESM con una mochila negra grande en varias ocasiones. La última vez fue alrededor del 15 de marzo.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-17'
  },
  {
    id: 2,
    text: 'Un entrenador del gimnasio Get Fit Now suele entrar al edificio del ITESM con bolsas grandes. Lleva una sudadera oscura. No sé su nombre.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-17'
  },
  {
    id: 3,
    text: 'Vi a un hombre con uniforme de gimnasio cargando algo pesado cerca del Laboratorio CETEC una noche. Salió rápido, no le vi la cara.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-16'
  },
  {
    id: 4,
    text: 'Hace tiempo escuché que un instructor del Get Fit Now amenazó a un cliente del gimnasio. No supe en qué terminó.',
    category: 'witness_account', source: 'interview', date: '2026-03-16'
  },
  {
    id: 5,
    text: 'El instructor que da las clases de las 7pm en Get Fit Now siempre se queda hasta tarde, después del cierre del gimnasio.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-17'
  },
  {
    id: 6,
    text: 'Algunos entrenadores del gimnasio tienen tarjetas de acceso al campus ITESM por el programa de wellness, lo cual a mí siempre me pareció riesgoso.',
    category: 'witness_account', source: 'interview', date: '2026-03-15'
  },
  {
    id: 7,
    text: 'Vi a un entrenador alterado en el estacionamiento del gimnasio el día del crimen, gritándole a alguien por teléfono.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-17'
  },
  {
    id: 8,
    text: 'Hubo una discusión fuerte entre un instructor y un cliente del gimnasio Get Fit Now la semana pasada. Casi llegan a los golpes.',
    category: 'witness_account', source: 'walk_in', date: '2026-03-16'
  },
  {
    id: 9,
    text: 'Las cámaras de seguridad del Laboratorio CETEC capturaron a una persona con uniforme deportivo entrando alrededor de las 22:15 esa noche.',
    category: 'witness_account', source: 'cctv_review', date: '2026-03-16'
  },
  {
    id: 10,
    text: 'Un colega me comentó que la víctima estaba en pleito con uno de los instructores del gimnasio donde entrenaba. No quiso dar más detalles.',
    category: 'witness_account', source: 'interview', date: '2026-03-16'
  },

  // ── background_check (estructura similar, solo UNO identifica al asesino) ─
  // El asesino: Carlos Méndez, 9001. Único cuya cliente principal es la víctima.
  {
    id: 100,
    text: 'Reporte de antecedentes — Carlos Méndez, matrícula 9001. Instructor del gimnasio Get Fit Now Monterrey. Cliente principal asignado: Dr. Ernesto Aguilar (14782, deceased). Historial: 2 reportes previos por agresión verbal a clientes. Acceso al campus ITESM activo desde 2025 por programa de wellness. Estado: activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  // Decoys con apellido Méndez o nombre Carlos — confunden búsquedas amplias
  {
    id: 101,
    text: 'Reporte de antecedentes — Carlos Vega Rodríguez, matrícula 8721. Instructor del gimnasio BodyForge. Sin clientes principales asignados. Sin reportes previos. Sin acceso al campus ITESM.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 102,
    text: 'Reporte de antecedentes — Carlos Treviño, matrícula 8830. Instructor del gimnasio Get Fit Now. Cliente principal: Pedro Ríos (14501). 1 reporte previo por impuntualidad. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 103,
    text: 'Reporte de antecedentes — Carlos Romero, matrícula 8950. Instructor del gimnasio Iron Studio. Sin clientes principales. Sin reportes. Sin acceso al campus.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 104,
    text: 'Reporte de antecedentes — Oscar Méndez, matrícula NA. Taxista local. No es instructor. Es hermano de Carlos Méndez (9001). Sin antecedentes penales.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  // Otros Aguilar — confunden búsquedas por apellido de la víctima
  {
    id: 105,
    text: 'Reporte de antecedentes — Ricardo Aguilar Salas, matrícula 9120. Instructor del gimnasio Get Fit Now. Sin clientes principales asignados. Sin reportes previos. Acceso al campus ITESM no aplica.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 106,
    text: 'Reporte de antecedentes — Pedro Aguilar Mendoza, matrícula 8702. Instructor del gimnasio BodyForge. Sin reportes. Sin acceso al campus.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  // Instructores Get Fit Now con perfiles similares — pero ninguno es el trainer de la víctima
  {
    id: 107,
    text: 'Reporte de antecedentes — Manuel Estrada, matrícula 9158. Instructor del gimnasio Get Fit Now. Cliente principal: Brenda Ochoa (14790). 3 reportes previos por conducta inapropiada con clientas. Suspendido temporalmente desde febrero 2026.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 108,
    text: 'Reporte de antecedentes — Roberto Silva, matrícula 9050. Instructor del gimnasio Get Fit Now. Cliente principal: Diana Castro (14730). Sin reportes previos. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 109,
    text: 'Reporte de antecedentes — Diego Padilla, matrícula 9285. Instructor del gimnasio Get Fit Now. Cliente principal: Sandra Olivares. 1 reporte previo por discusión con cliente. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 110,
    text: 'Reporte de antecedentes — Andrés Carrillo, matrícula 9241. Instructor del gimnasio Get Fit Now. Sin clientes principales activos. Sin reportes. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 111,
    text: 'Reporte de antecedentes — Alma Garza, matrícula 8501. Instructora del gimnasio Get Fit Now. Cliente principal: Patricia Cruz. Sin reportes previos. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 112,
    text: 'Reporte de antecedentes — Lucía Reyes, matrícula 9190. Instructora del gimnasio Get Fit Now. Cliente principal: Karen Beltrán (14760). Sin reportes previos. Acceso al campus ITESM activo.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 113,
    text: 'Reporte de antecedentes — Hector Vargas, matrícula 9077. Instructor del gimnasio BodyForge. Cliente principal: Andrea Ríos (14801). Sin reportes. Sin relación con el campus ITESM.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 114,
    text: 'Reporte de antecedentes — Gisela Morales, matrícula 8999. Instructora del gimnasio Get Fit Now. Cliente principal: Cecilia Rangel. Sin reportes previos.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 115,
    text: 'Reporte de antecedentes — Fabián Treviño, matrícula 8920. Instructor del gimnasio BodyForge. Sin reportes. Sin acceso al campus.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },
  {
    id: 116,
    text: 'Reporte interno sobre el programa de wellness ITESM: 14 entrenadores externos tienen acceso al campus. Solo 3 con reportes administrativos en su historial.',
    category: 'background_check', source: 'rrhh_itesm', date: '2026-03-10'
  },
  {
    id: 117,
    text: 'Reporte de antecedentes — Damián Cortés, matrícula 8805. Instructor del gimnasio Iron Studio. Sin reportes. Sin acceso al campus.',
    category: 'background_check', source: 'fiscalia', date: '2026-03-16'
  },

  // ── social_media_intel ────────────────────────────────────────────────────
  {
    id: 200,
    text: 'Análisis del usuario pro_coach_mtz (vinculado a un entrenador del gimnasio Get Fit Now): publicaciones regulares desde el gimnasio. Sin actividad entre las 22:00 del 15-marzo y las 08:00 del 16-marzo. Ausencia notable durante la ventana del crimen.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },
  {
    id: 201,
    text: 'Análisis del usuario sl_traveler (vinculada a una clienta cancelada del gimnasio BodyForge): publicó tres fotos en Cancún el 15 de marzo entre 18:00 y 22:45. Alibi confirmado por geolocalización.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },
  {
    id: 202,
    text: 'Análisis del usuario dhc_dev: publicó desde TI Solutions oficinas centro Monterrey hasta las 23:50 del 15 de marzo. Alibi confirmado.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },
  {
    id: 203,
    text: 'Análisis del usuario dianax_fit (clienta del gimnasio Get Fit Now): sin actividad sospechosa, posts normales.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },
  {
    id: 204,
    text: 'Análisis general OSINT: 47 usuarios activos vinculados al gimnasio Get Fit Now. Ninguno reportó actividad inusual la noche del crimen excepto la ausencia ya señalada de pro_coach_mtz.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },
  {
    id: 205,
    text: 'El equipo de redes sociales no encontró posts relacionados directamente con el Laboratorio CETEC la noche del 15 de marzo.',
    category: 'social_media_intel', source: 'osint_team', date: '2026-03-16'
  },

  // ── anonymous_tip (archivadas, históricas) ────────────────────────────────
  {
    id: 300,
    text: 'Recibido vía línea anónima en 2025: el instructor del programa de wellness ha tenido conflictos con clientes universitarios.',
    category: 'anonymous_tip', source: 'tip_line', date: '2025-11-12'
  },
  {
    id: 301,
    text: 'Pista anónima archivada: hay equipo del gimnasio Get Fit Now que desaparece sin reporte. Sospechan de un empleado interno.',
    category: 'anonymous_tip', source: 'tip_line', date: '2026-02-28'
  },
  {
    id: 302,
    text: 'Pista anónima: alguien menciona que un entrenador del campus tiene problemas con su cliente principal. No se profundizó.',
    category: 'anonymous_tip', source: 'tip_line', date: '2026-01-15'
  },
  {
    id: 303,
    text: 'Pista archivada: el programa de wellness del ITESM no audita correctamente a sus instructores externos.',
    category: 'anonymous_tip', source: 'tip_line', date: '2025-08-20'
  },

  // ── Ruido genérico (categorías variadas) ──────────────────────────────────
  { id: 400, text: 'Vi un auto rojo estacionado mal afuera del CETEC durante varios días.',                         category: 'witness_account', source: 'walk_in',   date: '2026-02-10' },
  { id: 401, text: 'Robaron mi bicicleta del estacionamiento del campus la semana pasada.',                          category: 'anonymous_tip',   source: 'tip_line',  date: '2026-03-08' },
  { id: 402, text: 'El elevador del edificio CIA se atascó dos veces en marzo, alguien debería revisarlo.',          category: 'anonymous_tip',   source: 'tip_line',  date: '2026-03-12' },
  { id: 403, text: 'La cafetería sirvió pollo crudo ayer, presenté queja formal.',                                   category: 'anonymous_tip',   source: 'tip_line',  date: '2026-03-14' },
  { id: 404, text: 'Vi luces encendidas en el laboratorio CETEC a las 3 de la mañana hace dos meses.',               category: 'witness_account', source: 'walk_in',   date: '2026-01-15' },
  { id: 405, text: 'Encontré una cartera en el pasillo del CETEC y la entregué a vigilancia.',                       category: 'witness_account', source: 'walk_in',   date: '2026-03-10' },
  { id: 406, text: 'Vi a una mujer con suéter rosa corriendo por el campus pero no me pareció sospechoso.',          category: 'witness_account', source: 'walk_in',   date: '2026-03-16' },
  { id: 407, text: 'Mi vecino el profesor sale a pasear a su perro todas las noches sin falla.',                     category: 'witness_account', source: 'walk_in',   date: '2026-03-16' },
  { id: 408, text: 'En la última junta del comité de seguridad se mencionó aumentar las cámaras del CETEC.',         category: 'background_check', source: 'comite',    date: '2026-03-01' },
  { id: 409, text: 'Escuché que la víctima, el Dr. Aguilar, había reportado equipo robado del gimnasio donde entrenaba.', category: 'witness_account', source: 'interview', date: '2026-03-16' }
];

const COLLECTION = 'witness_testimonies';
const VECTOR_SIZE = 384;

export async function seedQdrant(log) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL });
  log('qdrant: conectado');

  const existing = await client.getCollections();
  const has = existing.collections.some(c => c.name === COLLECTION);

  if (has) {
    const info = await client.getCollection(COLLECTION);
    if (info.points_count >= TESTIMONIES.length) {
      log(`qdrant: ya hay ${info.points_count} puntos, skip`);
      return;
    }
  } else {
    await client.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
    });
    try {
      await client.createPayloadIndex(COLLECTION, { field_name: 'category', field_schema: 'keyword' });
    } catch (e) { /* ya existe */ }
    log(`qdrant: collection '${COLLECTION}' creada (${VECTOR_SIZE} dims) + payload index`);
  }

  log('qdrant: cargando modelo de embeddings (Xenova/paraphrase-multilingual-MiniLM-L12-v2)...');
  const extract = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  log('qdrant: modelo cargado, generando embeddings');

  const points = [];
  for (const t of TESTIMONIES) {
    const output = await extract(t.text, { pooling: 'mean', normalize: true });
    points.push({
      id: t.id,
      vector: Array.from(output.data),
      payload: {
        text: t.text,
        category: t.category,
        source: t.source,
        date: t.date
      }
    });
  }

  await client.upsert(COLLECTION, { wait: true, points });
  log(`qdrant: ${points.length} testimonios indexados`);
  log('qdrant: OK');
}
