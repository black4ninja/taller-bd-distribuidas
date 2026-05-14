import { Router } from 'express';
import { HINTS } from '../lib/hints.js';
import {
  getStationOpenedAt,
  hintLevelUnlocked,
  markHintUsed,
  HINT_UNLOCK_SECONDS
} from '../lib/game-state.js';

const router = Router();

// Devuelve el contenido de la pista solo si el reloj de la estación ya alcanzó el desbloqueo.
router.get('/hints/:id/:level', (req, res) => {
  const id = req.params.id.toUpperCase();
  const level = parseInt(req.params.level, 10);
  if (!HINTS[id] || !HINTS[id][level]) {
    return res.status(404).json({ error: 'Pista no existe' });
  }
  const openedAt = getStationOpenedAt(req.playerId, id);
  if (!openedAt) {
    return res.status(403).json({ error: 'Estación no iniciada' });
  }
  const status = hintLevelUnlocked(openedAt, level);
  if (!status.unlocked) {
    return res.status(423).json({
      error: 'Pista bloqueada',
      unlocked: false,
      remainingSec: status.remainingSec
    });
  }
  markHintUsed(req.playerId, id, level);
  res.json({ level, content: HINTS[id][level] });
});

// Estado de desbloqueo de las 3 pistas de una estación (sin revelar contenido)
router.get('/hints-status/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const openedAt = getStationOpenedAt(req.playerId, id);
  if (!openedAt) return res.json({ openedAt: null, levels: { 1: null, 2: null, 3: null } });
  res.json({
    openedAt,
    levels: {
      1: hintLevelUnlocked(openedAt, 1),
      2: hintLevelUnlocked(openedAt, 2),
      3: hintLevelUnlocked(openedAt, 3)
    },
    unlockSeconds: HINT_UNLOCK_SECONDS
  });
});

export default router;
