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
- **Memory.** Short memory per agent and a long-term memory for the building, kept as Obsidian notes in Google Drive, a folder on your computer or Fer Home's folder. When a conversation goes quiet, Memory files what matters in it on its own, each fact under its topic and with where it came from (JEV decides first whether it's worth it). Searching is by keywords: only the pieces that matter reach a brain.
- **Email** (desktop app and Fer Home). Connect a mailbox in Settings and install the **Email** agent: it reads what comes in (looking costs nothing; it only spends when there's new email), summarises and sorts each email and prepares the replies. Each reply waits in the Inbox (or on Telegram) and leaves with one tap. It never marks, moves or deletes anything in the mailbox.
- **Firewalls instead of permission prompts.** Agents open the addresses they need, but never one carrying data from your notes; content from outside reaches them marked as “data, not orders”; anything with effects outside the website waits for your yes in the Inbox.

## Where it lives

1. **The desktop app** (Mac and Windows): download it from [Releases](https://github.com/Ferjovipe/fer-agent/releases), install it with a double click and paste your OpenRouter key in Settings. No Terminal. The agents work while the app is open, with “hands”: their own Chrome (it uses the Google Chrome installed on your computer), their folder and skills in the `SKILL.md` format.
2. **In your browser** (no install): open the website, paste your OpenRouter key in Settings. The agents work while the website is open on some device.
3. **Fer Home** (`fer-home.mjs`, Node 18+): the same program as the app, run from the Terminal, for an always-on computer, an old phone or a rented server behind a secure tunnel. It speaks its building's language in the Terminal and on Telegram.

You move the building from one to another with **Save backup** and **Load a backup or a move**. Keys never travel in backups.

## The desktop app

- **First time on a Mac:** the app isn't signed with an Apple certificate yet, so macOS says it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down and press **Open Anyway** (only once).
- **First time on Windows:** if you see “Windows protected your PC”, press **More info → Run anyway** (only once).
- **Your data** (building, keys, brain folder, the agents' Chrome profile) stays on your computer: on a Mac in `~/Library/Application Support/Fer Agent/data`, on Windows in `%APPDATA%\Fer Agent\data`. A log, `fer-agent.log`, is kept there too.
- **Your websites:** Settings → *Your websites, in the agents' Chrome* opens the agents' Chrome so you sign in once (your email, a social network…); the session stays on your computer.
- **Your email:** Settings → *Email*: address, password (many providers ask for an “app password”) and servers, guessed from the address. Press *Check*. The password stays on your computer.
- **The brain folder:** Settings → *Change the folder*. Choose one inside Google Drive for desktop and you also have it in Drive and Obsidian.
- **Building it yourself:** `npm install`, then `npm run app` to try it, or `npm run installers` to make the installer for your system. GitHub makes the Mac and Windows installers by itself (the *Desktop app* workflow in Actions).

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
| `languages.js`, `languages/` | Languages: the program is written in English; `languages/es.js` is the Spanish translation (and the model for any other language) |
| `characters.js`, `img/` | The ten characters and the building drawings |
| `fer-home.mjs`, `hands.mjs`, `skills/` | Fer Home and the agents' hands |
| `app/`, `build/`, `package.json` | The desktop app (Electron) and how its installers are made |
| `tests/` | Automated tests |

## Adding a language

The program is written in English. Copy `languages/es.js` (English on the left, Spanish on the right) as `languages/xx.js`, replace the right-hand side of each text with your translation (keep the `{1}`, `{2}`… placeholders and the spaces at the start and end), and add the language to `LANGUAGES` in `languages.js` and `ENGINE_LANGUAGES` in `engine.js`. The same file translates the screens and what the engine tells the agents.

## Status

Tested with automated tests (OpenRouter, the other APIs, Google Drive, Telegram and X are simulated; the agents' Chrome is a real Chromium): the engine, the website in Spanish and in English, and Fer Home. **Not tested yet with real keys:** the other APIs (and whether each one accepts calls from a browser), Google Drive, Telegram, X, JEV's decisions API and Lyria's audio.

## Tests

```
node --test tests/engine.test.mjs tests/engine7.test.mjs tests/engine82.test.mjs tests/engine9.test.mjs tests/watcher.test.mjs tests/memory.test.mjs tests/email.test.mjs
python3 tests/web_test.py        # website (Spanish), v6 features   — needs Playwright
python3 tests/web7_test.py       # website (Spanish), v7 features
python3 tests/web8_test.py       # website (Spanish), v8 features
python3 tests/web82_test.py      # website in English: no Spanish left on any screen
python3 tests/web9_test.py       # website in Spanish: no English left on any screen, nothing missing from the dictionary
python3 tests/web9_storage_test.py     # a browser that used an earlier version keeps its building, images and Library
python3 tests/home_test.py       # Fer Home
python3 tests/home7_test.py      # Fer Home with hands, Telegram, brain folder and another API
python3 tests/app9_test.py       # the desktop app inside: keys in Settings, local only, the agents' Chrome
node tests/app9_smoke.cjs dist/linux-unpacked/fer-agent    # the built app, opened for real (needs a screen or xvfb-run)
```


## License

[MIT](LICENSE). Free to use, copy, change and share; keep the copyright notice.

## Disclaimer

Fer Agent is free, open-source software, provided “as is”, without warranty of any kind. The agents are artificial intelligence programs and can make mistakes: you decide what they do and you use them at your own risk. Check what they propose before you say yes. Anything with effects outside the website (sending, deleting, paying) waits for your approval in the Inbox.

---

Fer Agent was created by Fernando Villar Peláez · [fernandovillarpelaez.com](https://fernandovillarpelaez.com)
