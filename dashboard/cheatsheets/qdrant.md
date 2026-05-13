# Cheatsheet · Qdrant (vectorial)

> Qdrant guarda **vectores de N dimensiones** y permite buscar los más "similares" semánticamente.

## ¿Cuándo usar un motor vectorial en la vida real?

Las bases vectoriales (Qdrant, Pinecone, Weaviate, pgvector, Milvus) son **necesarias cuando buscas por significado, no por palabras exactas**. Casos donde son indispensables:

- **RAG para LLMs**: el patrón estándar para chatbots con conocimiento privado. Conviertes tus documentos en embeddings, los guardas en un vectorial, y cuando llega una pregunta del usuario buscas los chunks más relevantes para pasárselos al LLM como contexto.
- **Búsqueda semántica de productos**: usuario escribe "zapatos para correr en lluvia"; el e-commerce encuentra "tenis impermeables de running" aunque no compartan palabras.
- **Recomendación basada en contenido**: artículos, canciones, películas similares al que el usuario consumió.
- **Detección de duplicados / plagiarism**: comparar el embedding de un texto contra una base existente. Sin esto, detectar paráfrasis es muy difícil.
- **Búsqueda visual (CLIP)**: las imágenes también se embedan. "Encontrar productos visualmente similares a esta foto."
- **Detección de anomalías**: en logs, transacciones, comportamiento de usuarios. Lo que está "lejos" en el espacio vectorial es sospechoso.
- **Clustering automático**: agrupar quejas de soporte por tema sin tener que definir categorías a mano.

Casos típicos modernos: Spotify (canciones similares), Pinterest (búsqueda visual), Notion AI (RAG), customer support inteligente, fraud detection.

**Cuándo NO**: si las relaciones son exactas y discretas (un usuario tiene un email único, no "emails similares"), si necesitas transacciones ACID, si tu búsqueda es por filtros estructurados (precio, fecha, categoría) → para eso, SQL/Mongo siguen siendo mejores. Lo común es **combinar**: vectorial para el "qué busca el usuario", SQL para el "filtra por precio < X y stock > 0".

## ¿Qué es un vector aquí?

Es la representación matemática del *significado* de un texto. Dos textos que dicen lo mismo con palabras distintas tienen vectores **cercanos** en este espacio (Cosine similarity).

> Por eso buscar "entrenador entró al lab con bolsa negra" puede encontrar "instructor Carlos Méndez salió del Laboratorio CETEC cargando una mochila".

## Conexión vía Qdrant UI nativa

http://localhost:6333/dashboard

1. Click en "Collections" → verás `witness_testimonies`.
2. Click en el nombre. Verás los puntos (testimonios) indexados.

## Búsqueda semántica — usa el widget del dashboard

**No tienes que generar embeddings a mano.** Eso es complejo y requiere un modelo.

En la página de la estación E4 hay un widget de búsqueda. Pega el texto que encontraste como pista en Redis, pulsa "Buscar testimonios similares", y verás los 3 con mayor score.

## ¿Qué hace internamente el widget?

1. Envía tu texto al endpoint `/search-vectors` del dashboard.
2. El servidor usa el modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2` para convertirlo en un vector de 384 dims (soporta español).
3. Hace `client.search('witness_testimonies', { vector, limit: 3 })` en Qdrant.
4. Te devuelve los 3 testimonios más similares con su score.

## ¿Por qué un motor vectorial?

Si tuvieras los testimonios en PostgreSQL y buscaras con `LIKE '%entrenador%'`, **fallarías** cuando el testimonio diga "instructor" en lugar de "entrenador". El vectorial captura el SIGNIFICADO, no las palabras.

## Errores comunes

- Score muy bajo (< 0.4): la frase no está siendo capturada bien. Usa una frase más larga y descriptiva.
- "Collection not found": verifica el nombre exacto (`witness_testimonies`).
- Si abres la UI nativa y aparece un campo para buscar a mano, no la uses — necesita un vector, no un texto.
