---
name: leer-web
title: Leer una web
description: Abre una página web en el Chrome de los agentes y devuelve su texto. Solo lee; no pulsa ni envía nada.
efecto: lee
fija: false
datos: {"url": "https://…"}
script: leer.mjs
---
# Leer una web

Abre la dirección en el Chrome de los agentes (con las sesiones que tengan iniciadas) y devuelve el título y el texto visible de la página, recortado a unos 12.000 caracteres.

Úsala para leer una noticia, una ficha de producto o una página que te pidan. No sirve para rellenar formularios ni para publicar.
