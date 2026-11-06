---
name: read-email
title: Read the email
description: Each time it wakes up, it reads the emails that have come into the mailbox connected in Settings since the last time, and its brain summarises them, sorts them and prepares the replies. It doesn't mark anything as read or change anything in the mailbox.
effect: read
fixed: true
timeout: 180
settings: [{"key": "max", "type": "number", "name": "New emails per heartbeat (at most)", "help": "If more come in, it reads the rest on the next heartbeat.", "default": 20}]
script: read.mjs
---
# Read the email

**What it does.** On each heartbeat it looks at the inbox of the mailbox connected in Settings → Email and takes only what has come in since the last time. Looking costs nothing: if there's nothing new, the agent doesn't use its brain. If there are new emails, they become a task for its brain: summarise them, sort them and prepare the replies (with the "send-email" skill, which waits for your yes).

The first time, it starts from that moment: it doesn't go through all the email you already had.

It reads with IMAP and never marks an email as read, moves it or deletes it: the mailbox stays as it was.

**What it needs.** The desktop app or Fer Home, with the mailbox connected in Settings → Email (address, password and servers). A website on its own can't connect to a mailbox.
