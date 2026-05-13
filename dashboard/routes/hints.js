import { Router } from 'express';
import { HINTS } from '../lib/hints.js';
import { getProgress, saveProgress, markHint } from '../lib/progress.js';

const router = Router();

router.get('/hints/:id/:level', (req, res) => {
  const id = req.params.id.toUpperCase();
  const level = parseInt(req.params.level, 10);
  if (!HINTS[id] || !HINTS[id][level]) {
    return res.status(404).json({ error: 'Pista no existe' });
  }
  const progress = getProgress(req);
  markHint(progress, id, level);
  saveProgress(res, progress);
  res.json({ level, content: HINTS[id][level] });
});

export default router;
