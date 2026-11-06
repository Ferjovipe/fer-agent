---
name: x-watcher
title: X Watcher
description: Each time it wakes up, it searches X (the "Latest" tab) for tweets about artificial intelligence in any language and passes you only the ones that have gained, in the last few minutes, the interactions you set. It reads the X website with the agents' Chrome; it doesn't use the API or a brain: it costs nothing.
effect: read
fixed: true
timeout: 480
settings: [{"key": "terms", "type": "list", "name": "Search terms (one per line)", "help": "In quotation marks, the exact phrase. You can remove or add whichever you like.", "default": ["\"inteligencia artificial\"", "\"artificial intelligence\"", "\"intelligence artificielle\"", "\"künstliche Intelligenz\"", "\"intelligenza artificiale\"", "\"inteligência artificial\"", "\"искусственный интеллект\"", "\"人工智能\"", "\"人工知能\"", "\"인공지능\"", "\"الذكاء الاصطناعي\"", "\"yapay zeka\"", "\"kecerdasan buatan\"", "\"कृत्रिम बुद्धिमत्ता\"", "\"IA generativa\"", "\"generative AI\"", "\"agentes de IA\"", "\"AI agents\"", "LLM", "AGI", "ChatGPT", "OpenAI", "Anthropic", "\"Claude AI\"", "\"Google Gemini\"", "Grok", "xAI", "DeepSeek", "\"Mistral AI\"", "\"Meta AI\"", "Copilot", "Midjourney", "Perplexity", "Qwen"]}, {"key": "windowMinutes", "type": "number", "name": "Window (minutes)", "help": "The tweets that have gained the interactions in these minutes. Use the same number as its heartbeat.", "default": 10, "min": 1}, {"key": "minimum", "type": "number", "name": "Minimum interactions (likes + replies + reposts)", "default": 3, "min": 1}, {"key": "scrolls", "type": "number", "name": "How far it scrolls down in each search (times)", "help": "More times: it sees more tweets, but takes longer.", "default": 8, "min": 1}]
script: watcher.mjs
---
# X Watcher

**What it does.** On each heartbeat (set its heartbeat to every 10 minutes) it searches X for the terms in the list, grouped into a few searches, in the "Latest" tab. It reads each tweet on the page: text, author, time, likes, replies and reposts.

**The rule.** It passes you a tweet if in the last minutes (the "Window" ones) it has gained at least the minimum of interactions (likes + replies + reposts):
- a tweet published within that window that already has them, or
- an older one the Watcher already saw on the previous round and that has gained that minimum since then.

Each tweet reaches you only once. Reposts with no text of their own don't count (they are copies of the original).

**What it needs.** Fer Home running and having signed in to X once with the new account in the agents' Chrome:  node fer-home.mjs login https://x.com/login

**Careful.** It's reading the X website as you would. X's terms forbid reading it automatically without its permission: X may ask for verifications or close that account. That's why it goes with a new account, separate from yours. If X changes its website, this reader may need retouching.
