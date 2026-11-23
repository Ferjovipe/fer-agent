# Contributing to Fer Agent

Thanks for wanting to help. Fer Agent is a personal open-source project, so contributions are reviewed in my spare time and I decide what goes in.

## Ways to help

- **Report a bug:** open an issue with what you did, what you expected, what happened, the version (bottom of the page) and your system (Mac, Windows, browser). For security problems, see [SECURITY.md](SECURITY.md) instead.
- **Share a floor:** a whole team of agents ready to load. See [community/floors/README.md](community/floors/README.md).
- **Share a skill:** a folder with a `SKILL.md` (the format of Claude, OpenClaw and Hermes). Users add it in Settings → Skills.
- **Translate it:** see «Adding a language» in the [README](README.md#adding-a-language).
- **Change the code:** read on.

## Running it

```
npm ci
node fer-home.mjs          # Fer Home: the building 24 h, opened from the address it prints
npm run app                # the desktop app (Electron)
```

Or open `index.html` in a browser: the building runs there while the page is open.

## Before sending a pull request

1. Keep it small and about one thing. Say what it changes for the person using the app, in plain words.
2. Run the tests (the list is in the README, under «Tests»). The engine ones need only Node; the website and app ones need Python with Playwright.
3. Every text the user sees is written in English and goes through the dictionary: add its translation to `languages/es.js`.
4. Don't add limits, organisation charts or ready-made floors that change how the product works without opening an issue first to discuss it.
5. No keys, tokens, personal data or real email addresses in code, tests or examples.

By contributing you agree that your contribution is published under the project's [MIT license](LICENSE).
