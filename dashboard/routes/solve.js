import { Router } from 'express';
import { checkFlag } from '../lib/validators.js';
import {
  getCompletedStations,
  ALL_STATIONS,
  markCaseSolved,
  getPlayer,
  decrementCredibility,
  recordSubmitAttempt,
  totalHintsUsed,
  elapsedSinceStart,
  checkAndApplyTimeout,
  getCase
} from '../lib/game-state.js';

const router = Router();

function allCompleted(playerId) {
  const done = new Set(getCompletedStations(playerId));
  return ALL_STATIONS.every(s => done.has(s));
}

router.get('/solve', (req, res) => {
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  if (player?.game_over) return res.render('game-over', { player });
  const locked = !allCompleted(req.playerId);
  res.render('solve', { player, locked });
});

router.post('/solve', (req, res) => {
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  if (player?.game_over) {
    return res.status(403).json({ ok: false, game_over: true, game_over_reason: player.game_over_reason });
  }
  if (!allCompleted(req.playerId)) {
    return res.status(403).json({ ok: false, error: 'Debes resolver las 4 estaciones primero.' });
  }
  const { killer_name, weapon, location } = req.body || {};
  const caseObj = getCase(req.playerId);
  const result = checkFlag({ killer: killer_name, weapon, location }, caseObj);
  recordSubmitAttempt(req.playerId, 'SOLVE', `${killer_name}|${weapon}|${location}`, result.ok);
  if (result.ok) {
    markCaseSolved(req.playerId);
    return res.json(result);
  }
  decrementCredibility(req.playerId);
  const updated = getPlayer(req.playerId);
  return res.json({ ...result, credibility: updated.credibility, game_over: !!updated.game_over });
});

router.get('/victory', (req, res) => {
  const player = getPlayer(req.playerId);
  const player2 = getPlayer(req.playerId);
  const elapsedSec = player2?.started_at ? elapsedSinceStart(req.playerId) : null;
  res.render('victory', {
    player,
    elapsedMinutes: elapsedSec != null ? Math.round(elapsedSec / 60) : null,
    hintsCount: totalHintsUsed(req.playerId),
    completedCount: getCompletedStations(req.playerId).length
  });
});

export default router;
