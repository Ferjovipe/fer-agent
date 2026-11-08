---
name: write-file
title: Write in its folder
description: Saves a text file in the agents' folder on your computer (or adds to the end of one). It can't leave that folder, so it doesn't ask.
effect: read
fixed: false
data: {"path": "reports/today.md", "text": "…", "append": false}
script: write.mjs
---
# Write in its folder

Writes a text file inside the agents' folder. If "append" is true, it puts the text at the end of the file instead of replacing it. It never writes outside that folder and never deletes.

Since it changes something on your computer, each use waits for your yes in the inbox (or on Telegram).
