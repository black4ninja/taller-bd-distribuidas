import { Router } from 'express';
import { checkFlag } from '../lib/validators.js';
import { getProgress, allCompleted, elapsedMinutes, totalHintsUsed } from '../lib/progress.js';

const router = Router();

router.get('/solve', (req, res) => {
  const progress = getProgress(req);
  res.render('solve', { progress, locked: !allCompleted(progress) });
});

router.post('/solve', (req, res) => {
  const progress = getProgress(req);
  if (!allCompleted(progress)) {
    return res.status(403).json({ ok: false, error: 'Debes resolver las 4 estaciones primero.' });
  }
  const { killer_name, weapon, location } = req.body || {};
  const result = checkFlag({ killer: killer_name, weapon, location });
  res.json(result);
});

router.get('/victory', (req, res) => {
  const progress = getProgress(req);
  res.render('victory', {
    progress,
    elapsed: elapsedMinutes(progress),
    hints: totalHintsUsed(progress)
  });
});

export default router;
