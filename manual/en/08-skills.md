# Skills

Skills are extra abilities you add. They use the SKILL.md format of Claude, OpenClaw and Hermes: a folder with a SKILL.md file (name, description and instructions) and, if needed, its programs. So you can use the ones people share.

## Adding one (Settings → Skills)

- **Add a skill (folder)**: choose the folder that has the SKILL.md.
- **Add a skill (ZIP)**: choose the downloaded .zip.
- They're copied into the app's data (skills folder). **Open the folder of yours** shows it. **Remove** deletes one of yours.
- Each one says whether it's «built-in» or «yours», whether it «works on its own on each heartbeat», whether it «asks for your permission» and whether it's «with a program» or only «instructions».

## Giving it to an agent

In its profile → Capabilities → tick «Extra skills» and choose which. You can also put one in «On every heartbeat, without a brain (doesn't spend)» so it runs by itself every time it wakes up.

## How it uses them

- A skill that is **only instructions** (like Claude's): the agent receives its instructions to follow for that task, and the address of its folder. If it has programs and the agent has «Your computer as you», it can run them.
- A skill **with a program** runs on your computer. What it brings from outside arrives as data, not orders.

## Careful

A skill with a program runs on your computer with your permissions: add only the ones that come from someone you trust.

## The built-in ones

The X Watcher (searches for tweets about AI every time it wakes up) and reading the email. Reading websites, files and email are no longer skills: they're capabilities of each agent.
