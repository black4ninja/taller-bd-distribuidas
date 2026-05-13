import { seedPostgres } from './seeds/postgres.js';
import { seedMongo } from './seeds/mongo.js';
import { seedRedis } from './seeds/redis.js';
import { seedQdrant } from './seeds/qdrant.js';

const log = (msg) => console.log(`[seeder] ${msg}`);

async function main() {
  log('Iniciando seed cross-DB del taller "Crime Scene Investigation"');

  try {
    await seedPostgres(log);
    await seedMongo(log);
    await seedRedis(log);
    await seedQdrant(log);
    log('OK - todos los motores fueron poblados de forma idempotente');
    process.exit(0);
  } catch (err) {
    console.error('[seeder] FALLO:', err);
    process.exit(1);
  }
}

main();
