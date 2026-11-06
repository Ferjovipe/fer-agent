"""Tests of the website in ENGLISH (version 8.2). A browser in English, with nothing saved:
- the home page, the building, every profile, every screen and every drawer come out in English (it looks for Spanish left in what is shown);
- a new building is born in English (Boss, Sage 1, Dome…) and what is said to the agents goes in English;
- “MISSING:” works the same as “ME FALTA:”; the EN · ES button changes the language of the website and of the building.
Usage: python3 pruebas/web82_test.py   (leaves screenshots in pruebas/capturas/v82-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("servidor = subprocess.Popen")].replace("PUERTO = 8811", "PUERTO = 8816"))
INIT_EN = "\n".join(l for l in INIT.split("\n") if "ferAgent.idioma" not in l)   # no saved language: the browser decides
# the browser's voice, simulated: what it says and in which language is noted
VOZ = """window.__voces = [];
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__voces.push({ t: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 5); }, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, addEventListener() {}, removeEventListener() {} } });
window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ''; };"""

pedidos = []
def chat_en(b):
    msgs = b["messages"]; sys0 = str(msgs[0]["content"])
    user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""})
    ut = user["content"] if isinstance(user["content"], str) else " ".join(x.get("text", "") for x in user["content"])
    pedidos.append({"sys": sys0, "user": ut})
    if "Task:" in ut and "Techie" in sys0: return resp("MISSING: access to the company's email inbox.")
    if "You're in the meeting room" in sys0: return resp("My contribution: start with the cheapest option.", cost=0.0005)
    if "Write the minutes" in ut: return resp("## Conclusions\n- Start cheap.\n\n## Decisions\n- Review on Monday.", cost=0.0007)
    if sys0.startswith("You turn the reason for a coin"): return resp("Check the facts before answering.", cost=0.00002)
    if sys0.startswith("You are the Agent Creator"):
        return resp(json.dumps({"nombre": "Chef", "rol": "subagente", "planta": "nueva", "plantaNueva": {"nombre": "Kitchen", "funcion": "Menus and shopping"},
            "puesto": "pool", "cuerpo": "You prepare the weekly menu and the shopping list.", "objetivo": "A menu every Monday", "personalidad": "Friendly and brief.", "nivel": "economico",
            "latido": {"cada": 7, "unidad": "d"}, "alDespertar": "objetivo", "capacidades": ["escribir", "buscar"], "aspecto": {"p": "abuela", "ropa": "#2E9E5B"}, "porque": "Cheap and once a week."}), cost=0.004)
    if sys0.startswith("You are the building's boss"): return resp("Hello! I'm the boss of your building.")
    return resp("Hello from an agent.")
def router_en(route, request):
    if request.url == "https://openrouter.ai/api/v1/chat/completions" and request.method == "POST":
        b = json.loads(request.post_data); llamadas.append(b)
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=chat_en(b))
    return router(route, request)

# What is shown on screen, without the conversations (what the simulated agents write) nor what the user writes
VISIBLE = """(sel) => { const raiz = document.querySelector(sel); if (!raiz) return [];
  const fuera = (el) => el.closest('#mensajes .msg:not(.saludo) .burbuja, input, textarea, select, .serie-pj, script, style, [hidden]');   // los saludos sí cuentan: los escribe la web
  const out = []; const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, el = n.parentElement; const t = n.nodeValue.trim();
    if (!t || !el || fuera(el)) continue; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (r.width === 0 && r.height === 0)) continue; out.push(t); }
  for (const el of raiz.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder','title','aria-label']) { const v = el.getAttribute(a); if (v && !el.closest('[hidden]')) out.push(v.trim()); }
  // las opciones de los desplegables (no se ven hasta que se abren, pero son textos de la web)
  for (const el of raiz.querySelectorAll('select option, select optgroup')) { if (el.closest('[hidden]')) continue; const v = el.tagName === 'OPTGROUP' ? el.label : el.textContent; if (v && v.trim()) out.push(v.trim()); }
  return out; }"""
PERMITIDO = ["Fer Agent", "Biblioteca", "Memoria larga", "edificio.json", "datos/config.json", "datos/cerebro", "node fer-casa.mjs claves", "node fer-casa.mjs carpeta",
             "ES · Español", "Español", "JEV", "Índice"]
ES = re.compile(r"[áéíóúñ¿¡]|\b(el|la|los|las|del|que|para|por|con|una|tus|sus|está|están|hay|pero|sin|como|cuando|donde|qué|cómo|más|también|aquí|ahora|todo|todos|cada|este|esta|pulsa|edificio|agentes?|planta|piso|ficha|gasto|tope|jefe|sabios?|reuni[oó]n|monedas?|cerebro|latido|ajustes|bandeja|tareas?|nada|ningún|ninguna|guardar|borrar|crear|quitar|ver|hablar|pausa|copia)\b", re.I)
CORTAS = re.compile(r"(?<![\w'’-])(de|en|y|su|tu|se|es|un|al|lo|ya|mi|ve|sí|ti)(?![\w'’-])")   # short Spanish words, in lower case (EN · English doesn't count)
# also: any word that only appears in the dictionary's Spanish texts (and not in its English)
def _palabras(t): return set(w.lower() for w in re.findall(r"[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}", t))
_es, _en = set(), set()
for linea in open(os.path.join(RAIZ, "textos", "es.js"), encoding="utf8"):   # v9: English on the left, Spanish on the right
    m = re.match(r'\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?\s*$', linea)
    if m: _en |= _palabras(json.loads(m.group(1))); _es |= _palabras(json.loads(m.group(2)))
SOLO_ES = _es - _en - {"fer", "casa", "biblioteca", "memoria", "larga", "edificio", "json", "datos", "config", "cerebro", "node", "mjs", "claves", "carpeta", "tecno", "arturito", "jev", "memory", "español", "índice"}
restos = {}
def espanol(page, sel, donde):
    textos = page.evaluate(VISIBLE, sel)
    malos = []
    for t in textos:
        x = t
        for p in PERMITIDO: x = x.replace(p, "")
        if ES.search(x) or CORTAS.search(x) or (_palabras(x) & SOLO_ES): malos.append(t[:90])
    if malos: restos[donde] = sorted(set(malos))
    return malos
def foto(page, nombre, completa=False): page.screenshot(path=os.path.join(SALIDA, "v82-" + nombre + ".png"), full_page=completa)
def ficha_en(page, ag_id, tab=None):
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
        ctx = b.new_context(viewport={"width": 1470, "height": 900}, locale="en-US")
        ctx.add_init_script(INIT_EN); ctx.add_init_script(VOZ); ctx.route("https://**/*", router_en)
        page = ctx.new_page(); errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.wait_for_selector("#landing .heroe-txt")
        # ---------- Portada ----------
        bajar = page.locator("#landing .heroe .boton-borde")
        check(bajar.inner_text() == "Download the app" and bajar.get_attribute("href") == "https://github.com/Ferjovipe/fer-agent/releases/latest", "on the home page, “Download the app”: to the latest version on GitHub, without asking for anything")
        aviso = page.inner_text("#landing .aviso-l")
        check(aviso.startswith("Fer Agent is free, open-source software, provided “as is”") and "at your own risk" in aviso, f"the disclaimer, in English: “{aviso[:70]}”")
        check(page.inner_text("#landing h1") == "You have an agentic company at your service." and page.get_attribute(".idiomas-landing button[lang='en']", "aria-pressed") == "true",
              "a browser in English sees the home page in English (EN marked)")
        check(not espanol(page, "#landing", "portada"), f"home page with no Spanish left: {restos.get('portada')}")
        foto(page, "1-portada")
        # ---------- Going in: Settings without a key ----------
        page.click("#landing .boton-grande >> nth=0"); page.wait_for_selector("#cajon:not([hidden])")
        check(not espanol(page, "#cajon", "ajustes sin clave"), f"Settings (no key) in English: {restos.get('ajustes sin clave')}")
        como = page.inner_text("#cajonCuerpo .como-clave")
        enlaces = page.eval_on_selector_all("#cajonCuerpo .como-clave a", "as => as.map(a => a.href)")
        check(como.startswith("No key yet?") and "Create Key" in como and enlaces == ["https://openrouter.ai/", "https://openrouter.ai/credits", "https://openrouter.ai/keys"],
              f"how to get the OpenRouter key, in English and with its links: {como[:60]!r} {enlaces}")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key')) >> text=Save")
        page.wait_for_selector(".tramo .pj")
        e = estado(page)
        check(e.get("idioma") == "en" and e["agentes"][0]["nombre"] == "Boss" and [x["nombre"] for x in e["plantas"]] == ["Dome", "Lobby"] and e["nombre"] == "My building",
              f"a new building is born in English: {e.get('idioma')}, {e['agentes'][0]['nombre']}, {[x['nombre'] for x in e['plantas']]}, {e['nombre']}")
        check("You are the building's boss" in e["agentes"][0]["cuerpo"] and "Respondes" not in e["agentes"][0]["cuerpo"], "the boss's instructions, in English")
        check(not espanol(page, "body", "edificio solo jefe"), f"the building (only the boss) in English: {restos.get('edificio solo jefe')}")
        foto(page, "2-solo-boss")
        # ---------- Built-in agents ----------
        page.click("#abrirSerie"); page.wait_for_selector("#vistaSerie .serie-ag")
        nombres = page.eval_on_selector_all("#vistaSerie .serie-nombre", "bs => bs.map(b => b.textContent)")
        check(nombres == ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"], f"“Built-in agents” with their English names: {nombres}")
        check(not espanol(page, "#vistaSerie", "serie"), f"built-in agents page in English: {restos.get('serie')}")
        foto(page, "3-serie")
        page.click("#vistaSerie button:has-text('Install the recommended team')"); page.wait_for_timeout(700)
        check(page.is_visible("#avisoFlotante") and page.inner_text("#avisoFlotante").startswith("Installed: Sage 1, Sage 2"), f"notice in English: {page.inner_text('#avisoFlotante')[:60] if page.is_visible('#avisoFlotante') else ''}")
        e = estado(page)
        tec = next(a for a in e["agentes"] if a["id"] == "tecno")
        check(tec["cuerpo"].startswith("You are Techie, the building's technician") and [x["nombre"] for x in e["plantas"]] == ["Dome", "Tech floor", "Lobby"], "the team is installed in English (instructions and floors)")
        page.click("#vistaSerie .volver-btn"); page.wait_for_selector("#vistaSerie", state="hidden")
        # ---------- Edificio, franjas ----------
        page.wait_for_timeout(400)
        check(not espanol(page, "body", "edificio"), f"the whole building in English: {restos.get('edificio')}")
        foto(page, "4-edificio")
        page.click("#verFranjas"); page.wait_for_selector(".fila-ag"); page.wait_for_timeout(300)
        check(not espanol(page, "body", "franjas"), f"“Strips” and the directory in English: {restos.get('franjas')}")
        page.click("#verDibujo"); page.wait_for_selector(".tramo.piso:not(.franja)")
        # ---------- Profiles (every tab) ----------
        for ag in ["jefe", "sabio1", "tecno", "arturito", "creador", "jev", "interventor", "memory"]:
            for tab in range(4):
                ficha_en(page, ag, tab)
                espanol(page, "#ficha", f"ficha {ag} {tab}")
        check(not any(k.startswith("ficha") for k in restos), "every profile (identity, work, brain, capabilities) in English: " + "; ".join(f"{k}: {v}" for k, v in restos.items() if k.startswith("ficha"))[:1500])
        ficha_en(page, "tecno", 0); foto(page, "5-ficha")
        # ---------- Cajones ----------
        page.click("#abrirAjustes"); page.wait_for_selector("#cajonCuerpo h4"); page.wait_for_timeout(300)
        check(not espanol(page, "#cajon", "ajustes"), f"Settings in English: {restos.get('ajustes')}")
        foto(page, "6-ajustes"); page.click("#cerrarCajon")
        page.click("#medidor"); page.wait_for_selector("#cajonCuerpo .quien-gasta"); page.wait_for_timeout(200)
        check(not espanol(page, "#cajon", "gasto"), f"Spending in English: {restos.get('gasto')}")
        page.click("#cerrarCajon")
        page.click("#crearAgente"); page.wait_for_selector("#cajon:not([hidden])"); page.wait_for_timeout(300)
        check(not espanol(page, "#cajon", "crear agente"), f"Create agent in English: {restos.get('crear agente')}")
        page.click("#cerrarCajon")
        page.click("#crearPiso"); page.wait_for_selector("#cajon:not([hidden])"); page.wait_for_timeout(200)
        check(not espanol(page, "#cajon", "crear piso"), f"Create floor in English: {restos.get('crear piso')}")
        page.click("#cerrarCajon")
        ficha_en(page, "tecno", 0); page.click("#ficha .campo button.btn.mini >> nth=0"); page.wait_for_selector("#cajonCuerpo .pick4")
        check(page.inner_text("#cajonTitulo") == "Photo and name of Techie" and not espanol(page, "#cajon", "foto"), f"Photo and name in English: {page.inner_text('#cajonTitulo')} {restos.get('foto')}")
        page.click("#cerrarCajon")
        # ---------- Pantallas ----------
        for boton, vista, nombre in [("#abrirBandeja", "#vistaBandeja", "bandeja"), ("#abrirMes", "#vistaMes", "mes"), ("#abrirSalas", "#vistaSalas", "salas"), ("#abrirActividad", None, "actividad")]:
            page.click(boton); page.wait_for_timeout(500)
            espanol(page, vista or "body", nombre)
            if vista: page.click(f"{vista} .volver-btn"); page.wait_for_timeout(200)
        check(not any(k in restos for k in ["bandeja", "mes", "salas", "actividad"]), "Inbox, Agent of the month, Meetings and Activity in English: " + "; ".join(f"{k}: {restos[k]}" for k in ["bandeja", "mes", "salas", "actividad"] if k in restos)[:1200])
        # ---------- Chat with the boss: what is said to it, in English ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.fill("#texto", "Hello, who are you?"); page.keyboard.press("Enter")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        s0 = pedidos[-1]["sys"]
        check(s0.startswith("You are the building's boss") and "Your name is Boss. Your role: Boss." in s0 and "Rule: don't make up data" in s0 and "Date and time:" in s0, "the boss is spoken to in English (instructions, name, rule against making things up)")
        prohibidas = [w for w in ["Eres ", "Tu nombre", "Regla:", "Fecha y hora", "Organigrama", "Puedes usar herramientas"] if w in s0]
        check(not prohibidas, f"and with no Spanish pieces: {prohibidas}")
        saludo = page.inner_text("#mensajes .msg.saludo .burbuja >> nth=0")
        check(saludo.startswith("Hi, I'm the boss of My building. Tell me what you need"), f"the boss's greeting, in English: “{saludo[:80]}”")
        check(not espanol(page, "#vistaChat", "chat"), f"the chat in English (not counting what they write): {restos.get('chat')}")
        foto(page, "7-chat")
        # a gold coin: the cheap model turns it into a rule (in English) and it reaches the inbox
        page.click("#mensajes .msg.bot:not(.saludo) .moneda-btn >> nth=0")
        page.fill(".motivo-fila input", "It explained it clearly"); page.click(".motivo-fila .btn.primario")
        page.wait_for_selector("text=Proposed lesson", timeout=15000)
        lec_sys = next((x["sys"] for x in reversed(pedidos) if x["sys"].startswith("You turn the reason for a coin")), "")
        check("In English, in the imperative" in lec_sys, "the coin becomes a lesson with instructions in English")
        check(not espanol(page, "#vistaChat", "chat2"), f"the chat, with coins, in English: {restos.get('chat2')}")
        page.click("#cerrarChat")
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja .peticion")
        check(not espanol(page, "#vistaBandeja", "bandeja lección"), f"the inbox with the lesson, in English: {restos.get('bandeja lección')}")
        page.click("#vistaBandeja .peticion:has-text('New lesson') button:text-is('Approve')"); page.wait_for_timeout(400)
        page.click("#vistaBandeja .volver-btn")
        # the Creator designs an agent (in English) and it's created
        page.click("#crearAgente"); page.fill("#cajonCuerpo .creador textarea", "I want one that plans the weekly menu")
        page.click("#cajonCuerpo .creador button"); page.wait_for_selector("#cajonCuerpo .porque")
        cre_sys = next((x["sys"] for x in reversed(pedidos) if x["sys"].startswith("You are the Agent Creator")), "")
        check("Reply ONLY with a JSON object" in cre_sys and '"nombre"' in cre_sys and "Floors of the building" in cre_sys, "the Creator is asked for the profile in English (with the usual keys)")
        check(not espanol(page, "#cajon", "creador"), f"the profile the Creator proposes, in English: {restos.get('creador')}")
        page.click("#cajonCuerpo button:text-is('Create agent')"); page.wait_for_timeout(600)
        check(any(a["nombre"] == "Chef" for a in estado(page)["agentes"]) and any(x["nombre"] == "Kitchen" for x in estado(page)["plantas"]), "the agent it designed is created, on its new floor")
        try:
            if page.is_visible(".volver"): page.click(".volver", timeout=2000)
        except Exception: pass
        page.click("#abrirMes"); page.wait_for_timeout(400)
        check(not espanol(page, "#vistaMes", "mes2"), f"“Agent of the month” with coins, in English: {restos.get('mes2')}")
        page.click("#vistaMes .volver-btn")
        # ---------- Chat with Techie: its greeting; “Try its voice” speaks in English ----------
        ficha_en(page, "tecno", 0); page.click("#ficha button:text-is('Talk to Techie')"); page.wait_for_selector("#vistaChat:not([hidden])")
        saludo = page.inner_text("#mensajes .msg.saludo .burbuja >> nth=0")
        check(saludo.startswith("Hi, I'm Techie, technician (Tech floor).") and not espanol(page, "#mensajes", "saludo tecno"), f"Techie's greeting, in English: “{saludo[:90]}” {restos.get('saludo tecno')}")
        page.click("#cerrarChat")
        ficha_en(page, "tecno", 3); page.select_option("#ficha .campo:has(> span:text-is('Voice model')) select", "browser"); page.wait_for_timeout(300)   # the browser's voice (OpenRouter's reads the text as it is)
        page.click("#ficha button:text-is('Try its voice')"); page.wait_for_timeout(400)
        voces = page.evaluate("window.__voces")
        dicho = " ".join(v["t"] for v in voces)
        check(dicho == "Hi, I'm Techie. This is how I sound." and all(v["lang"] == "en-US" for v in voces), f"“Try its voice” speaks in English and with an English voice: {voces}")
        # ---------- «MISSING:» ----------
        ficha_en(page, "tecno", 1)
        page.fill("#ficha input[placeholder='Give it a job…']", "Answer the customers' emails"); page.click("#ficha button:text-is('Assign')"); page.wait_for_timeout(300)
        ficha_en(page, "tecno", 0); page.click("#ficha button:text-is('Wake up now')")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.find(a => a.id === 'tecno').falta", timeout=15000)
        t = next(a for a in estado(page)["agentes"] if a["id"] == "tecno")
        tarea_sys = next((x["sys"] for x in reversed(pedidos) if "Techie" in x["sys"] and "Task:" in x["user"]), "")
        check("reply exactly: NOTHING" in tarea_sys and "MISSING:" in tarea_sys, "an agent at work is asked for “NOTHING” and “MISSING:” in English")
        check(t["falta"] and "email inbox" in t["falta"]["texto"] and any(x["resultado"].startswith("Missing: ") for x in t["tareas"]), f"“MISSING:” is understood: it's missing something and doesn't go ahead on its own ({t['falta']})")
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja .peticion")
        check(page.is_visible("#vistaBandeja .peticion:has-text('Missing something')") and not espanol(page, "#vistaBandeja", "bandeja2"), f"and it reaches the inbox, in English: {restos.get('bandeja2')}")
        foto(page, "8-bandeja")
        page.click("#vistaBandeja .volver-btn")
        # ---------- Meeting ----------
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden]) .form-osc")
        page.fill(".form-osc input >> nth=0", "Weekly plan"); page.fill(".form-osc textarea", "Agenda: what we publish and on what budget.")
        page.click(".elegir-asistentes label:has-text('Sage 1') input"); page.fill(".form-osc input[type=number]", "1")
        page.click(".form-osc .btn.primario"); page.wait_for_selector(".mesa .asiento")
        check(page.inner_text("#vistaSalas .orden").lower().count("agenda") == 1, f"“Agenda” only once: {page.inner_text('#vistaSalas .orden')[:60]}")
        page.click(".form-osc .btn.primario"); page.wait_for_selector("#vistaSalas .acta", timeout=20000)
        r = estado(page)["reuniones"][-1]
        reu = [x["sys"] for x in pedidos if "meeting room" in x["sys"] or "chair the meeting" in x["sys"]]
        check(r["estado"] == "terminada" and "## Decisions" in r["acta"] and len(reu) >= 3 and all("in English" in x or "chair the meeting" in x for x in reu), f"the meeting is held in English (chair, contributions and minutes): {r['estado']}, {len(reu)} calls")
        check(not espanol(page, "#vistaSalas", "sala"), f"the room in English: {restos.get('sala')}")
        foto(page, "9-sala")
        page.click("#vistaSalas .volver-btn")
        # ---------- Activity, after all of the above ----------
        page.click("#abrirActividad"); page.wait_for_timeout(500)
        check(not espanol(page, "body", "actividad2"), f"the activity (what the engine records) in English: {restos.get('actividad2')}")
        foto(page, "10-actividad")
        # ---------- Nothing the engine said or recorded was left untranslated ----------
        sin = page.evaluate("async () => { const m = await import('./engine.js'); return [...m.SIN_TRADUCIR]; }")
        check(sin == [], f"the engine asked for no text missing from the dictionary: {sin[:8]}")
        # ---------- Money in English format ----------
        med = page.inner_text("#medHoy")
        check(re.search(r"\$\d", med) and "," not in med.split("$")[-1][:3], f"money in English format ($0.0012): “{med}”")
        # ---------- Switching to Spanish with the home page's button ----------
        page.click("#irPortada"); page.wait_for_selector("#landing .idiomas-landing")
        page.click(".idiomas-landing button[lang='es']"); page.wait_for_load_state("load"); page.wait_for_selector("#landing .heroe-txt"); page.wait_for_timeout(800)
        check(page.inner_text("#landing h1") == "Tienes una empresa agéntica a tu servicio." and estado(page).get("idioma") == "es", "ES · Español: the website and the building move to Spanish")
        n_ag = next(a for a in estado(page)["agentes"] if a["id"] == "sabio1")["nombre"]
        check(n_ag == "Sabio 1", f"the built-in names change with the language ({n_ag})")
        check(not errores, f"no errors on the page: {errores[:3]}")
        # ---------- A building that was already in Spanish moves to English: the built-in parts, in English; what the owner wrote, as it is ----------
        ctx2 = b.new_context(viewport={"width": 1470, "height": 900}, locale="es-ES")
        ctx2.add_init_script(INIT); ctx2.add_init_script(VOZ); ctx2.route("https://**/*", router_en)
        pg = ctx2.new_page(); errores2 = []; pg.on("pageerror", lambda e: errores2.append(str(e)))
        pg.goto(URL); pg.wait_for_selector("#landing .heroe-txt")
        pg.click("#landing .boton-grande >> nth=0"); pg.wait_for_selector("#cajon:not([hidden])")
        pg.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); pg.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        pg.wait_for_selector(".tramo .pj")
        pg.click("#abrirSerie"); pg.wait_for_selector("#vistaSerie .serie-ag"); pg.click("#vistaSerie button:has-text('Instalar el equipo recomendado')"); pg.wait_for_timeout(600)
        pg.click("#vistaSerie .volver-btn"); pg.wait_for_selector("#vistaSerie", state="hidden")
        # like the real building: a sage renamed by its owner and a floor created by them
        pg.evaluate("""() => { const e = JSON.parse(localStorage.getItem('ferEdificio.estado'));
          e.agentes.find(a => a.id === 'sabio2').nombre = 'Consejera ChatGPT Pro';
          e.plantas.splice(1, 0, { id: 'p_redes', nombre: 'Redes Sociales', funcion: 'Publicar en redes', tipo: 'piso', oficinas: 3, pools: 1 });
          localStorage.setItem('ferEdificio.estado', JSON.stringify(e)); }""")
        pg.reload(); pg.wait_for_load_state("load")
        try: pg.wait_for_selector("#landing .heroe-txt", timeout=5000); pg.click("#landing .boton-grande >> nth=0")   # after reloading, the home page appears
        except Exception: pass
        pg.wait_for_selector(".tramo .pj")
        check(estado(pg)["idioma"] == "es" and pg.inner_text("#hablarJefe") == "Hablar con Jefe", "before: the building, in Spanish")
        pg.click("#abrirAjustes"); pg.wait_for_selector("#cajonCuerpo h4")
        pg.select_option("#cajonCuerpo .campo:has(> span:text-matches('^Idioma')) select", "en"); pg.wait_for_load_state("load"); pg.wait_for_timeout(1200)
        if pg.is_visible("#landing .heroe-txt"): pg.click("#landing .boton-grande >> nth=0")
        pg.wait_for_selector(".tramo .pj"); pg.wait_for_timeout(400)
        despues = estado(pg)
        nombres = [a["nombre"] for a in despues["agentes"]]; plantas = [x["nombre"] for x in despues["plantas"]]
        check(despues.get("idioma") == "en" and nombres == ["Boss", "Sage 1", "Consejera ChatGPT Pro", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]
              and sorted(plantas) == ["Dome", "Lobby", "Redes Sociales", "Tech floor"] and despues["nombre"] == "My building",
              f"Settings → Language → English: the built-in parts move to English; what the owner wrote stays ({nombres}, {plantas}, {despues['nombre']})")
        jefe = next(a for a in despues["agentes"] if a["id"] == "jefe")
        check(jefe["cuerpo"].startswith("You are the building's boss"), f"its built-in instructions, in English: {jefe['cuerpo'][:50]!r}")
        boton = pg.inner_text("#hablarJefe"); placas = pg.eval_on_selector_all(".tramo .placa", "ps => ps.map(p => p.textContent.trim())")
        check(boton == "Talk to Boss" and all(any(n in x for x in placas) for n in ["Dome", "Tech floor", "Lobby", "Redes Sociales"]), f"on screen: “{boton}”, signs {placas}")
        permitidos = PERMITIDO[:]
        PERMITIDO[:0] = ["Consejera ChatGPT Pro", "Redes Sociales", "Publicar en redes"]
        ficha_en(pg, "jefe", 0)
        check(not espanol(pg, "body", "edificio pasado"), f"everything else, in English: {restos.get('edificio pasado')}")
        # the Settings button: the renamed sage goes back to its built-in name; the owner's floor doesn't change
        pg.click("#cerrarPanel"); pg.click("#abrirAjustes"); pg.wait_for_selector("#cajonCuerpo h4")
        pg.click("#cajonCuerpo button:text-is('Restore the built-in names')"); pg.wait_for_timeout(500)
        tras = estado(pg)
        check(next(a for a in tras["agentes"] if a["id"] == "sabio2")["nombre"] == "Sage 2" and "Redes Sociales" in [x["nombre"] for x in tras["plantas"]]
              and "Built-in names restored: 1." in pg.inner_text("body"), "“Restore the built-in names”: Sage 2 comes back; “Redes Sociales” stays; the notice, in English")
        pg.click("#cerrarCajon")
        pg.click("#hablarJefe"); pg.wait_for_selector("#vistaChat:not([hidden])")
        saludo = pg.inner_text("#mensajes .msg.saludo .burbuja >> nth=0")
        check(saludo.startswith("Hi, I'm the boss of My building."), f"the greeting, in English: “{saludo[:70]}”")
        pg.fill("#texto", "Sí"); pg.keyboard.press("Enter"); pg.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        check(pg.inner_text("#mensajes .msg.me .burbuja >> nth=-1") == "Sí", f"what you write is shown as it is (not translated): “{pg.inner_text('#mensajes .msg.me .burbuja >> nth=-1')}”")
        PERMITIDO[:] = permitidos
        check(not errores2, f"no errors: {errores2[:3]}")
        b.close()
finally:
    servidor.terminate()
if restos: print("SPANISH LEFT IN THE ENGLISH WEBSITE:\n" + "\n".join(f"  [{k}] {v}" for k, v in restos.items()))
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
