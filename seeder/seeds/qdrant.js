import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

// E4 — Busqueda vectorial:
// La frase encontrada en Redis (E3) se usa para buscar el testimonio mas similar
// en esta coleccion. El testimonio top-1 contiene el nombre completo del asesino.

const TESTIMONIES = [
  // TOP MATCH — nombra explicitamente al asesino. Contiene los conceptos clave:
  // "Carlos Méndez", "entrenador", "Get Fit Now", "laboratorio CETEC", "bolsa/mochila negra".
  {
    id: 1,
    text:
      'He visto a Carlos Méndez, el entrenador del gimnasio Get Fit Now, entrar al Laboratorio CETEC del ITESM con una mochila negra grande en varias ocasiones. ' +
      'Me parecía raro porque él no es investigador ni alumno del laboratorio. La última vez que lo vi fue alrededor del 15 de marzo.',
    witness_alias: 'anonimo-cetec-01'
  },

  // Cercanos pero NO mencionan a Carlos Méndez por nombre — descartar
  {
    id: 2,
    text: 'Un entrenador del gimnasio Get Fit Now suele entrar al edificio del ITESM con bolsas grandes, pero no sé su nombre.',
    witness_alias: 'anonimo-gym-04'
  },
  {
    id: 3,
    text: 'Vi a un hombre con uniforme de gimnasio cargando algo pesado cerca del laboratorio una noche.',
    witness_alias: 'estudiante-anonimo-12'
  },
  {
    id: 4,
    text: 'Hace tiempo escuché que un instructor del Get Fit Now amenazó a un cliente. No supe en qué terminó.',
    witness_alias: 'cliente-gym-22'
  },
  {
    id: 5,
    text: 'El entrenador Roberto Silva siempre está en el gimnasio hasta tarde, pero nunca lo he visto en el CETEC.',
    witness_alias: 'miembro-9999'
  },
  {
    id: 6,
    text: 'Algunos entrenadores tienen tarjetas de acceso al campus por el programa de wellness, lo cual a mí me parece riesgoso.',
    witness_alias: 'admin-campus-03'
  },

  // Ruido: testimonios sin relación con el caso
  { id: 7,  text: 'Vi un auto rojo estacionado mal afuera del CETEC durante varios días.', witness_alias: 'vecino-01' },
  { id: 8,  text: 'Robaron mi bicicleta del estacionamiento del campus la semana pasada.', witness_alias: 'estudiante-77' },
  { id: 9,  text: 'El elevador del edificio CIA se atascó dos veces en marzo, alguien debería revisarlo.', witness_alias: 'profesor-19' },
  { id: 10, text: 'La cafetería sirvió pollo crudo ayer, presenté queja formal.', witness_alias: 'alumno-201' },
  { id: 11, text: 'El gimnasio Get Fit Now subió sus precios sin avisar y muchos clientes están molestos.', witness_alias: 'cliente-13' },
  { id: 12, text: 'Vi luces encendidas en el laboratorio CETEC a las 3 de la mañana hace dos meses.', witness_alias: 'guardia-05' },
  { id: 13, text: 'Un perro callejero entró al estacionamiento del campus y nadie lo sacó por horas.', witness_alias: 'voluntaria-22' },
  { id: 14, text: 'La señal de WiFi del CETEC ha estado intermitente toda la semana.', witness_alias: 'estudiante-58' },
  { id: 15, text: 'Encontré una cartera en el pasillo del CETEC y la entregué a vigilancia.', witness_alias: 'visitante-04' },
  { id: 16, text: 'En el gimnasio cambiaron de proveedor de proteínas y ahora saben distinto.', witness_alias: 'miembro-9912' },
  { id: 17, text: 'Hubo un cortocircuito en el laboratorio de electrónica del CIA en febrero.', witness_alias: 'tecnico-mantenimiento' },
  { id: 18, text: 'El programa de wellness del campus está mal organizado, las clases se empalman.', witness_alias: 'rrhh-itesm' },
  { id: 19, text: 'Vi a una mujer con suéter rosa corriendo por el campus pero no me pareció sospechoso.', witness_alias: 'estudiante-44' },
  { id: 20, text: 'El estacionamiento del CETEC necesita más luz, está muy oscuro de noche.', witness_alias: 'profesor-08' },
  { id: 21, text: 'Mi vecino el profesor sale a pasear a su perro todas las noches sin falla.', witness_alias: 'vecino-rb-02' },
  { id: 22, text: 'En la última junta del comité de seguridad se mencionó aumentar las cámaras del CETEC.', witness_alias: 'comite-seguridad' },
  { id: 23, text: 'A veces los entrenadores del Get Fit Now organizan sesiones privadas fuera del horario, eso es contra el reglamento.', witness_alias: 'gerente-gym' },
  { id: 24, text: 'Escuché que la víctima, el Dr. Aguilar, había reportado equipo robado del gimnasio donde entrenaba.', witness_alias: 'colega-cetec-11' },
  { id: 25, text: 'No conozco a la víctima personalmente pero sé que era investigador del ITESM.', witness_alias: 'anonimo-44' }
];

const COLLECTION = 'witness_testimonies';
const VECTOR_SIZE = 384;  // paraphrase-multilingual-MiniLM-L12-v2 → 384 dims (soporta español)

export async function seedQdrant(log) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL });
  log('qdrant: conectado');

  // Idempotencia
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
    log(`qdrant: collection '${COLLECTION}' creada (${VECTOR_SIZE} dims)`);
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
      payload: { text: t.text, witness_alias: t.witness_alias }
    });
  }

  await client.upsert(COLLECTION, { wait: true, points });
  log(`qdrant: ${points.length} testimonios indexados`);
  log('qdrant: OK');
}
