import { Router } from 'express';
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

const router = Router();

// El modelo se carga UNA SOLA VEZ al primer request y se mantiene en memoria.
let extractor = null;
async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  }
  return extractor;
}

router.post('/search-vectors', async (req, res) => {
  const { query, top = 3, collection = 'witness_testimonies' } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query es requerido (string)' });
  }
  try {
    const extract = await getExtractor();
    const output = await extract(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    const client = new QdrantClient({ url: process.env.QDRANT_URL });
    const results = await client.search(collection, {
      vector,
      limit: Math.min(parseInt(top, 10) || 3, 10),
      with_payload: true
    });
    res.json({
      query,
      top: results.map(r => ({
        id: r.id,
        score: r.score,
        text: r.payload?.text,
        witness_alias: r.payload?.witness_alias
      }))
    });
  } catch (err) {
    console.error('[search-vectors] error', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
