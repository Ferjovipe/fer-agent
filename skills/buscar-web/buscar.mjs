// Buscar en internet gratis: DuckDuckGo (versión HTML) con el Chrome de los agentes
export default async function buscar(datos, h) {
  const q = String((datos && (datos.consulta || datos.q)) || "").trim();
  if (!q) throw new Error("Dime qué buscar (datos: {consulta}).");
  const base = process.env.FER_BUSCADOR || "https://html.duckduckgo.com/html/";   // fijo: un agente no puede cambiar a dónde va la búsqueda
  return await h.conPagina(async (p) => {
    await h.soloInternet(p);
    await p.goto(base + "?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 45000 });
    const res = await p.evaluate(() => [...document.querySelectorAll(".result")].map((r) => {
      const a = r.querySelector(".result__a"); let url = a ? a.getAttribute("href") || "" : "";
      try { const u = new URL(url, location.href); if (u.searchParams.get("uddg")) url = decodeURIComponent(u.searchParams.get("uddg")); else url = u.href; } catch {}
      return { titulo: a ? a.innerText.trim() : "", url, resumen: ((r.querySelector(".result__snippet") || {}).innerText || "").trim() };
    }).filter((x) => x.titulo && /^https?:/.test(x.url)).slice(0, 8));
    if (!res.length) return { texto: `Sin resultados para «${q}» (o el buscador pidió comprobar que no eres un robot).` };
    return { texto: `Resultados de «${q}»:\n\n` + res.map((x, i) => `${i + 1}. ${x.titulo}\n${x.url}\n${x.resumen}`).join("\n\n") };
  });
}
