---
name: escribir-archivo
title: Escribir en su carpeta
description: Guarda un archivo de texto en la carpeta de los agentes de tu ordenador (o añade al final de uno). Tiene efecto fuera de la web, así que cada vez pide tu permiso en la bandeja.
efecto: externo
fija: false
datos: {"ruta": "informes/hoy.md", "texto": "…", "anadir": false}
script: escribir.mjs
---
# Escribir en su carpeta

Escribe un archivo de texto dentro de la carpeta de los agentes. Si «anadir» es verdadero, lo pone al final del archivo en vez de sustituirlo. Nunca escribe fuera de esa carpeta y nunca borra.

Como cambia algo en tu ordenador, cada uso espera tu sí en la bandeja (o en Telegram).
