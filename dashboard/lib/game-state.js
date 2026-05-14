import crypto from 'node:crypto';
import { stmts } from './db.js';

export const ALL_STATIONS = ['E1', 'E2', 'E3', 'E4'];
export const INITIAL_CREDIBILITY = 5;
export const HINT_UNLOCK_SECONDS = { 1: 5 * 60, 2: 10 * 60, 3: 15 * 60 };

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
  stmts.decrementCredibility.run(playerId);
}
export function markCaseSolved(playerId) {
  stmts.markCaseSolved.run(playerId);
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

export function elapsedSinceE1Open(playerId) {
  const opened = getStationOpenedAt(playerId, 'E1');
  if (!opened) return null;
  const player = getPlayer(playerId);
  // Si el caso terminó (resuelto o game over), el timer se congela en ese momento.
  let endMs = Date.now();
  if (player?.case_solved_at) endMs = Math.min(endMs, parseSqlTime(player.case_solved_at));
  if (player?.game_over_at)   endMs = Math.min(endMs, parseSqlTime(player.game_over_at));
  return Math.max(0, Math.floor((endMs - parseSqlTime(opened)) / 1000));
}

export function totalHintsUsed(playerId) {
  return getHintsUsed(playerId).length;
}
