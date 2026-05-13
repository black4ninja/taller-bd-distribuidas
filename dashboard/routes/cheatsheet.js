import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

const router = Router();
const VALID = new Set(['postgres', 'mongo', 'redis', 'qdrant']);

router.get('/cheatsheet/:motor', async (req, res) => {
  const motor = req.params.motor;
  if (!VALID.has(motor)) return res.status(404).send('Cheatsheet no existe');
  const file = path.join(process.cwd(), 'cheatsheets', `${motor}.md`);
  try {
    const md = await fs.readFile(file, 'utf8');
    res.render('cheatsheet', { motor, html: marked.parse(md) });
  } catch (err) {
    res.status(500).send('No pude cargar el cheatsheet: ' + err.message);
  }
});

export default router;
