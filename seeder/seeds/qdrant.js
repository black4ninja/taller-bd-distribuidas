import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

// E4 — Hybrid search (vector + payload filter):
// La frase encontrada en Redis se usa para buscar testimonios similares,
// pero el testimonio que NOMBRA al asesino está en una categoría específica
// (background_check) y el alumno debe filtrar para subirlo al top.
//
// Sin filter: top-1 describe la escena pero NO nombra al asesino.
// Con filter category=background_check: el reporte formal con el nombre completo sale top.

const TESTIMONIES = [
  // ── witness_account (descripciones, sin nombre completo del asesino) ────────
  {
    id: 1,
    text: 'He visto al entrenador del gimnasio Get Fit Now entrar al Laboratorio CETEC del ITESM con una mochila negra grande en varias ocasiones. Me parecía raro porque no es investigador ni alumno del laboratorio. La última vez fue alrededor del 15 de marzo.',
    category: 'witness_account',
    source: 'walk_in_witness',
    date: '2026-03-17'
  },
  {
    id: 2,
    text: 'Un entrenador del gimnasio Get Fit Now suele entrar al edificio del ITESM con bolsas grandes. Lleva una sudadera oscura. No sé su nombre.',
    category: 'witness_account',
    source: 'walk_in_witness',
    date: '2026-03-17'
  },
  {
    id: 3,
    text: 'Vi a un hombre con uniforme de gimnasio cargando algo pesado cerca del laboratorio una noche. Salió rápido, no le vi bien la cara.',
    category: 'witness_account',
    source: 'walk_in_witness',
    date: '2026-03-16'
  },
  {
    id: 4,
    text: 'Hace tiempo escuché que un instructor del Get Fit Now amenazó a un cliente del gimnasio. No supe en qué terminó.',
    category: 'witness_account',
    source: 'interview',
    date: '2026-03-16'
  },
  {
    id: 5,
    text: 'El instructor que da las clases de las 7pm en Get Fit Now siempre se queda hasta tarde, después incluso del cierre del gimnasio.',
    category: 'witness_account',
    source: 'walk_in_witness',
    date: '2026-03-17'
  },
  {
    id: 6,
    text: 'Algunos entrenadores del gimnasio tienen tarjetas de acceso al campus por el programa de wellness, lo cual a mí siempre me pareció riesgoso.',
    category: 'witness_account',
    source: 'interview',
    date: '2026-03-15'
  },

  // ── background_check (reportes formales — UNO NOMBRA AL ASESINO) ────────────
  {
    id: 26,
    text: 'Reporte de seguridad interno: Carlos Méndez (matrícula 9001), instructor del gimnasio Get Fit Now Monterrey. Fue visto en varias ocasiones cargando una mochila negra en el área del Laboratorio CETEC fuera de horario. Dos reportes previos por agresión verbal a clientes. Tarjeta de acceso al campus ITESM activa desde 2025 por programa de wellness. Cliente principal asignado: Dr. Ernesto Aguilar (14782, deceased).',
    category: 'background_check',
    source: 'fiscalia_internal',
    date: '2026-03-16'
  },
  {
    id: 27,
    text: 'Background check: Roberto Silva, instructor Get Fit Now, matrícula 9050. Sin antecedentes. Activo desde 2023. Sin acceso al campus.',
    category: 'background_check',
    source: 'fiscalia_internal',
    date: '2026-03-16'
  },
  {
    id: 28,
    text: 'Reporte de antecedentes: Ricardo Aguilar Salas, instructor del gimnasio Get Fit Now, matrícula 9120. Sin antecedentes penales. Activo desde 2021. Sin reportes internos.',
    category: 'background_check',
    source: 'fiscalia_internal',
    date: '2026-03-16'
  },
  {
    id: 29,
    text: 'Background: Hector Vargas, instructor del gimnasio BodyForge, matrícula 9077. Limpio. Sin relación con el campus ITESM.',
    category: 'background_check',
    source: 'fiscalia_internal',
    date: '2026-03-16'
  },
  {
    id: 30,
    text: 'Reporte interno sobre el programa de wellness ITESM: 14 entrenadores externos tienen acceso al campus. Solo 3 con reportes administrativos en su historial.',
    category: 'background_check',
    source: 'rrhh_itesm',
    date: '2026-03-10'
  },

  // ── social_media_intel (análisis de redes) ──────────────────────────────────
  {
    id: 31,
    text: 'Análisis del usuario pro_coach_mtz (vinculado a un entrenador del gimnasio Get Fit Now): publicaciones regulares desde el gimnasio. Sin actividad entre las 22:00 del 15-marzo y las 08:00 del 16-marzo. Ausencia notable.',
    category: 'social_media_intel',
    source: 'osint_team',
    date: '2026-03-16'
  },
  {
    id: 32,
    text: 'Análisis del usuario sl_traveler (vinculada a una clienta cancelada del gimnasio BodyForge): publicó tres fotos en Cancún el 15 de marzo entre 18:00 y 22:45. Alibi confirmado por geolocalización.',
    category: 'social_media_intel',
    source: 'osint_team',
    date: '2026-03-16'
  },
  {
    id: 33,
    text: 'Análisis del usuario dhc_dev: publicó desde TI Solutions oficinas centro Monterrey hasta las 23:50 del 15 de marzo. Alibi confirmado.',
    category: 'social_media_intel',
    source: 'osint_team',
    date: '2026-03-16'
  },
  {
    id: 34,
    text: 'Análisis general de redes: 47 usuarios activos vinculados al gimnasio Get Fit Now. Ninguno reportó actividad inusual la noche del crimen excepto la ausencia ya señalada.',
    category: 'social_media_intel',
    source: 'osint_team',
    date: '2026-03-16'
  },

  // ── anonymous_tip (pistas movidas a archivo permanente) ─────────────────────
  {
    id: 35,
    text: 'Recibido vía línea anónima: el instructor del programa de wellness ha tenido conflictos con clientes universitarios.',
    category: 'anonymous_tip',
    source: 'tip_line',
    date: '2026-02-12'
  },
  {
    id: 36,
    text: 'Pista anónima archivada: hay equipo de gimnasio que desaparece sin reporte. Sospechan de un empleado interno.',
    category: 'anonymous_tip',
    source: 'tip_line',
    date: '2026-02-28'
  },

  // ── Ruido (categorías mixtas, no relacionados con el caso) ──────────────────
  { id: 7,  text: 'Vi un auto rojo estacionado mal afuera del CETEC durante varios días.', category: 'witness_account', source: 'walk_in_witness', date: '2026-02-10' },
  { id: 8,  text: 'Robaron mi bicicleta del estacionamiento del campus la semana pasada.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-08' },
  { id: 9,  text: 'El elevador del edificio CIA se atascó dos veces en marzo, alguien debería revisarlo.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-12' },
  { id: 10, text: 'La cafetería sirvió pollo crudo ayer, presenté queja formal.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-14' },
  { id: 11, text: 'El gimnasio Get Fit Now subió sus precios sin avisar y muchos clientes están molestos.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-05' },
  { id: 12, text: 'Vi luces encendidas en el laboratorio CETEC a las 3 de la mañana hace dos meses.', category: 'witness_account', source: 'walk_in_witness', date: '2026-01-15' },
  { id: 13, text: 'Un perro callejero entró al estacionamiento del campus y nadie lo sacó por horas.', category: 'anonymous_tip', source: 'tip_line', date: '2026-02-20' },
  { id: 14, text: 'La señal de WiFi del CETEC ha estado intermitente toda la semana.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-13' },
  { id: 15, text: 'Encontré una cartera en el pasillo del CETEC y la entregué a vigilancia.', category: 'witness_account', source: 'walk_in_witness', date: '2026-03-10' },
  { id: 16, text: 'En el gimnasio cambiaron de proveedor de proteínas y ahora saben distinto.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-07' },
  { id: 17, text: 'Hubo un cortocircuito en el laboratorio de electrónica del CIA en febrero.', category: 'witness_account', source: 'mantenimiento', date: '2026-02-15' },
  { id: 18, text: 'El programa de wellness del campus está mal organizado, las clases se empalman.', category: 'anonymous_tip', source: 'tip_line', date: '2026-02-22' },
  { id: 19, text: 'Vi a una mujer con suéter rosa corriendo por el campus pero no me pareció sospechoso.', category: 'witness_account', source: 'walk_in_witness', date: '2026-03-16' },
  { id: 20, text: 'El estacionamiento del CETEC necesita más luz, está muy oscuro de noche.', category: 'anonymous_tip', source: 'tip_line', date: '2026-03-01' },
  { id: 21, text: 'Mi vecino el profesor sale a pasear a su perro todas las noches sin falla.', category: 'witness_account', source: 'walk_in_witness', date: '2026-03-16' },
  { id: 22, text: 'En la última junta del comité de seguridad se mencionó aumentar las cámaras del CETEC.', category: 'background_check', source: 'comite_seguridad', date: '2026-03-01' },
  { id: 23, text: 'A veces los entrenadores del Get Fit Now organizan sesiones privadas fuera del horario, eso es contra el reglamento.', category: 'anonymous_tip', source: 'tip_line', date: '2026-02-18' },
  { id: 24, text: 'Escuché que la víctima, el Dr. Aguilar, había reportado equipo robado del gimnasio donde entrenaba.', category: 'witness_account', source: 'interview', date: '2026-03-16' },
  { id: 25, text: 'No conozco a la víctima personalmente pero sé que era investigador del ITESM.', category: 'witness_account', source: 'walk_in_witness', date: '2026-03-16' }
];

const COLLECTION = 'witness_testimonies';
const VECTOR_SIZE = 384;  // paraphrase-multilingual-MiniLM-L12-v2 → 384 dims (soporta español)

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
    // Crear payload index para acelerar filtros por categoría
    try {
      await client.createPayloadIndex(COLLECTION, { field_name: 'category', field_schema: 'keyword' });
    } catch (e) { /* puede ya existir */ }
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
  log(`qdrant: ${points.length} testimonios indexados (categorías: witness_account, background_check, social_media_intel, anonymous_tip)`);
  log('qdrant: OK');
}
