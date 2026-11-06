// Searching the internet for free: DuckDuckGo (HTML version) with the agents' Chrome
export default async function search(data, h) {
  const q = String((data && (data.query || data.query || data.q)) || "").trim();   // «consulta»: the name before version 9
  if (!q) throw new Error(h.L("Tell me what to search for (data: {query})."));
  const base = process.env.FER_SEARCH_ENGINE || "https://html.duckduckgo.com/html/";   // fixed: an agent can't change where the search goes
  return await h.withPage(async (p) => {
    await h.internetOnly(p);
    await p.goto(base + "?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 45000 });
    const res = await p.evaluate(() => [...document.querySelectorAll(".result")].map((r) => {
      const a = r.querySelector(".result__a"); let url = a ? a.getAttribute("href") || "" : "";
      try { const u = new URL(url, location.href); if (u.searchParams.get("uddg")) url = decodeURIComponent(u.searchParams.get("uddg")); else url = u.href; } catch {}
      return { title: a ? a.innerText.trim() : "", url, summary: ((r.querySelector(".result__snippet") || {}).innerText || "").trim() };
    }).filter((x) => x.title && /^https?:/.test(x.url)).slice(0, 8));
    if (!res.length) return { text: h.L("No results for “{1}” (or the search engine asked to check you're not a robot).", q) };
    return { text: h.L("Results for “{1}”:", q) + "\n\n" + res.map((x, i) => `${i + 1}. ${x.title}\n${x.url}\n${x.summary}`).join("\n\n") };
  });
}
