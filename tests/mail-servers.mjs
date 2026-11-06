// A fake mailbox on this computer for the tests: IMAP (to read) and SMTP (to send), with no network.
// Imported by email.test.mjs; run on its own (node tests/mail-servers.mjs) it starts both, says «ready» and prints each email sent, one JSON per line.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const hoodiecrow = require("hoodiecrow-imap");
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");

export const IMAP_PORT = Number(process.env.FAKE_IMAP_PORT) || 9143, SMTP_PORT = Number(process.env.FAKE_SMTP_PORT) || 9525;
export const USER = "office@acme.example", PASS = "app-password-1";
export const raw = (n, subject, body) => `From: Ana Ruiz <ana@client.example>\r\nTo: ${USER}\r\nSubject: ${subject}\r\nMessage-ID: <m${n}@client.example>\r\nDate: Fri, 06 Nov 2026 10:0${n}:00 +0100\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

export async function mailServers(onSent) {
  const imap = hoodiecrow({ plugins: ["ID", "UNSELECT", "ENABLE", "SPECIAL-USE", "LITERALPLUS"], users: { [USER]: { password: PASS } },
    storage: { INBOX: { messages: [{ raw: raw(1, "An old email", "This was already there before connecting.") }] } } });
  await new Promise((r) => imap.listen(IMAP_PORT, r));
  const sent = [];
  const smtp = new SMTPServer({ secure: false, disabledCommands: ["STARTTLS"], logger: false,
    onAuth(a, s, cb) { cb(a.username === USER && a.password === PASS ? null : Object.assign(new Error("Invalid credentials"), { responseCode: 535 }), { user: a.username }); },
    onData(stream, s, cb) { const parts = []; stream.on("data", (c) => parts.push(c)); stream.on("end", async () => { const m = await simpleParser(Buffer.concat(parts)); sent.push(m); if (onSent) onSent(m); cb(); }); } });
  await new Promise((r) => smtp.listen(SMTP_PORT, "127.0.0.1", r));
  return { imap, smtp, sent, close: () => { imap.close(); smtp.close(); } };
}

if (process.argv[1] && process.argv[1].endsWith("mail-servers.mjs")) {
  const s = await mailServers((m) => console.log(JSON.stringify({ sent: { to: m.to && m.to.text, subject: m.subject, inReplyTo: m.inReplyTo, text: m.text } })));
  // a new email arrives when a line «new» is written to it
  process.stdin.setEncoding("utf8");
  let n = 1;
  process.stdin.on("data", (d) => { for (const l of d.split("\n")) if (l.trim() === "new") { n++; s.imap.appendMessage("INBOX", [], new Date(), raw(n, "Proposal " + n, "Can you send me proposal " + n + " by Friday?")); console.log(JSON.stringify({ arrived: n })); } });
  process.stdin.on("end", () => { s.close(); process.exit(0); });
  console.log(JSON.stringify({ ready: true }));
}
