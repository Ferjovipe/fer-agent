"""Tests of the website in SPANISH (version 9: the program is written in English and Spanish is a translation).
A browser in Spanish, with nothing saved:
- the home page, the building, every profile, every screen and every drawer come out in Spanish (it looks for English left in what is shown);
- a new building is born in Spanish (Jefe, Sabio 1, Cúpula…) and what is said to the agents goes in Spanish;
- nothing the engine said was missing from textos/es.js.
Usage: python3 pruebas/web9_test.py   (leaves screenshots in pruebas/capturas/v9-es-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("servidor = subprocess.Popen")].replace("PUERTO = 8811", "PUERTO = 8817"))

pedidos = []
def router_es(route, request):
    if request.url == "https://openrouter.ai/api/v1/chat/completions" and request.method == "POST":
        b = json.loads(request.post_data); msgs = b["messages"]
        user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""})
        pedidos.append({"sys": str(msgs[0]["content"]), "user": user["content"] if isinstance(user["content"], str) else ""})
    return router(route, request)

# What is shown on screen, without the conversations (what the simulated agents write) nor what the user writes,
# nor the model names in the drop-downs (they are data: «Text Embedding 4»…)
VISIBLE = """(sel) => { const raiz = document.querySelector(sel); if (!raiz) return [];
  const fuera = (el) => el.closest('#mensajes .msg:not(.saludo) .burbuja, input, textarea, select, .serie-pj, script, style, [hidden]');
  const out = []; const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, el = n.parentElement; const t = n.nodeValue.trim();
    if (!t || !el || fuera(el)) continue; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (r.width === 0 && r.height === 0)) continue; out.push(t); }
  for (const el of raiz.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder','title','aria-label']) { const v = el.getAttribute(a); if (v && !el.closest('[hidden]')) out.push(v.trim()); }
  for (const el of raiz.querySelectorAll('select option, select optgroup')) { if (el.closest('[hidden]') || (el.value || '').includes('/')) continue; const v = el.tagName === 'OPTGROUP' ? el.label : el.textContent; if (v && v.trim()) out.push(v.trim()); }
  return out; }"""
# Words that only appear on the English side of the dictionary (and not in any Spanish translation), plus common English words
def _palabras(t): return set(w.lower() for w in re.findall(r"[A-Za-zÁÉÍÓÚáéíóúñÑ']{3,}", t))
_en, _es = set(), set()
for linea in open(os.path.join(RAIZ, "textos", "es.js"), encoding="utf8"):
    mm = re.match(r'\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?\s*$', linea)
    if mm: _en |= _palabras(json.loads(mm.group(1))); _es |= _palabras(json.loads(mm.group(2)))
SOLO_EN = _en - _es
EN = re.compile(r"\b(the|and|of|to|with|your|you|it's|its|is|are|this|that|from|for|what|when|each|have|can|by|not|there|they|their|will|which|who|how|building|agents?|floor|profile|spending|boss|sages?|meeting|coins?|brain|heartbeat|settings|inbox|tasks?|nothing|save|delete|create|remove|talk|backup)\b", re.I)
PERMITIDO = ["Fer Agent", "OpenRouter", "Google Drive", "Google", "Chrome", "Obsidian", "Whisper", "JEV", "Memory", "Jev Latest", "Credits", "Keys", "Create Key", "EN · English", "English", "skills", "skill", "Telegram"]
restos = {}
def ingles(page, sel, donde):
    malos = []
    for t in page.evaluate(VISIBLE, sel):
        x = t
        for p in PERMITIDO: x = x.replace(p, "")
        if EN.search(x) or (_palabras(x) & SOLO_EN): malos.append(t[:90])
    if malos: restos[donde] = sorted(set(malos))
    return malos
def foto(page, nombre): page.screenshot(path=os.path.join(SALIDA, "v9-es-" + nombre + ".png"))
def ficha_es(page, ag_id, tab=None):
    if page.is_visible("#vistaChat"): page.click("#cerrarChat")
    try:
        if page.is_visible(".volver"): page.click(".volver", timeout=2000)
    except Exception: pass
    sel = f".tramo .pj[data-id='{ag_id}']"
    if not page.is_visible(sel):
        e = estado(page); ag = next(a for a in e["agentes"] if a["id"] == ag_id)
        idx = [p["id"] for p in e["plantas"]].index(ag["planta"]); page.click(f".tramo >> nth={idx} >> .entrar"); page.wait_for_timeout(300)
        sel = f".pj[data-id='{ag_id}']"
    page.click(sel); page.wait_for_selector("#ficha .ficha-pestanas"); page.wait_for_timeout(200)
    if tab is not None: page.click(f"#ficha .ficha-pestanas button >> nth={tab}"); page.wait_for_timeout(250)

servidor = subprocess.Popen([sys.executable, "-m", "http.server", str(PUERTO), "--directory", RAIZ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1470, "height": 900}, locale="es-ES")
        ctx.add_init_script(INIT); ctx.route("https://**/*", router_es)
        page = ctx.new_page(); errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.wait_for_selector("#landing .heroe-txt")
        # ---------- Home page ----------
        check(page.inner_text("#landing h1") == "Tienes una empresa agéntica a tu servicio.", f"the home page in Spanish: «{page.inner_text('#landing h1')}»")
        check(page.evaluate("document.documentElement.lang") == "es", "the page says it is in Spanish (lang=es)")
        check(not ingles(page, "#landing", "portada"), f"home page with no English left: {restos.get('portada')}")
        foto(page, "1-portada")
        # ---------- Settings without a key ----------
        page.click("#landing .boton-grande >> nth=0"); page.wait_for_selector("#cajon:not([hidden])")
        check(not ingles(page, "#cajon", "ajustes sin clave"), f"Settings (no key) in Spanish: {restos.get('ajustes sin clave')}")
        check(page.inner_text("#cajonCuerpo .como-clave").startswith("¿Aún no tienes clave?"), "how to get the OpenRouter key, in Spanish")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tramo .pj")
        e = estado(page)
        check(e.get("idioma") == "es" and e["agentes"][0]["nombre"] == "Jefe" and [x["nombre"] for x in e["plantas"]] == ["Cúpula", "Vestíbulo"] and e["nombre"] == "Mi edificio",
              f"a new building is born in Spanish: {e.get('idioma')}, {e['agentes'][0]['nombre']}, {[x['nombre'] for x in e['plantas']]}, {e['nombre']}")
        check(e["agentes"][0]["cuerpo"].startswith("Eres el jefe del edificio") and e["ajustes"].get("carpetasCerebro", {}).get("memoria") == "Memoria larga",
              "the boss's instructions in Spanish, and the brain folders with Spanish names")
        check(not ingles(page, "body", "edificio solo jefe"), f"the building (only the boss) in Spanish: {restos.get('edificio solo jefe')}")
        # ---------- Built-in agents ----------
        page.click("#abrirSerie"); page.wait_for_selector("#vistaSerie .serie-ag")
        nombres = page.eval_on_selector_all("#vistaSerie .serie-nombre", "bs => bs.map(b => b.textContent)")
        check(nombres == ["Jefe", "Sabio 1", "Sabio 2", "Tecno", "Arturito", "Creador de agentes", "JEV", "Interventor", "Memory"], f"«Agentes de serie» with their Spanish names: {nombres}")
        check(not ingles(page, "#vistaSerie", "serie"), f"built-in agents page in Spanish: {restos.get('serie')}")
        page.click("#vistaSerie button:has-text('Instalar el equipo recomendado')"); page.wait_for_timeout(700)
        aviso = page.inner_text("#avisoFlotante") if page.is_visible("#avisoFlotante") else ""
        check(aviso.startswith("Instalados: Sabio 1, Sabio 2"), f"the notice in Spanish: «{aviso[:60]}»")
        tec = next(a for a in estado(page)["agentes"] if a["id"] == "tecno")
        check(tec["cuerpo"].startswith("Eres Tecno, el técnico del edificio"), "the team is installed in Spanish")
        page.click("#vistaSerie .volver-btn"); page.wait_for_selector("#vistaSerie", state="hidden")
        # ---------- Building, strips ----------
        page.wait_for_timeout(400)
        check(not ingles(page, "body", "edificio"), f"the whole building in Spanish: {restos.get('edificio')}")
        foto(page, "2-edificio")
        page.click("#verFranjas"); page.wait_for_selector(".fila-ag"); page.wait_for_timeout(300)
        check(not ingles(page, "body", "franjas"), f"«Franjas» and the directory in Spanish: {restos.get('franjas')}")
        page.click("#verDibujo"); page.wait_for_selector(".tramo.piso:not(.franja)")
        # ---------- Profiles (every tab) ----------
        for ag in ["jefe", "sabio1", "tecno", "arturito", "creador", "jev", "interventor", "memory"]:
            for tab in range(4):
                ficha_es(page, ag, tab)
                ingles(page, "#ficha", f"ficha {ag} {tab}")
        check(not any(k.startswith("ficha") for k in restos), "every profile (identity, work, brain, capabilities) in Spanish: " + "; ".join(f"{k}: {v}" for k, v in restos.items() if k.startswith("ficha"))[:1500])
        ficha_es(page, "tecno", 0); foto(page, "3-ficha")
        # ---------- Drawers ----------
        page.click("#abrirAjustes"); page.wait_for_selector("#cajonCuerpo h4"); page.wait_for_timeout(300)
        check(not ingles(page, "#cajon", "ajustes"), f"Settings in Spanish: {restos.get('ajustes')}")
        foto(page, "4-ajustes"); page.click("#cerrarCajon")
        page.click("#medidor"); page.wait_for_selector("#cajonCuerpo .quien-gasta"); page.wait_for_timeout(200)
        check(not ingles(page, "#cajon", "gasto"), f"Spending in Spanish: {restos.get('gasto')}")
        page.click("#cerrarCajon")
        page.click("#crearAgente"); page.wait_for_selector("#cajon:not([hidden])"); page.wait_for_timeout(300)
        check(not ingles(page, "#cajon", "crear agente"), f"Create agent in Spanish: {restos.get('crear agente')}")
        page.click("#cerrarCajon")
        page.click("#crearPiso"); page.wait_for_selector("#cajon:not([hidden])"); page.wait_for_timeout(200)
        check(not ingles(page, "#cajon", "crear piso"), f"Create floor in Spanish: {restos.get('crear piso')}")
        page.click("#cerrarCajon")
        ficha_es(page, "tecno", 0); page.click("#ficha .campo button.btn.mini >> nth=0"); page.wait_for_selector("#cajonCuerpo .pick4")
        check(page.inner_text("#cajonTitulo") == "Foto y nombre de Tecno" and not ingles(page, "#cajon", "foto"), f"Photo and name in Spanish: {page.inner_text('#cajonTitulo')} {restos.get('foto')}")
        ojos = page.get_attribute("#cajonCuerpo [aria-label='Ojos: verdes']", "title")
        check(ojos == "Ojos: verdes" and page.is_visible("#cajonCuerpo [aria-label='Ropa: verde']") and page.is_visible("#cajonCuerpo [aria-label='Pelo: canoso']"),
              f"colours agree in Spanish (ojos verdes, ropa verde, pelo canoso): {ojos}")
        page.click("#cerrarCajon")
        # ---------- Screens ----------
        for boton, vista, nombre in [("#abrirBandeja", "#vistaBandeja", "bandeja"), ("#abrirMes", "#vistaMes", "mes"), ("#abrirSalas", "#vistaSalas", "salas"), ("#abrirActividad", None, "actividad")]:
            page.click(boton); page.wait_for_timeout(500)
            ingles(page, vista or "body", nombre)
            if vista: page.click(f"{vista} .volver-btn"); page.wait_for_timeout(200)
        check(not any(k in restos for k in ["bandeja", "mes", "salas", "actividad"]), "Bandeja, Agente del mes, Reuniones and Actividad in Spanish: " + "; ".join(f"{k}: {restos[k]}" for k in ["bandeja", "mes", "salas", "actividad"] if k in restos)[:1200])
        # ---------- Chat with the boss: what is said to it, in Spanish ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.fill("#texto", "Hola, ¿quién eres?"); page.keyboard.press("Enter")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        s0 = next((x["sys"] for x in reversed(pedidos) if x["sys"].startswith("Eres el jefe del edificio")), "")
        check(s0 and "Te llamas Jefe" in s0 and "Regla: no inventes datos" in s0, "the boss is spoken to in Spanish (instructions, name, rule against making things up)")
        prohibidas = [w for w in ["You are ", "Your name", "Rule:", "Date and time", "Org chart", "You can use tools"] if w in s0]
        check(not prohibidas, f"and with no English pieces: {prohibidas}")
        check(not ingles(page, "#vistaChat", "chat"), f"the chat in Spanish (not counting what they write): {restos.get('chat')}")
        foto(page, "5-chat")
        page.click("#mensajes .msg.bot:not(.saludo) .moneda-btn >> nth=0")
        page.fill(".motivo-fila input", "Lo explicó muy claro"); page.click(".motivo-fila .btn.primario")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        check(not ingles(page, "#vistaChat", "chat2"), f"the chat, with coins, in Spanish: {restos.get('chat2')}")
        page.click("#cerrarChat")
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja .peticion")
        check(not ingles(page, "#vistaBandeja", "bandeja lección"), f"the inbox with the lesson, in Spanish: {restos.get('bandeja lección')}")
        page.click("#vistaBandeja .volver-btn")
        # ---------- The Creator designs an agent (in Spanish) ----------
        page.click("#crearAgente"); page.fill("#cajonCuerpo .creador textarea", "Quiero uno que planifique el menú de la semana")
        page.click("#cajonCuerpo .creador button"); page.wait_for_selector("#cajonCuerpo .porque")
        check(not ingles(page, "#cajon", "creador"), f"the profile the Creator proposes, in Spanish: {restos.get('creador')}")
        page.click("#cajonCuerpo button:text-is('Crear agente')"); page.wait_for_timeout(600)
        try:
            if page.is_visible(".volver"): page.click(".volver", timeout=2000)
        except Exception: pass
        page.click("#abrirMes"); page.wait_for_timeout(400)
        check(not ingles(page, "#vistaMes", "mes2"), f"«Agente del mes» with coins, in Spanish: {restos.get('mes2')}")
        page.click("#vistaMes .volver-btn")
        # ---------- A meeting ----------
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden]) .form-osc")
        page.fill(".form-osc input >> nth=0", "Plan de la semana"); page.fill(".form-osc textarea", "Qué publicamos y con qué presupuesto.")
        page.click(".elegir-asistentes label:has-text('Sabio 1') input"); page.fill(".form-osc input[type=number]", "1")
        page.click(".form-osc .btn.primario"); page.wait_for_selector(".mesa .asiento")
        page.click(".form-osc .btn.primario"); page.wait_for_selector("#vistaSalas .acta", timeout=20000)
        check(not ingles(page, "#vistaSalas", "sala"), f"the meeting room in Spanish: {restos.get('sala')}")
        foto(page, "6-sala")
        page.click("#vistaSalas .volver-btn")
        # ---------- Activity, after all of the above ----------
        page.click("#abrirActividad"); page.wait_for_timeout(500)
        check(not ingles(page, "body", "actividad2"), f"the activity (what the engine notes) in Spanish: {restos.get('actividad2')}")
        foto(page, "7-actividad")
        # ---------- Nothing the engine said was missing from the Spanish dictionary ----------
        sin = page.evaluate("async () => { const m = await import('./engine.js'); return [...m.SIN_TRADUCIR]; }")
        check([x for x in sin if x not in ("min", "h")] == [], f"the engine asked for no text missing from textos/es.js: {sin[:8]}")
        med = page.inner_text("#medHoy")
        check(re.search(r"\d,\d+ \$", med), f"money in Spanish format (0,0012 $): «{med}»")
        check(not errores, f"no errors on the page: {errores}")
        b.close()
finally:
    servidor.terminate()
if restos: print("ENGLISH LEFT IN THE SPANISH WEBSITE:\n" + "\n".join(f"  [{k}] {v}" for k, v in restos.items()))
print("RESULTADO:", "OK" if ok else "FALLOS")
sys.exit(0 if ok else 1)
