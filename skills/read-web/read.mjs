// Reading a website: the visible text of a page, with the agents' Chrome
export default async function read(data, h) {
  const url = String((data && data.url) || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error(h.L("Give me a web address that starts with http:// or https://"));
  if (!(await h.isPublicAddress(url))) throw new Error(h.L("That address is on your home network, this computer or internal: the agents only read websites on the internet."));
  return await h.withPage(async (p) => {
    await h.internetOnly(p);
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(1500);
    const title = await p.title();
    const text = await p.evaluate(() => (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim());
    const max = Math.min(40000, Math.max(1000, Number(data.max) || 12000));
    return { text: h.L("Title: {1}\nAddress: {2}", title, p.url()) + `\n\n${text.slice(0, max)}${text.length > max ? "\n\n" + h.L("[…cut]") : ""}` };
  });
}
