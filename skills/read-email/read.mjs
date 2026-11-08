// Read the email: what has come into the inbox since the last time (it keeps where it got to: the UID of the last one).
// It reads without marking anything as read. The first time it starts from that moment.
// The emails it finds become a task for the agent's brain (work: true): summarise, sort and prepare the replies.
const MAX_TEXT = 4000;   // characters of each email that reach the brain

const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

export default async function readEmail(data, h, ctx) {
  const before = (ctx && ctx.state) || {};
  const max = Math.min(100, Math.max(1, Number(data.max) || 20));
  return await h.mailbox(async (c) => {
    const lock = await c.getMailboxLock("INBOX");
    try {
      const validity = String(c.mailbox.uidValidity || "");
      const top = Math.max(0, (Number(c.mailbox.uidNext) || 1) - 1);
      if (!before.lastUid && before.lastUid !== 0 || before.validity !== validity) {   // the first time (or the mailbox was rebuilt): from now on
        return { text: "NOTHING", summary: h.L("connected: from now on it reads what comes in"), state: { validity, lastUid: top } };
      }
      const found = c.mailbox.exists ? await c.search({ uid: `${before.lastUid + 1}:*` }, { uid: true }) : [];
      const uids = (found || []).filter((u) => u > before.lastUid).sort((a, b) => a - b).slice(0, max);
      if (!uids.length) return { text: "NOTHING", summary: h.L("no new email"), state: before };
      const parse = await h.mailParser();
      const mails = [];
      for await (const m of c.fetch(uids, { uid: true, source: true }, { uid: true })) {
        const p = await parse(m.source);
        mails.push({ uid: m.uid, from: (p.from && p.from.text) || "", replyTo: (p.replyTo && p.replyTo.text) || "", to: (p.to && p.to.text) || "", cc: (p.cc && p.cc.text) || "",
          subject: p.subject || "", date: p.date ? p.date.toISOString().slice(0, 16).replace("T", " ") : "", messageId: p.messageId || "",
          text: String(p.text || strip(p.html)).trim(), attachments: (p.attachments || []).map((x) => x.filename).filter(Boolean) });
      }
      mails.sort((a, b) => a.uid - b.uid);
      const text = mails.map((m, i) => [
        h.L("— Email {1} of {2} —", i + 1, mails.length),
        h.L("From: {1}", m.from), m.replyTo && m.replyTo !== m.from ? h.L("Reply to: {1}", m.replyTo) : "", h.L("To: {1}", m.to), m.cc ? h.L("Copy: {1}", m.cc) : "",
        h.L("Date: {1}", m.date), h.L("Subject: {1}", m.subject), m.messageId ? "Message-ID: " + m.messageId : "",
        m.attachments.length ? h.L("Attachments: {1}", m.attachments.join(", ")) : "",
        "", m.text.length > MAX_TEXT ? m.text.slice(0, MAX_TEXT) + " […]" : m.text
      ].filter((x, k) => x || k === 9).join("\n")).join("\n\n");
      return { text, summary: h.L("{1} new emails", mails.length), state: { validity, lastUid: uids.at(-1) }, work: true };
    } finally { lock.release(); }
  }, ctx && ctx.mailbox);   // 9.2: the agent's mailbox (its first one); without it, the first connected
}
