FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Pre-descargar el modelo de embeddings (mismo que el seeder) para que
# el endpoint /search-vectors funcione inmediatamente
RUN node -e "import('@xenova/transformers').then(({pipeline}) => pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'))"

EXPOSE 3000
CMD ["node", "server.js"]
