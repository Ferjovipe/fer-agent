# Installing Fer Agent

## On a Mac

1. Download the Mac installer (a .zip file containing Fer-Agent-mac.dmg). It works on any Mac, Apple chip or Intel.
2. Double-click the .zip and then the .dmg.
3. Drag «Fer Agent» to the Applications folder. If you had a version already, choose «Replace». You lose nothing: your building and your keys are kept apart.
4. Open Fer Agent from Applications.

### If the Mac says it can't verify the app

While the app doesn't carry Apple's signature, the Mac blocks it the first time. Two ways to open it:
- **Without Terminal**: open System Settings → Privacy & Security. At the bottom you'll see «Fer Agent was blocked»: press «Open Anyway».
- **With Terminal** (if it says the app «is damaged»): open Terminal, paste this and press Enter:
  xattr -dr com.apple.quarantine "/Applications/Fer Agent.app"
  Then open it normally.

### Mac permissions for «Your computer as you»

The first time an agent uses your computer, the Mac asks for two permissions for Fer Agent: **Accessibility** (clicking and typing) and **Screen Recording** (seeing the screen). They're given in System Settings → Privacy & Security. Then quit and open Fer Agent again.

While the app isn't signed by Apple, the Mac treats each new version as a different app: the Accessibility switch you turned on was for the previous version and the notice comes back. Fix: System Settings → Privacy & Security → Accessibility → select Fer Agent and press «−»; press «+», choose Fer Agent in Applications and turn it on; quit Fer Agent completely (Cmd+Q) and open it again.

There are two different «allow»s: the one in **Fer Agent's inbox** (your permission for the agent to do something specific) and the Mac's **Accessibility** (the Mac letting Fer Agent use the keyboard and mouse). Opening an app or asking it for something with a direct order (for example, creating a note in Notes) doesn't need Accessibility; clicking and typing do.

## On Windows

1. Download the Windows installer and open it.
2. If «Windows protected your PC» appears: press «More info» → «Run anyway».

## Updates

From 9.4 the app looks for a new version when it opens and every 6 hours. If there is one, it downloads it by itself and installs it when you close the app (the system tells you when it's ready). On a Mac this works once the app is signed by Apple; until then, the new version is installed by hand: download the installer and drag Fer Agent to Applications.

## Where your data is kept

- Mac: ~/Library/Application Support/Fer Agent/data
- Windows: %APPDATA%\Fer Agent\data

There you'll find your building, your keys (only on this computer), the documents you add to agents, your skills and the log fer-agent.log, in case something fails.

## Closing the app

- On a Mac, closing the window doesn't turn the building off: it stays in the Dock. To quit completely: Cmd+Q.
- On Windows, closing the window closes it.

## You need Google Chrome

For «Internet as you», the agents use the Google Chrome you have installed, with its own profile (the agents' Chrome). If you don't have Chrome, install it from google.com/chrome.
