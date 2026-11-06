---
name: read-web
title: Read a website
description: Opens a web page in the agents' Chrome and returns its text. It only reads; it doesn't click or send anything.
effect: read
fixed: false
data: {"url": "https://…"}
script: read.mjs
---
# Read a website

Opens the address in the agents' Chrome (with the sessions they have signed in to) and returns the title and the visible text of the page, cut to about 12,000 characters.

Use it to read a news story, a product page or a page you are asked about. It's not for filling in forms or publishing.
