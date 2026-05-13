// Progreso del alumno guardado en cookie firmada (HMAC).
// Estructura: { startedAt: <iso>, completed: ['E1','E2',...], hintsUsed: {'E1': [1,2], ...} }
// Sin estado en servidor → cualquier grupo puede compartir docker compose sin colisiones.

const COOKIE_NAME = 'tbd_progress';
const ALL_STATIONS = ['E1', 'E2', 'E3', 'E4'];

function emptyState() {
  return { startedAt: new Date().toISOString(), completed: [], hintsUsed: {} };
}

export function getProgress(req) {
  const raw = req.signedCookies?.[COOKIE_NAME];
  if (!raw) return emptyState();
  try {
    return JSON.parse(raw);
  } catch {
    return emptyState();
  }
}

export function saveProgress(res, state) {
  res.cookie(COOKIE_NAME, JSON.stringify(state), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 6 * 60 * 60 * 1000   // 6h, suficiente para una clase
  });
}

export function markCompleted(state, stationId) {
  if (!state.completed.includes(stationId)) state.completed.push(stationId);
  return state;
}

export function markHint(state, stationId, level) {
  if (!state.hintsUsed[stationId]) state.hintsUsed[stationId] = [];
  if (!state.hintsUsed[stationId].includes(level)) state.hintsUsed[stationId].push(level);
  return state;
}

export function allCompleted(state) {
  return ALL_STATIONS.every(id => state.completed.includes(id));
}

export function elapsedMinutes(state) {
  if (!state.startedAt) return null;
  const ms = Date.now() - new Date(state.startedAt).getTime();
  return Math.round(ms / 60000);
}

export function totalHintsUsed(state) {
  return Object.values(state.hintsUsed).reduce((acc, lvls) => acc + lvls.length, 0);
}

export { COOKIE_NAME, ALL_STATIONS };
