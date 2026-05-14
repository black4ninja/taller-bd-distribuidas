import crypto from 'node:crypto';
import { stmts } from './db.js';

export const ALL_STATIONS = ['E1', 'E2', 'E3', 'E4'];
export const INITIAL_CREDIBILITY = 5;
export const HINT_UNLOCK_SECONDS = { 1: 5 * 60, 2: 10 * 60, 3: 15 * 60 };
export const DEADLINE_SECONDS = 2 * 60 * 60; // 2 horas para resolver el caso

export function newPlayerId() { return crypto.randomUUID(); }
export function ensurePlayer(playerId) { stmts.ensurePlayer.run(playerId); }
export function getPlayer(playerId)    { return stmts.getPlayer.get(playerId); }

export function recordStationOpen(playerId, stationId) {
  stmts.recordOpen.run(playerId, stationId);
}
export function getStationOpenedAt(playerId, stationId) {
  return stmts.getOpen.get(playerId, stationId)?.opened_at || null;
}

export function getCompletedStations(playerId) {
  return stmts.getCompletedList.all(playerId).map(r => r.station_id);
}
export function isStationCompleted(playerId, stationId) {
  return !!stmts.isComplete.get(playerId, stationId);
}
export function markStationCompleted(playerId, stationId) {
  stmts.markComplete.run(playerId, stationId);
}

export function previousStationBlocking(playerId, stationId) {
  const idx = ALL_STATIONS.indexOf(stationId);
  if (idx <= 0) return null;
  const completed = new Set(getCompletedStations(playerId));
  for (let i = 0; i < idx; i++) {
    if (!completed.has(ALL_STATIONS[i])) return ALL_STATIONS[i];
  }
  return null;
}

export function recordSubmitAttempt(playerId, stationId, answer, correct) {
  stmts.recordAttempt.run(playerId, stationId, String(answer ?? '').slice(0, 500), correct ? 1 : 0);
}
export function decrementCredibility(playerId) {
  // Si la decrementación va a terminar el juego, congela el elapsed acumulado.
  const elapsed = computeLiveElapsed(playerId);
  stmts.decrementCredibility.run(elapsed, playerId);
}
export function markCaseSolved(playerId) {
  const elapsed = computeLiveElapsed(playerId);
  stmts.markCaseSolved.run(elapsed, playerId);
}

export function hintLevelUnlocked(openedAtIso, level) {
  if (!openedAtIso) return { unlocked: false, remainingSec: HINT_UNLOCK_SECONDS[level] };
  const elapsed = (Date.now() - parseSqlTime(openedAtIso)) / 1000;
  const need = HINT_UNLOCK_SECONDS[level];
  if (elapsed >= need) return { unlocked: true, remainingSec: 0 };
  return { unlocked: false, remainingSec: Math.ceil(need - elapsed) };
}

export function markHintUsed(playerId, stationId, level) {
  stmts.markHint.run(playerId, stationId, level);
}
export function getHintsUsed(playerId) {
  return stmts.getHintsUsed.all(playerId);
}

// Notas
export function listNotes(playerId)              { return stmts.listNotes.all(playerId); }
export function addNote(playerId, content)        { return stmts.addNote.run(playerId, String(content || '').slice(0, 2000)); }
export function updateNote(playerId, id, content) { return stmts.updateNote.run(String(content || '').slice(0, 2000), id, playerId); }
export function deleteNote(playerId, id)          { return stmts.deleteNote.run(id, playerId); }

// Helpers
export function parseSqlTime(s) {
  // SQLite CURRENT_TIMESTAMP devuelve 'YYYY-MM-DD HH:MM:SS' en UTC. Lo convertimos a ms.
  if (!s) return Date.now();
  if (s.endsWith('Z') || s.includes('T')) return new Date(s).getTime();
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

export function effectiveNowMs(playerId) {
  const player = getPlayer(playerId);
  return Date.now() + (player?.time_offset_ms || 0);
}

export function isGameStarted(playerId) {
  return !!getPlayer(playerId)?.started_at;
}

export function startGame(playerId) {
  stmts.startGame.run(playerId);
}

function computeLiveElapsed(playerId) {
  const player = getPlayer(playerId);
  if (!player?.started_at) return null;
  return Math.max(0, Math.floor((effectiveNowMs(playerId) - parseSqlTime(player.started_at)) / 1000));
}

export function elapsedSinceStart(playerId) {
  const player = getPlayer(playerId);
  if (player?.elapsed_at_end_seconds != null) return player.elapsed_at_end_seconds;
  return computeLiveElapsed(playerId);
}

// Alias retrocompatible (algunas vistas viejas pueden importar este nombre)
export const elapsedSinceE1Open = elapsedSinceStart;

export function deadlineRemainingSeconds(playerId, totalSeconds = DEADLINE_SECONDS) {
  const elapsed = elapsedSinceE1Open(playerId);
  if (elapsed == null) return totalSeconds;
  return Math.max(0, totalSeconds - elapsed);
}

export function checkAndApplyTimeout(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.game_over || player.case_solved_at) return false;
  const elapsed = computeLiveElapsed(playerId);
  if (elapsed == null || DEADLINE_SECONDS - elapsed > 0) return false;
  stmts.triggerTimeout.run(elapsed, playerId);
  return true;
}

export function accelerateTime(playerId, ms) {
  const player = getPlayer(playerId);
  if (player?.game_over || player?.case_solved_at) return; // no acelerar después del fin
  stmts.bumpTimeOffset.run(ms, playerId);
}

export function totalHintsUsed(playerId) {
  return getHintsUsed(playerId).length;
}
