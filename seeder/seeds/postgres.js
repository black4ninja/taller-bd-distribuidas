import pg from 'pg';

const { Client } = pg;

// Datos coherentes con la narrativa cross-DB:
// - Victima: Dr. Ernesto Aguilar (member 14782)
// - Asesino real (revelado en E4): Carlos Méndez (trainer, member 9001)
// - Sospechosos plantados por E1 (con alibi en E2): Sofia Linares, David Hernández

const PERSONS = [
  // Testigos identificados en crime_scene_report
  { name: 'Mauricio Robles',  address: 'Calle Tecnológico 1, Col. Tecnológico',    gym_member_id: null,  occupation: 'Profesor',     notes: 'Saca a pasear a su perro todas las noches' },
  { name: 'Laura Salinas',    address: 'Av. Eugenio Garza Sada 2300',              gym_member_id: null,  occupation: 'Doctora',      notes: 'Vecina del campus' },
  { name: 'Diana Castro',     address: 'Calle Junco de la Vega 87',                gym_member_id: 14782, occupation: 'Estudiante',   notes: 'Asiste al gimnasio Get Fit Now' },

  // Sospechosos visibles desde las entrevistas (E1) — INOCENTES (descartados en E2 por alibi)
  { name: 'Sofía Linares',    address: 'Av. Universidad 100',                      gym_member_id: null,  occupation: 'Estudiante',   notes: 'cabello rubio, suéter rosa frecuente, estudiante de Diseño' },
  { name: 'David Hernández',  address: 'Calle Hidalgo 45',                         gym_member_id: null,  occupation: 'Ingeniero',    notes: 'delgado, barba cerrada, trabaja en TI Solutions' },

  // Asesino real (no aparece directamente en las entrevistas - se descubre en E4)
  { name: 'Carlos Méndez',    address: 'Calle Morones Prieto 230',                 gym_member_id: 9001,  occupation: 'Entrenador personal Get Fit Now', notes: 'Entrenador con varios reportes internos de conducta agresiva' },

  // Víctima (referencia)
  { name: 'Dr. Ernesto Aguilar', address: 'Calle CETEC 50',                        gym_member_id: 14782, occupation: 'Investigador TI, ITESM', notes: 'Víctima' },

  // Ruido (fillers) para que la búsqueda no sea trivial
  { name: 'Andrea Ríos',      address: 'Av. Constitución 980',                     gym_member_id: 14801, occupation: 'Abogada',      notes: null },
  { name: 'Luis Mata',        address: 'Calle Pino Suárez 120',                    gym_member_id: null,  occupation: 'Comerciante',  notes: 'usa gorra siempre' },
  { name: 'Paola Gutierrez',  address: 'Av. Revolución 555',                       gym_member_id: 14745, occupation: 'Diseñadora',   notes: 'cabello rubio teñido' },
  { name: 'Roberto Silva',    address: 'Calle Allende 78',                         gym_member_id: 9050,  occupation: 'Entrenador Get Fit Now', notes: 'entrenador junior' },
  { name: 'Mariana Cabrera',  address: 'Av. Garza Sada 1500',                      gym_member_id: null,  occupation: 'Médica',       notes: null },
  { name: 'Jorge Tapia',      address: 'Calle Padre Mier 45',                      gym_member_id: 14820, occupation: 'Estudiante',   notes: 'barba descuidada' },
  { name: 'Sandra Olivares',  address: 'Av. Insurgentes 600',                      gym_member_id: null,  occupation: 'Contadora',    notes: null },
  { name: 'Hector Vargas',    address: 'Calle Juárez 12',                          gym_member_id: 9077,  occupation: 'Entrenador',   notes: 'no es del Get Fit Now' },
  { name: 'Brenda Ochoa',     address: 'Calle Madero 300',                         gym_member_id: 14790, occupation: 'Programadora', notes: 'rubia natural' },
  { name: 'Felipe Aragón',    address: 'Av. Lázaro Cárdenas 1100',                 gym_member_id: null,  occupation: 'Mecánico',     notes: 'delgado' },
  { name: 'Daniela Núñez',    address: 'Calle Zaragoza 60',                        gym_member_id: 14755, occupation: 'Periodista',   notes: 'usa lentes' },
  { name: 'Iván Lozano',      address: 'Av. Cuauhtémoc 880',                       gym_member_id: null,  occupation: 'Chef',         notes: null },
  { name: 'Cecilia Rangel',   address: 'Calle Galeana 220',                        gym_member_id: 14801, occupation: 'Veterinaria',  notes: null },
  { name: 'Tomás Fuentes',    address: 'Av. Pino Suárez 70',                       gym_member_id: null,  occupation: 'Plomero',      notes: 'tatuajes visibles' },
  { name: 'Karen Beltrán',    address: 'Calle Independencia 12',                   gym_member_id: 14760, occupation: 'Maestra',      notes: null },
  { name: 'Oscar Méndez',     address: 'Calle Hidalgo 90',                         gym_member_id: null,  occupation: 'Taxista',      notes: 'hermano del entrenador Carlos Méndez' },
  { name: 'Lucía Domínguez',  address: 'Av. Madero 800',                           gym_member_id: 14810, occupation: 'Enfermera',    notes: null },
  { name: 'Esteban Coronado', address: 'Calle 5 de Mayo 33',                       gym_member_id: null,  occupation: 'Arquitecto',   notes: 'delgado, con barba candado' }
];

const INTERVIEWS_BY_NAME = {
  'Mauricio Robles':
    'Salí a pasear a mi perro a eso de las 11 de la noche el 15 de marzo. Vi salir corriendo del Laboratorio CETEC a una mujer rubia con un suéter rosa. Parecía universitaria, joven. No le vi la cara pero el suéter llamaba la atención.',
  'Laura Salinas':
    'El 15 de marzo, alrededor de las 10:30 de la noche, escuché una discusión fuerte en el estacionamiento del CETEC. Vi a un hombre delgado, con barba cerrada, peleando con alguien más a quien no alcancé a ver. El delgado se fue molesto hacia las oficinas administrativas.',
  'Diana Castro':
    'Conocía a la víctima del gimnasio Get Fit Now. Ernesto era cliente regular ahí. Esa noche, antes del crimen, vi a su entrenador personal muy alterado al terminar la última clase, lo escuché decir "yo voy a arreglar esto esta noche". Nunca lo había visto así.'
};

export async function seedPostgres(log) {
  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  await client.connect();
  log('postgres: conectado');

  await client.query(`
    CREATE TABLE IF NOT EXISTS persons (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      gym_member_id INTEGER,
      occupation TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS crime_scene_report (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      city TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id SERIAL PRIMARY KEY,
      person_id INTEGER REFERENCES persons(id),
      transcript TEXT NOT NULL
    );
  `);
  log('postgres: schema asegurado');

  // Idempotencia: si ya hay datos, no re-inserta.
  const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM persons');
  if (existing[0].n > 0) {
    log(`postgres: ya hay ${existing[0].n} personas, skip insert`);
    await client.end();
    return;
  }

  for (const p of PERSONS) {
    await client.query(
      'INSERT INTO persons (name, address, gym_member_id, occupation, notes) VALUES ($1, $2, $3, $4, $5)',
      [p.name, p.address, p.gym_member_id, p.occupation, p.notes]
    );
  }
  log(`postgres: ${PERSONS.length} personas insertadas`);

  await client.query(
    `INSERT INTO crime_scene_report (date, city, type, description) VALUES ($1, $2, $3, $4)`,
    [
      '2026-03-15',
      'Monterrey',
      'homicide',
      'Cuerpo encontrado en el Laboratorio CETEC del ITESM Campus Monterrey a las 23:45 del 15 de marzo de 2026. Causa de muerte: asfixia con un Cable USB-C. ' +
      'Se identificaron tres testigos durante el levantamiento: ' +
      '(1) El primer testigo vive en la primera casa de Calle Tecnológico (Col. Tecnológico). ' +
      '(2) La segunda testigo reside en Av. Eugenio Garza Sada 2300. ' +
      '(3) La tercera testigo es miembro #14782 del gimnasio "Get Fit Now". ' +
      'Recolectar entrevistas de los tres y cruzar nombres con sus descripciones físicas.'
    ]
  );
  log('postgres: crime_scene_report insertado');

  // Insertar entrevistas usando JOIN por nombre
  for (const [name, transcript] of Object.entries(INTERVIEWS_BY_NAME)) {
    await client.query(
      `INSERT INTO interviews (person_id, transcript)
       SELECT id, $1 FROM persons WHERE name = $2`,
      [transcript, name]
    );
  }
  log(`postgres: ${Object.keys(INTERVIEWS_BY_NAME).length} entrevistas insertadas`);

  await client.end();
  log('postgres: OK');
}
