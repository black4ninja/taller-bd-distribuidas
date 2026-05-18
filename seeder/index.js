import { seedPostgres } from './seeds/postgres.js';
import { seedMongo } from './seeds/mongo.js';
import { seedRedis } from './seeds/redis.js';
import { seedQdrant } from './seeds/qdrant.js';

const log = (msg) => console.log(`[seeder] ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Reintentos con backoff. Todos los seeds son idempotentes (si los datos ya
// existen, hacen skip), así que reintentar es seguro. Esto evita que un fallo
// transitorio (Qdrant aún no responde, descarga del modelo de embeddings se
// corta) haga `exit 1` y, con eso, que docker-compose no levante el dashboard.
async function retryStep(name, fn, { retries = 5, baseDelayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fn(log);
      return;
    } catch (err) {
      if (attempt === retries) {
        console.error(`[seeder] ${name}: agotados ${retries} intentos`);
        throw err;
      }
      const delay = baseDelayMs * attempt; // 3s, 6s, 9s, 12s...
      console.error(`[seeder] ${name}: intento ${attempt}/${retries} falló (${err.message}). Reintento en ${delay / 1000}s`);
      await sleep(delay);
    }
  }
}

async function main() {
  log('Iniciando seed cross-DB del taller "Crime Scene Investigation"');

  try {
    await retryStep('postgres', seedPostgres);
    await retryStep('mongo', seedMongo);
    await retryStep('redis', seedRedis);
    // Qdrant es el más lento (descarga ~80MB del modelo de embeddings):
    // más reintentos y más espera.
    await retryStep('qdrant', seedQdrant, { retries: 6, baseDelayMs: 5000 });
    log('OK - todos los motores fueron poblados de forma idempotente');
    process.exit(0);
  } catch (err) {
    console.error('[seeder] FALLO definitivo:', err);
    process.exit(1);
  }
}

main();
