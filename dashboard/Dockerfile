FROM node:20-bookworm-slim

# Build tools necesarios para better-sqlite3 si no hay prebuild para la plataforma
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# Directorio para la BD de estado del juego (no expuesta al alumno)
RUN mkdir -p /data

COPY . .

# Pre-descargar el modelo de embeddings (mismo que el seeder) para que
# el endpoint /search-vectors funcione inmediatamente
RUN node -e "import('@xenova/transformers').then(({pipeline}) => pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'))"

EXPOSE 3000
CMD ["node", "server.js"]
