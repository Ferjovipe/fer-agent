---
name: vigia-x
title: Vigía de X
description: Cada vez que despierta, busca en X (pestaña «Más recientes») tweets sobre inteligencia artificial en cualquier idioma y te pasa solo los que en los últimos minutos han sumado las interacciones que digas. Lee la web de X con el Chrome de los agentes; no usa la API ni cerebro: no cuesta nada.
efecto: lee
fija: true
tiempo: 480
ajustes: [{"clave": "terminos", "tipo": "lista", "nombre": "Términos de búsqueda (uno por línea)", "ayuda": "Entre comillas, la frase exacta. Puedes quitar o añadir los que quieras.", "defecto": ["\"inteligencia artificial\"", "\"artificial intelligence\"", "\"intelligence artificielle\"", "\"künstliche Intelligenz\"", "\"intelligenza artificiale\"", "\"inteligência artificial\"", "\"искусственный интеллект\"", "\"人工智能\"", "\"人工知能\"", "\"인공지능\"", "\"الذكاء الاصطناعي\"", "\"yapay zeka\"", "\"kecerdasan buatan\"", "\"कृत्रिम बुद्धिमत्ता\"", "\"IA generativa\"", "\"generative AI\"", "\"agentes de IA\"", "\"AI agents\"", "LLM", "AGI", "ChatGPT", "OpenAI", "Anthropic", "\"Claude AI\"", "\"Google Gemini\"", "Grok", "xAI", "DeepSeek", "\"Mistral AI\"", "\"Meta AI\"", "Copilot", "Midjourney", "Perplexity", "Qwen"]}, {"clave": "minutos", "tipo": "numero", "nombre": "Ventana (minutos)", "ayuda": "Los tweets que hayan sumado las interacciones en estos minutos. Pon el mismo número que su latido.", "defecto": 10, "min": 1}, {"clave": "minimo", "tipo": "numero", "nombre": "Interacciones mínimas (me gusta + respuestas + reposts)", "defecto": 3, "min": 1}, {"clave": "desplazamientos", "tipo": "numero", "nombre": "Cuánto baja en cada búsqueda (veces)", "ayuda": "Más veces: ve más tweets, pero tarda más.", "defecto": 8, "min": 1}]
script: vigia.mjs
---
# Vigía de X

**Qué hace.** En cada latido (pon su latido cada 10 minutos) busca en X los términos de la lista, juntos en unas pocas búsquedas, en la pestaña «Más recientes». Lee cada tweet de la página: texto, autor, hora, me gusta, respuestas y reposts.

**La regla.** Te pasa un tweet si en los últimos minutos (los de «Ventana») ha sumado al menos el mínimo de interacciones (me gusta + respuestas + reposts):
- un tweet publicado dentro de esa ventana que ya las tiene, o
- uno más antiguo que el Vigía ya vio en la vuelta anterior y que desde entonces ha ganado ese mínimo.

Cada tweet te llega una sola vez. Los reposts sin texto propio no cuentan (son copias del original).

**Lo que necesita.** Fer Casa encendido y haber entrado una vez en X con la cuenta nueva en el Chrome de los agentes:  node fer-casa.mjs entrar https://x.com/login

**Ojo.** Es leer la web de X como lo harías tú. Las condiciones de X prohíben leerla de forma automática sin su permiso: X puede pedir verificaciones o cerrar esa cuenta. Por eso va con una cuenta nueva, separada de las tuyas. Si X cambia su web, puede que haya que retocar este lector.
