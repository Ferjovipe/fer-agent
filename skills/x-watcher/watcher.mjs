// =====================================================================
// X Watcher: reads X's "Latest" tab with the agents' Chrome and passes on
// only the tweets that have gained the requested interactions in the last few minutes.
// No API and no brain: it costs nothing. The functions below are tested without X (tests/watcher.test.mjs).
// =====================================================================
const inEnglish = (s, ...v) => String(s).replace(/\{(\d+)\}/g, (m, n) => (v[n - 1] === undefined ? m : String(v[n - 1])));   // without a dictionary: as it is

// The terms, grouped into "A OR B OR C" searches that X accepts (not too long)
export function buildSearches(terms, maxLength = 380) {
  const list = (terms || []).map((t) => String(t).trim()).filter(Boolean);
  const groups = []; let current = [];
  for (const t of list) {
    const trial = [...current, t].join(" OR ");
    if (current.length && trial.length > maxLength) { groups.push(current); current = [t]; } else current.push(t);
  }
  if (current.length) groups.push(current);
  return groups.map((g) => `(${g.join(" OR ")}) -filter:retweets`);
}

// What runs INSIDE the X page: it reads each tweet (text, author, time and counters)
export function readTweetsInPage() {
  const num = (t) => {
    const s = String(t || "").replace(/\s/g, "");
    const m = s.match(/([\d.,]+)(mill|mil|k|m)?/i);   // the long ones first: «1,2 mil» is 1,200, not 1.2 million
    if (!m) return 0;
    const suffix = (m[2] || "").toLowerCase();
    let n = suffix ? parseFloat(m[1].replace(",", ".")) : parseInt(m[1].replace(/[.,]/g, ""), 10);
    if (suffix === "k" || suffix === "mil") n *= 1e3; if (suffix === "m" || suffix === "mill") n *= 1e6;
    return Math.round(n) || 0;
  };
  const tally = (art, ids) => {
    for (const id of ids) {
      const b = art.querySelector('[data-testid="' + id + '"]');
      if (!b) continue;
      const ariaLabel = b.getAttribute("aria-label") || "";
      const m = ariaLabel.match(/\d[\d.,]*/);
      if (m) return parseInt(m[0].replace(/[.,]/g, ""), 10) || 0;   // the label carries the exact number
      return num(b.innerText);
    }
    return 0;
  };
  return [...document.querySelectorAll('article[data-testid="tweet"]')].map((art) => {
    const time = art.querySelector("time");
    const link = (time && time.closest('a[href*="/status/"]')) || art.querySelector('a[href*="/status/"]');
    const href = link ? link.getAttribute("href") : "";
    const m = href.match(/\/([^/?#]+)\/status\/(\d+)/);
    const social = art.querySelector('[data-testid="socialContext"]');
    return {
      id: m ? m[2] : "", author: m ? m[1] : "", url: m ? "https://x.com/" + m[1] + "/status/" + m[2] : "",
      ts: time ? Date.parse(time.getAttribute("datetime")) || 0 : 0,
      text: ((art.querySelector('[data-testid="tweetText"]') || {}).innerText || "").trim(),
      replies: tally(art, ["reply"]), reposts: tally(art, ["retweet", "unretweet"]), likes: tally(art, ["like", "unlike"]),
      repost: !!(social && /repost|retweet|reposte|retuite|compartió/i.test(social.innerText || ""))
    };
  }).filter((t) => t.id);
}

// The rule: which ones have gained at least "minimo" interactions in the last "minutos"?
export function applyRule(tweets, state, now, windowMinutes, minimum) {
  const seen = Object.assign({}, (state && state.seen) || {});
  const win = Math.max(1, Number(windowMinutes) || 10) * 60e3, min = Math.max(1, Number(minimum) || 3);
  const out = [], alreadyThere = new Set();
  for (const t of tweets) {
    if (!t.id || t.repost || alreadyThere.has(t.id)) continue;
    alreadyThere.add(t.id);
    const inter = (t.likes || 0) + (t.replies || 0) + (t.reposts || 0);
    const v = seen[t.id];
    let gain = null;
    if (t.ts && now - t.ts <= win) gain = inter;                                   // published within the window: it gained everything now
    else if (v && now - v.ts <= win * 2.5) gain = inter - v.inter;               // already seen on the previous round: what it has gained since then
    const qualifies = gain !== null && gain >= min;
    if (qualifies && !(v && v.rep)) out.push(Object.assign({}, t, { inter, gain }));
    seen[t.id] = { inter, ts: now, rep: !!(v && v.rep) || qualifies };
  }
  // forgotten: the ones not passed on from more than 3 windows ago and the ones passed on from more than a day ago
  for (const [id, v] of Object.entries(seen)) if (now - v.ts > (v.rep ? 86400e3 : win * 3)) delete seen[id];
  return { out, state: { seen } };
}

// The message (L translates it into the building's language; the tests use it without a dictionary or in Spanish)
export function formatTweets(out, now, windowMinutes, minimum, L = inEnglish) {
  if (!out.length) return "NOTHING";
  const ago = (ts) => { const m = Math.max(0, Math.round((now - ts) / 60e3)); return !ts ? "" : m < 60 ? L("{1} min ago", m) : L("{1} h ago", Math.round(m / 60)); };
  const header = out.length === 1 ? L("1 tweet has gained {1} or more interactions in the last {2} minutes:", minimum, windowMinutes) : L("{1} tweets have gained {2} or more interactions in the last {3} minutes:", out.length, minimum, windowMinutes);
  return header + "\n\n" + out.sort((a, b) => b.gain - a.gain).map((t, i) =>
    L("{1}. @{2} · {3} · {4} likes · {5} replies · {6} reposts (+{7})\n“{8}”\n{9}", i + 1, t.author, ago(t.ts), t.likes, t.replies, t.reposts, t.gain, String(t.text).replace(/\s+/g, " ").slice(0, 280), t.url)).join("\n\n");
}

// The Watcher's heartbeat
export default async function watcher(settings, h, ctx) {
  const a = Object.assign({ terms: [], windowMinutes: 10, minimum: 3, scrolls: 8, base: "https://x.com" }, settings || {});
  const queries = buildSearches(a.terms);
  if (!queries.length) throw new Error(h.L("The Watcher has no search terms: add them in its profile → Capabilities."));
  const now = h.now(), windowMs = a.windowMinutes * 60e3, allItems = [];
  let reviewed = 0;
  await h.withPage(async (p) => {
    for (const q of queries) {
      await p.goto(`${a.base}/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (/\/(i\/flow\/)?login/.test(p.url()) || await p.$('[data-testid="loginButton"]')) {
        throw Object.assign(new Error(h.L("X is asking you to sign in. Sign in once with the new account in the agents' Chrome: on the Fer Home computer, node fer-home.mjs login https://x.com/login")), { shown: true });
      }
      const present = await p.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 }).then(() => true).catch(() => false);
      if (!present) continue;
      const seen = new Map();
      for (let i = 0; i <= a.scrolls; i++) {
        for (const t of await p.evaluate(readTweetsInPage)) seen.set(t.id, t);
        const oldest = Math.min(...[...seen.values()].map((t) => t.ts || now));
        if (now - oldest > windowMs * 1.5) break;   // it already reaches tweets from before the window
        const before = seen.size;
        await p.evaluate(() => window.scrollBy(0, window.innerHeight * 1.8));
        await p.waitForTimeout(1300);
        if (i > 1 && seen.size === before) break;
      }
      reviewed += seen.size;
      allItems.push(...seen.values());
      await p.waitForTimeout(800 + Math.random() * 1200);   // calmly between searches, like a person
    }
  });
  const r = applyRule(allItems, ctx && ctx.state, now, a.windowMinutes, a.minimum);
  return { text: formatTweets(r.out, now, a.windowMinutes, a.minimum, h.L), state: r.state, summary: h.L("{1} tweets read in {2} searches; {3} meet the rule", reviewed, queries.length, r.out.length) };
}
