// =====================================================================
// X Watcher: reads X's "Latest" tab with the agents' Chrome and passes on
// only the tweets that have gained the requested interactions in the last few minutes.
// No API and no brain: it costs nothing. The functions below are tested without X (pruebas/vigia.test.mjs).
// =====================================================================
const enIngles = (s, ...v) => String(s).replace(/\{(\d+)\}/g, (m, n) => (v[n - 1] === undefined ? m : String(v[n - 1])));   // without a dictionary: as it is

// The terms, grouped into "A OR B OR C" searches that X accepts (not too long)
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

// What runs INSIDE the X page: it reads each tweet (text, author, time and counters)
export function leerTweetsEnPagina() {
  const num = (t) => {
    const s = String(t || "").replace(/\s/g, "");
    const m = s.match(/([\d.,]+)(mill|mil|k|m)?/i);   // the long ones first: «1,2 mil» is 1,200, not 1.2 million
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
      if (m) return parseInt(m[0].replace(/[.,]/g, ""), 10) || 0;   // the label carries the exact number
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

// The rule: which ones have gained at least "minimo" interactions in the last "minutos"?
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
    if (t.ts && ahora - t.ts <= ventana) gana = inter;                                   // published within the window: it gained everything now
    else if (v && ahora - v.ts <= ventana * 2.5) gana = inter - v.inter;               // already seen on the previous round: what it has gained since then
    const cumple = gana !== null && gana >= min;
    if (cumple && !(v && v.rep)) salen.push(Object.assign({}, t, { inter, gana }));
    vistos[t.id] = { inter, ts: ahora, rep: !!(v && v.rep) || cumple };
  }
  // forgotten: the ones not passed on from more than 3 windows ago and the ones passed on from more than a day ago
  for (const [id, v] of Object.entries(vistos)) if (ahora - v.ts > (v.rep ? 86400e3 : ventana * 3)) delete vistos[id];
  return { salen, estado: { vistos } };
}

// The message (L translates it into the building's language; the tests use it without a dictionary or in Spanish)
export function formatear(salen, ahora, minutos, minimo, L = enIngles) {
  if (!salen.length) return "NOTHING";
  const hace = (ts) => { const m = Math.max(0, Math.round((ahora - ts) / 60e3)); return !ts ? "" : m < 60 ? L("{1} min ago", m) : L("{1} h ago", Math.round(m / 60)); };
  const cab = salen.length === 1 ? L("1 tweet has gained {1} or more interactions in the last {2} minutes:", minimo, minutos) : L("{1} tweets have gained {2} or more interactions in the last {3} minutes:", salen.length, minimo, minutos);
  return cab + "\n\n" + salen.sort((a, b) => b.gana - a.gana).map((t, i) =>
    L("{1}. @{2} · {3} · {4} likes · {5} replies · {6} reposts (+{7})\n“{8}”\n{9}", i + 1, t.autor, hace(t.ts), t.megusta, t.respuestas, t.reposts, t.gana, String(t.texto).replace(/\s+/g, " ").slice(0, 280), t.url)).join("\n\n");
}

// The Watcher's heartbeat
export default async function vigia(ajustes, h, ctx) {
  const a = Object.assign({ terminos: [], minutos: 10, minimo: 3, desplazamientos: 8, base: "https://x.com" }, ajustes || {});
  const busquedas = construirBusquedas(a.terminos);
  if (!busquedas.length) throw new Error(h.L("The Watcher has no search terms: add them in its profile → Capabilities."));
  const ahora = h.ahora(), ventana = a.minutos * 60e3, todos = [];
  let revisados = 0;
  await h.conPagina(async (p) => {
    for (const q of busquedas) {
      await p.goto(`${a.base}/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (/\/(i\/flow\/)?login/.test(p.url()) || await p.$('[data-testid="loginButton"]')) {
        throw Object.assign(new Error(h.L("X is asking you to sign in. Sign in once with the new account in the agents' Chrome: on the Fer Home computer, node fer-casa.mjs entrar https://x.com/login")), { mostrado: true });
      }
      const hay = await p.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 }).then(() => true).catch(() => false);
      if (!hay) continue;
      const vistos = new Map();
      for (let i = 0; i <= a.desplazamientos; i++) {
        for (const t of await p.evaluate(leerTweetsEnPagina)) vistos.set(t.id, t);
        const masViejo = Math.min(...[...vistos.values()].map((t) => t.ts || ahora));
        if (ahora - masViejo > ventana * 1.5) break;   // it already reaches tweets from before the window
        const antes = vistos.size;
        await p.evaluate(() => window.scrollBy(0, window.innerHeight * 1.8));
        await p.waitForTimeout(1300);
        if (i > 1 && vistos.size === antes) break;
      }
      revisados += vistos.size;
      todos.push(...vistos.values());
      await p.waitForTimeout(800 + Math.random() * 1200);   // calmly between searches, like a person
    }
  });
  const r = aplicarRegla(todos, ctx && ctx.estado, ahora, a.minutos, a.minimo);
  return { texto: formatear(r.salen, ahora, a.minutos, a.minimo, h.L), estado: r.estado, resumen: h.L("{1} tweets read in {2} searches; {3} meet the rule", revisados, busquedas.length, r.salen.length) };
}
