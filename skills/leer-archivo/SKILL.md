---
name: leer-archivo
title: Read from its folder
description: Reads a text file from the agents' folder on your computer, or lists what's in one of its subfolders. It can't leave that folder.
efecto: lee
fija: false
datos: {"path": "notes/example.md"}
script: leer.mjs
---
# Read from its folder

The agents have a folder of their own on your computer (by default, "datos/carpeta-agentes" inside Fer Home). This skill reads a text file from there (.txt, .md, .csv, .json…) or lists a subfolder. It can never read outside that folder.
