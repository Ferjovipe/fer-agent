// Reading a website: the visible text of a page, with the agents' Chrome
export default async function leer(datos, h) {
  const url = String((datos && datos.url) || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error(h.L("Give me a web address that starts with http:// or https://"));
  if (!(await h.esDireccionPublica(url))) throw new Error(h.L("That address is on your home network, this computer or internal: the agents only read websites on the internet."));
  return await h.conPagina(async (p) => {
    await h.soloInternet(p);
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(1500);
    const titulo = await p.title();
    const texto = await p.evaluate(() => (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim());
    const max = Math.min(40000, Math.max(1000, Number(datos.max) || 12000));
    return { texto: h.L("Title: {1}\nAddress: {2}", titulo, p.url()) + `\n\n${texto.slice(0, max)}${texto.length > max ? "\n\n" + h.L("[…cut]") : ""}` };
  });
}
