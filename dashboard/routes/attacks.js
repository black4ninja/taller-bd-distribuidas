import { Router } from 'express';
import {
  ATTACK_STATIONS,
  getAttackStatus,
  applyDefense,
  devTriggerAttack,
  restoreFromBackup
} from '../lib/attacks.js';

const router = Router();

function validStation(id) {
  return ATTACK_STATIONS.includes(id);
}

router.get('/attack/:id/status', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!validStation(id)) return res.status(400).json({ error: 'Estación sin ataque pedagógico' });
  const status = await getAttackStatus(req.playerId, id);
  res.json(status);
});

router.post('/attack/:id/defend', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!validStation(id)) return res.status(400).json({ ok: false, error: 'Estación inválida' });
  const { defenseId, quizAnswer } = req.body || {};
  if (!defenseId) return res.status(400).json({ ok: false, error: 'defenseId requerido' });
  const result = await applyDefense(req.playerId, id, defenseId, quizAnswer);
  res.json(result);
});

router.post('/attack/:id/restore', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!validStation(id)) return res.status(400).json({ ok: false, error: 'Estación inválida' });
  const result = await restoreFromBackup(req.playerId, id);
  res.json(result);
});

router.post('/dev/trigger-attack/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!validStation(id)) return res.status(400).json({ ok: false, error: 'Estación inválida' });
  const result = await devTriggerAttack(req.playerId, id);
  res.json(result);
});

export default router;
