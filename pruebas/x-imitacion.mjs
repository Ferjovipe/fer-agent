// An imitation of the X website (only what the Watcher reads: articles, time, text and buttons with their number),
// to test the Watcher without going into X. The figures rise on each visit if asked (to test «has gained 3»).
export function paginaX({ ahora, tweets, login }) {
  if (login) return `<!doctype html><html><body><a data-testid="loginButton" href="/login">Iniciar sesión</a></body></html>`;
  const art = (t) => `
  <article data-testid="tweet">
    ${t.repost ? `<span data-testid="socialContext">${t.repost} reposteó</span>` : ""}
    <div><a href="/${t.autor}">@${t.autor}</a> · <a href="/${t.autor}/status/${t.id}"><time datetime="${new Date(ahora - t.haceMin * 60e3).toISOString()}">${t.haceMin} min</time></a></div>
    <div data-testid="tweetText" lang="es">${t.texto}</div>
    <div role="group">
      <button data-testid="reply" aria-label="${t.resp ? t.resp + " respuestas. Responder" : "Responder"}"><span>${t.resp || ""}</span></button>
      <button data-testid="retweet" aria-label="${t.rep ? t.rep + " reposts. Repostear" : "Repostear"}"><span>${t.rep || ""}</span></button>
      <button data-testid="${t.yaMeGusta ? "unlike" : "like"}" aria-label="${t.mg ? t.mg.toLocaleString("es-ES") + " Me gusta. Me gusta" : "Me gusta"}"><span>${t.visible || t.mg || ""}</span></button>
    </div>
  </article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>article{height:420px;border-bottom:1px solid #ccc}</style></head><body><main>${tweets.map(art).join("")}</main></body></html>`;
}
