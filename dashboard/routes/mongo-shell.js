import { Router } from 'express';
import { MongoClient } from 'mongodb';
import vm from 'node:vm';

const router = Router();

// Métodos permitidos en el "shell" del taller
const ALLOWED = new Set(['find', 'findOne', 'countDocuments', 'aggregate', 'distinct']);
const MAX_RESULTS = 100;

// Parser: acepta "db.<col>.<method>(args)"
function parseQuery(q) {
  const m = String(q).trim().match(/^db\.(\w+)\.(\w+)\s*\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) {
    throw new Error('Sintaxis esperada: db.<colección>.<método>(...).  Métodos: ' + [...ALLOWED].join(', '));
  }
  const [, collection, method, argsRaw] = m;
  if (!ALLOWED.has(method)) {
    throw new Error(`Método "${method}" no permitido. Permitidos: ${[...ALLOWED].join(', ')}`);
  }
  // Parse args en un sandbox VM minimalista (acepta object/array literals JS).
  // No tiene acceso a require/process/Buffer/etc — sólo evalúa literales.
  let args;
  try {
    args = vm.runInNewContext(`[${argsRaw || ''}]`, {}, { timeout: 500 });
  } catch (e) {
    throw new Error('No pude parsear los argumentos: ' + e.message);
  }
  return { collection, method, args };
}

async function execute({ collection, method, args }) {
  const client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  try {
    const coll = client.db('investigation').collection(collection);
    let result;
    if (method === 'find') {
      result = await coll.find(args[0] || {}, args[1] ? { projection: args[1] } : {}).limit(MAX_RESULTS).toArray();
    } else if (method === 'findOne') {
      result = await coll.findOne(args[0] || {}, args[1] ? { projection: args[1] } : {});
    } else if (method === 'countDocuments') {
      result = await coll.countDocuments(args[0] || {});
    } else if (method === 'aggregate') {
      result = await coll.aggregate(args[0] || [], { maxTimeMS: 5000 }).limit(MAX_RESULTS).toArray();
    } else if (method === 'distinct') {
      result = await coll.distinct(args[0], args[1] || {});
    }
    return result;
  } finally {
    await client.close().catch(() => {});
  }
}

router.post('/mongo-shell', async (req, res) => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 4000) {
    return res.status(400).json({ error: 'query es requerido (string, max 4000 chars)' });
  }
  try {
    const parsed = parseQuery(query);
    const result = await execute(parsed);
    const count = Array.isArray(result) ? result.length : (result === null || result === undefined ? 0 : 1);
    const truncated = Array.isArray(result) && count >= MAX_RESULTS;
    res.json({ ok: true, query: parsed, count, truncated, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
