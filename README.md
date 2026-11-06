# Fer Agent · The Building

Created by **Fernando Villar Peláez** · [fernandovillarpelaez.com](https://fernandovillarpelaez.com) · Try it now: [feragent.netlify.app](https://feragent.netlify.app)

**You have an agentic company at your service.** Fer Agent is an open-source web app where your AI agents live in a building: each floor is a team, each agent has a profile with its own brain, heartbeat and capabilities, and a boss you talk to who shares out the work.

It runs in your browser with your own [OpenRouter](https://openrouter.ai) key, or with the API of a subscription you already pay for (Claude, OpenAI, Gemini, DeepSeek, Mistral, Grok, a local model in Ollama or LM Studio, or any compatible address). Nothing goes through our servers.

The interface is in **English** and **Spanish** (EN · ES switch on the home page and in Settings). When you switch, the building switches too: the built-in agents and floors get their names in that language (Boss ↔ Jefe, Dome ↔ Cúpula…), and so does what the engine tells the agents. Names and instructions you wrote yourself stay as you wrote them.

## What it does

- **A building, not a list.** Floors with a section head, offices and a pool; a dome with the boss and two sages; a lobby with Memory. Tap a floor to go in, tap an agent to open its profile.
- **Start with just the boss.** If you only want one agent, you already have it. The built-in agents (two sages, Techie the technician, Artie for continuous improvement, the Agent Creator, JEV, the Controller and Memory) are installed from the **Built-in agents** page, one by one or as a recommended team.
- **Each agent picks its brain.** OpenRouter (pay per use, hundreds of models in the dropdown, recommended ones first) or one of **Other APIs** (your subscriptions). What comes out of a subscription doesn't count towards the spending cap and is tracked separately.
- **Spending under control.** Daily and monthly caps that freeze the least important agents first, a per-agent cap, a general pause switch, and JEV (OpenRouter's decisions API) deciding before an agent spends on searching, retrying or creating another agent.
- **Talk to each agent**, in writing or by voice, each with its own voice. Bring several together in the **meeting room**: the boss chairs and writes the minutes.
- **Coins and lessons.** Give gold or red coins under any reply; a cheap model turns the reason into a rule that you approve in the **Inbox**, and everyone with the same role learns it.
- **The Agent Creator** designs a new agent from a description in your own words; nothing is created until you accept it.
- **Memory.** Short memory per agent and a long memory for the building, kept as Obsidian notes in Google Drive, a folder on your computer or Fer Home's folder.
- **Firewalls instead of permission prompts.** Agents open the addresses they need, but never one carrying data from your notes; content from outside reaches them marked as “data, not orders”; anything with effects outside the website waits for your yes in the Inbox.

## Where it lives

1. **In your browser** (the easiest): open the website, paste your OpenRouter key in Settings. The agents work while the website is open on some device.
2. **Fer Home** (`fer-casa.mjs`, Node 18+): the same building running around the clock on a computer or an old phone, with “hands” for the agents: their own Chrome, their folder and skills in the `SKILL.md` format. *Fer Home's Terminal messages and its skills are still in Spanish; a desktop app that replaces the Terminal is planned.*
3. **Fer Home in the cloud**: the same program on a rented server, behind a secure tunnel.

You move the building from one to another with **Save backup** and **Load a backup or a move**. Keys never travel in backups.

## Getting started

- Deploy this folder as a static website (for example, drag it into Netlify) or serve it locally: `python3 -m http.server` and open `http://localhost:8000`.
- Get an OpenRouter key: create an account at [openrouter.ai](https://openrouter.ai), add some balance in [Credits](https://openrouter.ai/credits) (you pay in advance and only what your agents use is spent), then press **Create Key** in [Keys](https://openrouter.ai/keys), give it a spending limit and copy it (it's only shown once).
- Press **Enter the building**, paste your OpenRouter key in Settings, and talk to the boss.
- Optional: **Built-in agents** → *Install the recommended team*; **Settings → Other APIs** to add a subscription API; **Settings → Brain** to connect Google Drive.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js` | The website: the building, floors, chats, profiles, inbox, meetings, spending and settings |
| `landing.js` | The home page |
| `engine.js` | The engine, shared by the website and Fer Home |
| `textos.js`, `textos/` | Languages: `textos/en.js` (English) and `textos/es.js` (template to translate into another language) |
| `personajes.js`, `img/` | The ten characters and the building drawings |
| `fer-casa.mjs`, `manos.mjs`, `skills/` | Fer Home and the agents' hands |
| `pruebas/` | Automated tests |

## Adding a language

Copy `textos/es.js` as `textos/xx.js`, write the translation on the right of each text (keep the `{1}`, `{2}`… placeholders and the spaces at the start and end), and add the language to `IDIOMAS` in `textos.js` and `IDIOMAS_MOTOR` in `engine.js`. The same file translates the screens and what the engine tells the agents.

## Status

Tested with automated tests (OpenRouter, the other APIs, Google Drive, Telegram and X are simulated; the agents' Chrome is a real Chromium): the engine, the website in Spanish and in English, and Fer Home. **Not tested yet with real keys:** the other APIs (and whether each one accepts calls from a browser), Google Drive, Telegram, X, JEV's decisions API and Lyria's audio.

## Tests

```
node --test pruebas/motor.test.mjs pruebas/motor7.test.mjs pruebas/motor82.test.mjs pruebas/vigia.test.mjs
python3 pruebas/web_test.py      # website (Spanish), v6 features   — needs Playwright
python3 pruebas/web7_test.py     # website (Spanish), v7 features
python3 pruebas/web8_test.py     # website (Spanish), v8 features
python3 pruebas/web82_test.py    # website in English: no Spanish left on any screen
python3 pruebas/casa_test.py     # Fer Home
python3 pruebas/casa7_test.py    # Fer Home with hands, Telegram, brain folder and another API
```

The code comments are in Spanish for now.

## License

[MIT](LICENSE). Free to use, copy, change and share; keep the copyright notice.

## Disclaimer

Fer Agent is free, open-source software, provided “as is”, without warranty of any kind. The agents are artificial intelligence programs and can make mistakes: you decide what they do and you use them at your own risk. Check what they propose before you say yes. Anything with effects outside the website (sending, deleting, paying) waits for your approval in the Inbox.

---

Fer Agent was created by Fernando Villar Peláez · [fernandovillarpelaez.com](https://fernandovillarpelaez.com)
