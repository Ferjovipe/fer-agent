# Security

## Reporting a problem

Please **don't open a public issue** for a security problem. Use **GitHub → Security → Report a vulnerability** on this repository; the report stays private. Say what you found, how to reproduce it, and which version (the app shows it at the bottom of the page).

Only the latest release gets fixes.

## How Fer Agent is built, as far as security goes

Knowing this helps you judge the risks and what counts as a problem.

- **Everything runs on your computer.** There is no Fer Agent server. Your keys stay in your browser (`localStorage`) or, with the desktop app or Fer Home, in `data/config.json` on that computer. They only travel to the API they belong to (OpenRouter, Anthropic, OpenAI…).
- **Fer Home's API is protected by a PIN.** In the desktop app it listens only on this computer (`127.0.0.1`) with a random 24-character PIN. On its own (`node fer-home.mjs`) it listens on your local network so your phone can reach it. There you choose the PIN (8 characters at least), and wrong PINs are slowed down: 5 per address lock that address for 1 minute, and 30 in 10 minutes close the API for 5 minutes. That traffic is plain HTTP, so **use it only on networks you trust**.
- **The desktop app** uses Electron with `contextIsolation`, `sandbox` and no Node in the page; links open in your browser, and the window can't be sent to other sites.
- **Agents can act.** With «Your computer as you», email, Telegram or skills that include a program, an agent acts with **your** permissions. That's the point of the product, and also its main risk.
- **Safeguards, not guarantees.** New and loaded agents start with **«Ask me first»**: anything with an effect outside (sending, publishing, buying, deleting…) waits for your yes in the inbox. JEV (the auditor), the spending caps, the general pause and the address firewall reduce mistakes, but they **don't stop everything**.
- **Prompt injection.** A web page, an email or a document can contain text written to fool an agent. This affects every AI agent. Give agents only the capabilities they need, and keep «Ask me first» for anything that matters.
- **Skills and floors from other people** contain instructions (and sometimes programs) that someone else wrote. Read them before installing them.

## Out of scope

- What an agent does with the permissions you gave it, or with «Without asking».
- Problems in the AI providers (OpenRouter, Anthropic, OpenAI…), in Chrome or in your operating system.
- The development and test dependencies that are never shipped in the app.
