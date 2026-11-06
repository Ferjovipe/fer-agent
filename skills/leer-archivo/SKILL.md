---
name: leer-archivo
title: Leer de su carpeta
description: Lee un archivo de texto de la carpeta de los agentes en tu ordenador, o lista lo que hay en una de sus subcarpetas. No puede salir de esa carpeta.
efecto: lee
fija: false
datos: {"ruta": "notas/ejemplo.md"}
script: leer.mjs
---
# Leer de su carpeta

Los agentes tienen una carpeta propia en tu ordenador (por defecto, «datos/carpeta-agentes» dentro de Fer Casa). Esta skill lee un archivo de texto de ahí (.txt, .md, .csv, .json…) o lista una subcarpeta. Nunca puede leer fuera de esa carpeta.
