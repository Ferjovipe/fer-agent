// Send an email (only after your yes in the inbox): plain text, from the mailbox connected in Settings.
// If it's a reply, «in_reply_to» keeps it in the same thread.
export default async function sendEmail(data, h, ctx) {
  const to = String(data.to || "").trim(), text = String(data.text || "").trim(), subject = String(data.subject || "").trim().slice(0, 300);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+/.test(to.replace(/^.*</, ""))) throw new Error(h.L("Tell me who it goes to (data: {to, subject, text})."));
  if (!text) throw new Error(h.L("The email has no text."));
  const m = { to, subject, text };
  if (data.cc) m.cc = String(data.cc).trim();
  const re = String(data.in_reply_to || "").trim();
  if (re) { m.inReplyTo = re; m.references = re; }
  const info = await h.sendMail(m, data.mailbox || (ctx && ctx.mailbox));   // 9.2: from the mailbox the agent chose
  return { text: h.L("Sent to {1}: “{2}”.", (info.accepted || []).join(", ") || to, subject) };
}
