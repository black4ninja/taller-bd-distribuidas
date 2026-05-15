import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// students.json es opcional y NO se commitea (gitignored): cada instructor pone su lista local.
// El repo trae students.example.json con datos ficticios para que el clone funcione out-of-the-box.
const STUDENTS_PATH = fs.existsSync(path.join(__dirname, '../data/students.json'))
  ? path.join(__dirname, '../data/students.json')
  : path.join(__dirname, '../data/students.example.json');
const STUDENTS = JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf8'));

// Variantes de seed para que cada caso sea distinto
const WEAPONS = [
  'Cable USB-C', 'Llave inglesa', 'Cuerda de yoga del gimnasio',
  'Pesa libre de 5kg', 'Cargador de laptop', 'Mango de raqueta',
  'Barra de pesas pequeña', 'Cinturón de levantamiento'
];
const LOCATIONS = [
  'Laboratorio CETEC', 'Laboratorio CIA (sótano)', 'Aula CETEC 304',
  'Estacionamiento norte', 'Sala de servidores del CETEC', 'Almacén del gimnasio',
  'Pasillo del edificio Aulas 2', 'Vestidor de hombres del Get Fit Now'
];
const GYMS = ['Get Fit Now', 'BodyForge', 'Iron Studio', 'Fitness Pro'];

// Patrones para los handles sociales no-derivables del nombre real
const HANDLE_PREFIXES = ['pro', 'fit', 'iron', 'core', 'flex', 'wild', 'urban', 'mty', 'norte', 'spark'];
const HANDLE_SUFFIXES = ['coach', 'trainer', 'mx', '01', 'mtz', 'gtg', 'fit', 'pro', 'life', 'runs'];

// Atributos físicos genéricos (CSV mezcla nombres de hombres y mujeres, así que la
// narrativa es gender-neutral: describe traits, no género).
const TRAIT_SETS = [
  { hair: 'cabello rubio',           extra: 'suéter rosa frecuente',   tag: 'rubio' },
  { hair: 'cabello castaño largo',   extra: 'chamarra de mezclilla',   tag: 'castaño' },
  { hair: 'cabello negro corto',     extra: 'lentes de pasta',         tag: 'corto' },
  { hair: 'cabello pelirrojo',       extra: 'tatuaje en el brazo',     tag: 'pelirrojo' },
  { hair: 'delgada complexión y barba cerrada', extra: 'usa gorra siempre',  tag: 'barba' },
  { hair: 'estatura muy alta',       extra: 'lentes de armazón grueso', tag: 'alto' },
  { hair: 'cabeza rapada',           extra: 'tatuaje en el cuello',    tag: 'rapado' },
  { hair: 'cabello rubio teñido',    extra: 'sudadera oscura',         tag: 'teñido' }
];
const OCCUPATIONS = ['Estudiante', 'Profesionista', 'Ingeniero', 'Diseñador', 'Programador', 'Médico', 'Maestro', 'Periodista', 'Abogado'];

// Direcciones de testigos (las 2 primeras se usan tal cual, la 3ra usa gym_member_id)
const ADDRESSES = [
  'Calle Tecnológico 1, Col. Tecnológico',
  'Av. Eugenio Garza Sada 2300',
  'Av. Constitución 980',
  'Calle Hidalgo 45',
  'Av. Revolución 555',
  'Calle Pino Suárez 120'
];

// PRNG determinístico — mismo player_id siempre da el mismo caso
function makePrng(seed) {
  let h = 0;
  for (const c of seed) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }
  let s = h || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genHandle(name, rng) {
  // Nunca derivar del nombre real — solo combinaciones de prefijo+sufijo+número
  return `${pick(HANDLE_PREFIXES, rng)}_${pick(HANDLE_SUFFIXES, rng)}${Math.floor(rng()*99)}`;
}

function genGymId(rng, isTrainer) {
  return (isTrainer ? 8500 : 14000) + Math.floor(rng() * (isTrainer ? 920 : 900));
}

function shortNick(name) {
  // "Juan Manuel Pérez García" → "Pérez"
  const parts = name.split(/\s+/);
  // El penúltimo elemento suele ser el primer apellido
  return parts[parts.length - 2] || parts[parts.length - 1];
}

export function generateCase(playerId) {
  const rng = makePrng(playerId);
  const pool = shuffle(STUDENTS, rng);

  // Roles
  const killer = pool[0];
  const victim = pool[1];
  const witness1 = pool[2];  // dirección Calle Tecnológico
  const witness2 = pool[3];  // dirección Eugenio Garza Sada
  const witness3 = pool[4];  // miembro del gym
  const physicalSuspectF = pool[5];  // mujer descrita por testigo 1
  const physicalSuspectM = pool[6];  // hombre descrito por testigo 2

  // Trainers (al menos 25 background_checks en Qdrant)
  const trainers = pool.slice(7, 7 + 24);

  // Otros members "fillers" del gym para Mongo gym_members
  const otherMembers = pool.slice(31, 31 + 20);

  // Atributos físicos — 2 traits distintos para los 2 sospechosos
  const traitsShuffled = shuffle(TRAIT_SETS, rng);
  const trait1 = traitsShuffled[0];
  const trait2 = traitsShuffled[1];

  // IDs
  const killerGymId = genGymId(rng, true);
  const victimGymId = genGymId(rng, false);
  const witness3GymId = genGymId(rng, false);

  // Reorganizar dirección de los witnesses
  const wAddr1 = 'Calle Tecnológico 1';
  const wAddr2 = 'Av. Eugenio Garza Sada 2300';

  return {
    case_id: 'CSI-2026-' + (Math.floor(rng() * 9000) + 1000),
    seed: playerId,
    date: '2026-03-15',

    weapon: pick(WEAPONS, rng),
    location: pick(LOCATIONS, rng),
    gym: pick(GYMS.slice(0, 2), rng),  // Get Fit Now o BodyForge para que sea creíble

    killer: {
      name: killer.name,
      matricula: killer.matricula,
      gym_member_id: killerGymId,
      role: 'trainer',
      handle: genHandle(killer.name, rng),
      reports_count: 1 + Math.floor(rng() * 3),  // 1-3 quejas previas
      residence: `Calle Morones Prieto ${100 + Math.floor(rng()*900)}`,
      join_date: '2022-03-10'
    },
    victim: {
      name: victim.name,
      matricula: victim.matricula,
      gym_member_id: victimGymId,
      occupation: 'Alumno ITESM'
    },
    witnesses: [
      { name: witness1.name, address: wAddr1, role: 'first',  testimony_focus: 'rubia_estudiante' },
      { name: witness2.name, address: wAddr2, role: 'second', testimony_focus: 'delgado_barba' },
      { name: witness3.name, gym_member_id: witness3GymId, role: 'third', testimony_focus: 'entrenador_alterado' }
    ],
    physical_suspects: [
      { name: physicalSuspectF.name, matricula: physicalSuspectF.matricula, traits: trait1 },
      { name: physicalSuspectM.name, matricula: physicalSuspectM.matricula, traits: trait2 }
    ],
    decoy_trainers: trainers.map((t, i) => ({
      name: t.name,
      matricula: t.matricula,
      gym_member_id: genGymId(makePrng(playerId + ':' + i), true),
      gym: pick(GYMS, makePrng(playerId + ':t' + i)),
      reports_count: Math.floor(makePrng(playerId + ':r' + i)() * 4),  // 0-3
      has_campus_access: makePrng(playerId + ':a' + i)() > 0.4,
      occupation: pick(OCCUPATIONS, makePrng(playerId + ':o' + i))
    })),
    other_members: otherMembers.map((m, i) => ({
      name: m.name,
      matricula: m.matricula,
      gym_member_id: genGymId(makePrng(playerId + ':m' + i), false),
      occupation: pick(OCCUPATIONS, makePrng(playerId + ':oo' + i))
    })),
    nicknames: {
      // Para que el informe formal del asesino mencione la víctima por nombre corto también
      killer_short: shortNick(killer.name),
      victim_short: shortNick(victim.name)
    }
  };
}
