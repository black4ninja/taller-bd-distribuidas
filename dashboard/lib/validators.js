// Normaliza respuestas para tolerar mayúsculas, espacios, acentos y signos.
function normalize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacriticos combining marks
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(answer, acceptedSet) {
  const a = normalize(answer);
  if (!a) return false;
  return acceptedSet.some(accepted => {
    const n = normalize(accepted);
    return a === n || a.includes(n) || n.includes(a);
  });
}

// Diseño narrativo (alineado con seeds/*.js):
//   E0 → walkthrough, no requiere respuesta
//   E1 → 2 sospechosos visibles desde interviews (Sofía o David)
//   E2 → key oculta de Redis revelada por _evidence_archive de Mongo
//   E3 → nombre de la collection vectorial encontrada DENTRO del valor de Redis
//   E4 → nombre completo del asesino real
const GENERIC_ERROR = 'Respuesta incorrecta. Revisa tu investigación y vuelve a intentarlo. Si te atoras, usa las pistas progresivas.';

export const STATIONS = {
  E1: {
    title: 'PostgreSQL — Las entrevistas',
    accept: ['Sofía Linares', 'Sofia Linares', 'David Hernández', 'David Hernandez'],
    error_hint: GENERIC_ERROR
  },
  E2: {
    title: 'MongoDB — El handle del entrenador',
    accept: ['pro_coach_mtz'],
    error_hint: GENERIC_ERROR
  },
  E3: {
    title: 'Redis — La pista del informante',
    accept: ['witness_testimonies'],
    error_hint: GENERIC_ERROR
  },
  E4: {
    title: 'Qdrant — Confesión semántica',
    accept: ['Carlos Méndez', 'Carlos Mendez'],
    error_hint: GENERIC_ERROR
  }
};

export function checkStation(id, answer) {
  const station = STATIONS[id];
  if (!station) return { ok: false, error: 'Estación inexistente' };
  if (matchesAny(answer, station.accept)) {
    return { ok: true };
  }
  return { ok: false, error: station.error_hint };
}

// /solve — flag final concatenado
export const FLAG = {
  killer:   ['Carlos Méndez', 'Carlos Mendez'],
  weapon:   ['Cable USB-C', 'Cable USB C', 'USB-C', 'cable usb-c'],
  location: ['Laboratorio CETEC', 'CETEC', 'Lab CETEC']
};

export function checkFlag({ killer, weapon, location }) {
  const k = matchesAny(killer, FLAG.killer);
  const w = matchesAny(weapon, FLAG.weapon);
  const l = matchesAny(location, FLAG.location);
  return {
    ok: k && w && l,
    fields: { killer: k, weapon: w, location: l }
  };
}
