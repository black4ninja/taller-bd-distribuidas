FROM node:20-bookworm-slim

WORKDIR /app

# Pre-cachear el modelo de embeddings descargandolo durante el build
# (evita que el primer up bloquee 60s descargando 80MB)
COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Warm-up del modelo: descarga ~80MB del modelo de embeddings en build-time
RUN node -e "import('@xenova/transformers').then(({pipeline}) => pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'))"

CMD ["node", "index.js"]
