// Normaliza respuestas para tolerar mayúsculas, espacios, acentos y signos.
function normalize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
    return a === n || a.includes(n);
  });
}

const GENERIC_ERROR = 'Respuesta incorrecta. Revisa tu investigación y vuelve a intentarlo. Si te atoras, usa las pistas progresivas.';

// Títulos públicos de cada estación (no dependen del caso)
export const STATIONS = {
  E1: { title: 'PostgreSQL — Las entrevistas' },
  E2: { title: 'MongoDB — El handle del entrenador' },
  E3: { title: 'Redis — La pista del informante' },
  E4: { title: 'Qdrant — Confesión semántica' }
};

// Genera respuestas aceptadas DESDE el caso del jugador.
function acceptedAnswers(stationId, caseObj) {
  if (!caseObj) return [];
  switch (stationId) {
    case 'E1':
      // Cualquiera de los 2 sospechosos físicos
      return [
        caseObj.physical_suspects[0].name,
        caseObj.physical_suspects[1].name
      ];
    case 'E2':
      return [caseObj.killer.handle];
    case 'E3':
      // El nombre de la collection vectorial — siempre witness_testimonies en este diseño
      return ['witness_testimonies'];
    case 'E4':
      return [caseObj.killer.name];
    default:
      return [];
  }
}

export function checkStation(id, answer, caseObj) {
  const accept = acceptedAnswers(id, caseObj);
  if (accept.length === 0) return { ok: false, error: 'Caso no inicializado.' };
  if (matchesAny(answer, accept)) return { ok: true };
  return { ok: false, error: GENERIC_ERROR };
}

export function checkFlag({ killer, weapon, location }, caseObj) {
  if (!caseObj) return { ok: false, fields: { killer: false, weapon: false, location: false } };
  const k = matchesAny(killer,   [caseObj.killer.name]);
  const w = matchesAny(weapon,   [caseObj.weapon]);
  const l = matchesAny(location, [caseObj.location]);
  return { ok: k && w && l, fields: { killer: k, weapon: w, location: l } };
}
