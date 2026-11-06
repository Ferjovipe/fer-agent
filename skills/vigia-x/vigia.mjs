// =====================================================================
// Vigía de X: lee la pestaña «Más recientes» de X con el Chrome de los agentes y pasa
// solo los tweets que en los últimos minutos han sumado las interacciones pedidas.
// Sin API y sin cerebro: no cuesta nada. Las funciones de abajo se prueban sin X (pruebas/vigia.test.mjs).
// =====================================================================

// Los términos, juntos en búsquedas de «A OR B OR C» que X acepte (no muy largas)
export function construirBusquedas(terminos, maxLargo = 380) {
  const lista = (terminos || []).map((t) => String(t).trim()).filter(Boolean);
  const grupos = []; let actual = [];
  for (const t of lista) {
    const prueba = [...actual, t].join(" OR ");
    if (actual.length && prueba.length > maxLargo) { grupos.push(actual); actual = [t]; } else actual.push(t);
  }
  if (actual.length) grupos.push(actual);
  return grupos.map((g) => `(${g.join(" OR ")}) -filter:retweets`);
}

// Lo que se ejecuta DENTRO de la página de X: lee cada tweet (texto, autor, hora y contadores)
export function leerTweetsEnPagina() {
  const num = (t) => {
    const s = String(t || "").replace(/\s/g, "");
    const m = s.match(/([\d.,]+)(mill|mil|k|m)?/i);   // primero las largas: «1,2 mil» son 1.200, no 1,2 millones
    if (!m) return 0;
    const suf = (m[2] || "").toLowerCase();
    let n = suf ? parseFloat(m[1].replace(",", ".")) : parseInt(m[1].replace(/[.,]/g, ""), 10);
    if (suf === "k" || suf === "mil") n *= 1e3; if (suf === "m" || suf === "mill") n *= 1e6;
    return Math.round(n) || 0;
  };
  const cuenta = (art, ids) => {
    for (const id of ids) {
      const b = art.querySelector('[data-testid="' + id + '"]');
      if (!b) continue;
      const al = b.getAttribute("aria-label") || "";
      const m = al.match(/\d[\d.,]*/);
      if (m) return parseInt(m[0].replace(/[.,]/g, ""), 10) || 0;   // la etiqueta trae el número exacto
      return num(b.innerText);
    }
    return 0;
  };
  return [...document.querySelectorAll('article[data-testid="tweet"]')].map((art) => {
    const time = art.querySelector("time");
    const enlace = (time && time.closest('a[href*="/status/"]')) || art.querySelector('a[href*="/status/"]');
    const href = enlace ? enlace.getAttribute("href") : "";
    const m = href.match(/\/([^/?#]+)\/status\/(\d+)/);
    const social = art.querySelector('[data-testid="socialContext"]');
    return {
      id: m ? m[2] : "", autor: m ? m[1] : "", url: m ? "https://x.com/" + m[1] + "/status/" + m[2] : "",
      ts: time ? Date.parse(time.getAttribute("datetime")) || 0 : 0,
      texto: ((art.querySelector('[data-testid="tweetText"]') || {}).innerText || "").trim(),
      respuestas: cuenta(art, ["reply"]), reposts: cuenta(art, ["retweet", "unretweet"]), megusta: cuenta(art, ["like", "unlike"]),
      repost: !!(social && /repost|retweet|reposte|retuite|compartió/i.test(social.innerText || ""))
    };
  }).filter((t) => t.id);
}

// La regla: ¿cuáles han sumado al menos «minimo» interacciones en los últimos «minutos»?
export function aplicarRegla(tweets, estado, ahora, minutos, minimo) {
  const vistos = Object.assign({}, (estado && estado.vistos) || {});
  const ventana = Math.max(1, Number(minutos) || 10) * 60e3, min = Math.max(1, Number(minimo) || 3);
  const salen = [], yaEsta = new Set();
  for (const t of tweets) {
    if (!t.id || t.repost || yaEsta.has(t.id)) continue;
    yaEsta.add(t.id);
    const inter = (t.megusta || 0) + (t.respuestas || 0) + (t.reposts || 0);
    const v = vistos[t.id];
    let gana = null;
    if (t.ts && ahora - t.ts <= ventana) gana = inter;                                   // publicado en la ventana: todo lo ganó ahora
    else if (v && ahora - v.ts <= ventana * 2.5) gana = inter - v.inter;               // ya visto en la vuelta anterior: lo que ha ganado desde entonces
    const cumple = gana !== null && gana >= min;
    if (cumple && !(v && v.rep)) salen.push(Object.assign({}, t, { inter, gana }));
    vistos[t.id] = { inter, ts: ahora, rep: !!(v && v.rep) || cumple };
  }
  // se olvidan: los no avisados de hace más de 3 ventanas y los avisados de hace más de un día
  for (const [id, v] of Object.entries(vistos)) if (ahora - v.ts > (v.rep ? 86400e3 : ventana * 3)) delete vistos[id];
  return { salen, estado: { vistos } };
}

export function formatear(salen, ahora, minutos, minimo) {
  if (!salen.length) return "NADA";
  const hace = (ts) => { const m = Math.max(0, Math.round((ahora - ts) / 60e3)); return !ts ? "" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
  const cab = `${salen.length} ${salen.length === 1 ? "tweet ha" : "tweets han"} sumado ${minimo} o más interacciones en los últimos ${minutos} minutos:`;
  return cab + "\n\n" + salen.sort((a, b) => b.gana - a.gana).map((t, i) =>
    `${i + 1}. @${t.autor} · ${hace(t.ts)} · ${t.megusta} me gusta · ${t.respuestas} respuestas · ${t.reposts} reposts (+${t.gana})\n«${String(t.texto).replace(/\s+/g, " ").slice(0, 280)}»\n${t.url}`).join("\n\n");
}

// El latido del Vigía
export default async function vigia(ajustes, h, ctx) {
  const a = Object.assign({ terminos: [], minutos: 10, minimo: 3, desplazamientos: 8, base: "https://x.com" }, ajustes || {});
  const busquedas = construirBusquedas(a.terminos);
  if (!busquedas.length) throw new Error("El Vigía no tiene términos de búsqueda: añádelos en su ficha → Capacidades.");
  const ahora = h.ahora(), ventana = a.minutos * 60e3, todos = [];
  let revisados = 0;
  await h.conPagina(async (p) => {
    for (const q of busquedas) {
      await p.goto(`${a.base}/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (/\/(i\/flow\/)?login/.test(p.url()) || await p.$('[data-testid="loginButton"]')) {
        throw Object.assign(new Error("X pide entrar. Entra una vez con la cuenta nueva en el Chrome de los agentes: en el ordenador de Fer Casa, node fer-casa.mjs entrar https://x.com/login"), { mostrado: true });
      }
      const hay = await p.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 }).then(() => true).catch(() => false);
      if (!hay) continue;
      const vistos = new Map();
      for (let i = 0; i <= a.desplazamientos; i++) {
        for (const t of await p.evaluate(leerTweetsEnPagina)) vistos.set(t.id, t);
        const masViejo = Math.min(...[...vistos.values()].map((t) => t.ts || ahora));
        if (ahora - masViejo > ventana * 1.5) break;   // ya llega a tweets de antes de la ventana
        const antes = vistos.size;
        await p.evaluate(() => window.scrollBy(0, window.innerHeight * 1.8));
        await p.waitForTimeout(1300);
        if (i > 1 && vistos.size === antes) break;
      }
      revisados += vistos.size;
      todos.push(...vistos.values());
      await p.waitForTimeout(800 + Math.random() * 1200);   // con calma entre búsquedas, como una persona
    }
  });
  const r = aplicarRegla(todos, ctx && ctx.estado, ahora, a.minutos, a.minimo);
  return { texto: formatear(r.salen, ahora, a.minutos, a.minimo), estado: r.estado, resumen: `${revisados} tweets leídos en ${busquedas.length} búsquedas; ${r.salen.length} cumplen la regla` };
}
