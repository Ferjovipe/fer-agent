---
name: send-email
title: Send an email
description: Sends an email from the mailbox connected in Settings. Each one waits for your yes in the inbox (or on Telegram): without it, nothing is sent.
effect: external
fixed: false
timeout: 60
data: {"to": "name@example.com", "subject": "…", "text": "…", "in_reply_to": "<Message-ID of the email it answers, if it's a reply>"}
script: send.mjs
---
# Send an email

Sends a plain-text email from the mailbox connected in Settings → Email. It has an effect outside the website, so each email waits in the inbox (or on Telegram) until you approve it; you see who it goes to, the subject and the whole text before it leaves.

To answer an email: "to" is the address of whoever wrote it (or its "Reply to"), the subject is "Re: " followed by its subject, and "in_reply_to" is its Message-ID, so the reply stays in the same thread.

**What it needs.** The desktop app or Fer Home, with the mailbox connected in Settings → Email.
