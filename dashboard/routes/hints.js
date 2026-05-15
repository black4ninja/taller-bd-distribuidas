import { Router } from 'express';
import { getHints } from '../lib/hints.js';
import {
  getStationOpenedAt,
  hintLevelUnlocked,
  markHintUsed,
  HINT_UNLOCK_SECONDS,
  getCase,
  effectiveNowMs
} from '../lib/game-state.js';

const router = Router();

router.get('/hints/:id/:level', (req, res) => {
  const id = req.params.id.toUpperCase();
  const level = parseInt(req.params.level, 10);
  const caseObj = getCase(req.playerId);
  const hints = getHints(id, caseObj);
  if (!hints[level]) {
    return res.status(404).json({ error: 'Pista no existe' });
  }
  const openedAt = getStationOpenedAt(req.playerId, id);
  if (!openedAt) {
    return res.status(403).json({ error: 'Estación no iniciada' });
  }
  const nowMs = effectiveNowMs(req.playerId);
  const status = hintLevelUnlocked(openedAt, level, nowMs);
  if (!status.unlocked) {
    return res.status(423).json({
      error: 'Pista bloqueada',
      unlocked: false,
      remainingSec: status.remainingSec
    });
  }
  markHintUsed(req.playerId, id, level);
  res.json({ level, content: hints[level] });
});

router.get('/hints-status/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const openedAt = getStationOpenedAt(req.playerId, id);
  if (!openedAt) return res.json({ openedAt: null, levels: { 1: null, 2: null, 3: null } });
  const nowMs = effectiveNowMs(req.playerId);
  res.json({
    openedAt,
    levels: {
      1: hintLevelUnlocked(openedAt, 1, nowMs),
      2: hintLevelUnlocked(openedAt, 2, nowMs),
      3: hintLevelUnlocked(openedAt, 3, nowMs)
    },
    unlockSeconds: HINT_UNLOCK_SECONDS
  });
});

export default router;
