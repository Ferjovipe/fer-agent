# Telegram and the phone

## Each agent's own Telegram

Each agent can have its own Telegram bot: you talk to it from your phone as to a person and its reports reach you there.
1. In Telegram, talk to @BotFather, type /newbot and follow the steps: it gives you a token.
2. In the agent's profile → Capabilities → «Its own Telegram»: paste the token and «Connect».
3. Write anything to your bot. The first private chat that writes to it becomes yours; nobody else can talk to it.
The token is kept only on your computer. It works while the app (or Fer Home) is open.

## The building's Telegram (approvals)

Approvals (Send / Correct / Reject) can also reach you on Telegram, with the building's bot. It's set up in **Settings → Telegram: the inbox on your phone** (in the app or in Fer Home):
1. In Telegram, talk to @BotFather, send /newbot and follow the steps. It gives you a token.
2. Paste the token in Settings and press «Connect».
3. Press «Open @your_bot» (or find it in Telegram) and send it /start. The first private chat that writes to it becomes yours; nobody else can give it orders.

Settings shows «Connected» when your /start arrives. To remove it: «Disconnect». Use a different bot from any agent's. Commands: /inbox (what's waiting for your yes), /pause (stops everything automatic), /resume (starts it again). It still works from the Terminal too: node fer-home.mjs telegram.

## From the phone, without Telegram

- On your home network, with Fer Home: open its address in the phone's browser and enter the PIN.
- The website also works on the phone, but without hands.
