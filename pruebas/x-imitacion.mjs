// Una imitación de la web de X (solo lo que lee el Vigía: artículos, hora, texto y botones con su número),
// para probar el Vigía sin entrar en X. Las cifras suben en cada visita si se pide (para probar «ha ganado 3»).
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
