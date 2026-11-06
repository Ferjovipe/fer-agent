// Leer una web: el texto visible de una página, con el Chrome de los agentes
export default async function leer(datos, h) {
  const url = String((datos && datos.url) || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Dame una dirección web que empiece por http:// o https://");
  if (!(await h.esDireccionPublica(url))) throw new Error("Esa dirección es de tu red de casa, de este ordenador o interna: los agentes solo leen webs de internet.");
  return await h.conPagina(async (p) => {
    await h.soloInternet(p);
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(1500);
    const titulo = await p.title();
    const texto = await p.evaluate(() => (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim());
    const max = Math.min(40000, Math.max(1000, Number(datos.max) || 12000));
    return { texto: `Título: ${titulo}\nDirección: ${p.url()}\n\n${texto.slice(0, max)}${texto.length > max ? "\n\n[…recortado]" : ""}` };
  });
}
