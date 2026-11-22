# Common problems

**The Mac won't let me open the app.** System Settings → Privacy & Security → «Open Anyway». If it says it's damaged: in Terminal, xattr -dr com.apple.quarantine "/Applications/Fer Agent.app".

**The agent doesn't do anything by itself.** Check whether the building is paused (the heart at the top) and whether the agent is on «Only when asked» or off (Work → When it works).

**It says there's no balance or the key isn't valid.** Check the OpenRouter key in Settings and the balance at openrouter.ai/credits.

**A free brain fails a lot.** Free ones get overloaded often («too many requests»): the agent retries by itself in two minutes. If it always fails, choose another one or a cheap paid one.

**The agent can't browse or use its capabilities.** Its brain must «use tools»: look for it with the «Uses tools» filter. And the capability must be ticked in its profile.

**It doesn't get into my email or my website.** Open Settings → «Your websites, in the agents' Chrome» and sign in yourself once on that website.

**I already gave the Accessibility permission and the notice keeps coming up.** It happens when you install a new version while the app isn't signed by Apple: for the Mac it's another app. In Accessibility, remove Fer Agent with «−», add it again with «+» from Applications, turn it on and reopen Fer Agent (Cmd+Q and open). Pressing «Deny» on the notice doesn't fix it: press «Open System Settings».

**It can't control my apps on the Mac.** Give Fer Agent the Accessibility and Screen Recording permissions (System Settings → Privacy & Security) and open the app again.

**It doesn't find something in its documents.** Check in its profile that the document shows as read (a scanned PDF has no text). Ask with words that are in the document.

**It spent more than I expected.** Check the caps in Settings and the Activity: each expense says who, on what and how much.

**Something fails and I don't know what.** The log is in the data folder (fer-agent.log). Mac: ~/Library/Application Support/Fer Agent/data. Windows: %APPDATA%\Fer Agent\data.
