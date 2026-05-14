import { Router } from 'express';
import { listNotes, addNote, updateNote, deleteNote } from '../lib/game-state.js';

const router = Router();

router.get('/notes', (req, res) => {
  res.json({ notes: listNotes(req.playerId) });
});

router.post('/notes', (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'contenido requerido' });
  const r = addNote(req.playerId, content);
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.patch('/notes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'contenido requerido' });
  const r = updateNote(req.playerId, id, content);
  res.json({ ok: r.changes > 0 });
});

router.delete('/notes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = deleteNote(req.playerId, id);
  res.json({ ok: r.changes > 0 });
});

export default router;
