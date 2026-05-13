# Cheatsheet · Qdrant (vectorial)

> Qdrant guarda **vectores de N dimensiones** y permite buscar los más "similares" semánticamente.

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
