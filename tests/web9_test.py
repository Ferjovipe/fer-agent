"""Tests of the website in SPANISH (version 9: the program is written in English and Spanish is a translation).
A browser in Spanish, with nothing saved:
- the home page, the building, every profile, every screen and every drawer come out in Spanish (it looks for English left in what is shown);
- a new building is born in Spanish (Jefe, Sabio 1, Cúpula…) and what is said to the agents goes in Spanish;
- nothing the engine said was missing from languages/es.js.
Usage: python3 tests/web9_test.py   (leaves screenshots in tests/screenshots/v9-es-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8817"))

requests = []
def router_es(route, request):
    if request.url == "https://openrouter.ai/api/v1/chat/completions" and request.method == "POST":
        b = json.loads(request.post_data); msgs = b["messages"]
        user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""})
        requests.append({"sys": str(msgs[0]["content"]), "user": user["content"] if isinstance(user["content"], str) else ""})
    return router(route, request)

# What is shown on screen, without the conversations (what the simulated agents write) nor what the user writes,
# nor the model names in the drop-downs (they are data: «Text Embedding 4»…)
VISIBLE = """(sel) => { const raiz = document.querySelector(sel); if (!raiz) return [];
  const fuera = (el) => el.closest('#messages .msg:not(.greeting) .bubble, input, textarea, select, .builtin-fig, script, style, [hidden]');
  const out = []; const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, el = n.parentElement; const t = n.nodeValue.trim();
    if (!t || !el || fuera(el)) continue; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (r.width === 0 && r.height === 0)) continue; out.push(t); }
  for (const el of raiz.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder','title','aria-label']) { const v = el.getAttribute(a); if (v && !el.closest('[hidden]')) out.push(v.trim()); }
  for (const el of raiz.querySelectorAll('select option, select optgroup')) { if (el.closest('[hidden]') || (el.value || '').includes('/')) continue; const v = el.tagName === 'OPTGROUP' ? el.label : el.textContent; if (v && v.trim()) out.push(v.trim()); }
  return out; }"""
# Words that only appear on the English side of the dictionary (and not in any Spanish translation), plus common English words
def _words(t): return set(w.lower() for w in re.findall(r"[A-Za-zÁÉÍÓÚáéíóúñÑ']{3,}", t))
_en, _es = set(), set()
for line in open(os.path.join(ROOT, "languages", "es.js"), encoding="utf8"):
    mm = re.match(r'\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?\s*$', line)
    if mm: _en |= _words(json.loads(mm.group(1))); _es |= _words(json.loads(mm.group(2)))
ONLY_EN = _en - _es
EN = re.compile(r"\b(the|and|of|to|with|your|you|it's|its|is|are|this|that|from|for|what|when|each|have|can|by|not|there|they|their|will|which|who|how|building|agents?|floor|profile|spending|boss|sages?|meeting|coins?|brain|heartbeat|settings|inbox|tasks?|nothing|save|delete|create|remove|talk|backup)\b", re.I)
ALLOWED = ["Fer Agent", "OpenRouter", "Google Drive", "Google", "Chrome", "Obsidian", "Whisper", "JEV", "Memory", "Jev Latest", "Credits", "Keys", "Create Key", "EN · English", "English", "skills", "skill", "Telegram"]
leftovers = {}
def english(page, sel, where):
    bad = []
    for t in page.evaluate(VISIBLE, sel):
        x = t
        for p in ALLOWED: x = x.replace(p, "")
        if EN.search(x) or (_words(x) & ONLY_EN): bad.append(t[:90])
    if bad: leftovers[where] = sorted(set(bad))
    return bad
def photo(page, name): page.screenshot(path=os.path.join(OUTPUT, "v9-es-" + name + ".png"))
def profile_es(page, ag_id, tab=None):
    if page.is_visible("#chatView"): page.click("#closeChat")
    try:
        if page.is_visible(".back"): page.click(".back", timeout=2000)
    except Exception: pass
    sel = f".tier .fig[data-id='{ag_id}']"
    if not page.is_visible(sel):
        e = state(page); ag = next(a for a in e["agents"] if a["id"] == ag_id)
        idx = [p["id"] for p in e["floors"]].index(ag["floor"]); page.click(f".tier >> nth={idx} >> .enter"); page.wait_for_timeout(300)
        sel = f".fig[data-id='{ag_id}']"
    page.click(sel); page.wait_for_selector("#profile .profile-tabs"); page.wait_for_timeout(200)
    if tab is not None: page.click(f"#profile .profile-tabs button >> nth={tab}"); page.wait_for_timeout(250)

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1470, "height": 900}, locale="es-ES")
        ctx.add_init_script(INIT); ctx.route("https://**/*", router_es)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_selector("#landing .hero-txt")
        # ---------- Home page ----------
        check(page.inner_text("#landing h1") == "Tienes una empresa agéntica a tu servicio.", f"the home page in Spanish: «{page.inner_text('#landing h1')}»")
        check(page.evaluate("document.documentElement.lang") == "es", "the page says it is in Spanish (lang=es)")
        check(not english(page, "#landing", "portada"), f"home page with no English left: {leftovers.get('portada')}")
        photo(page, "1-landing")
        # ---------- Settings without a key ----------
        page.click("#landing .button-big >> nth=0"); page.wait_for_selector("#drawer:not([hidden])")
        check(not english(page, "#drawer", "ajustes sin clave"), f"Settings (no key) in Spanish: {leftovers.get('ajustes sin clave')}")
        check(page.inner_text("#drawerBody .how-key").startswith("¿Aún no tienes clave?"), "how to get the OpenRouter key, in Spanish")
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tier .fig")
        e = state(page)
        check(e.get("language") == "es" and e["agents"][0]["name"] == "Jefe" and [x["name"] for x in e["floors"]] == ["Cúpula", "Vestíbulo"] and e["name"] == "Mi edificio",
              f"a new building is born in Spanish: {e.get('language')}, {e['agents'][0]['name']}, {[x['name'] for x in e['floors']]}, {e['name']}")
        check(e["agents"][0]["instructions"].startswith("Eres el jefe del edificio") and e["settings"].get("brainFolders", {}).get("memory") == "Memoria larga",
              "the boss's instructions in Spanish, and the brain folders with Spanish names")
        check(not english(page, "body", "edificio solo jefe"), f"the building (only the boss) in Spanish: {leftovers.get('edificio solo jefe')}")
        # ---------- Built-in agents ----------
        page.click("#openBuiltIn"); page.wait_for_selector("#builtInView .builtin-agent")
        names = page.eval_on_selector_all("#builtInView .builtin-name", "bs => bs.map(b => b.textContent)")
        check(names == ["Jefe", "Sabio 1", "Sabio 2", "Tecno", "Arturito", "Creador de agentes", "JEV", "Interventor", "Memory", "Correo"], f"«Agentes de serie» with their Spanish names: {names}")
        check(not english(page, "#builtInView", "serie"), f"built-in agents page in Spanish: {leftovers.get('builtIn')}")
        page.click("#builtInView button:has-text('Instalar el equipo recomendado')"); page.wait_for_timeout(700)
        notice = page.inner_text("#toast") if page.is_visible("#toast") else ""
        check(notice.startswith("Instalados: Sabio 1, Sabio 2"), f"the notice in Spanish: «{notice[:60]}»")
        tech = next(a for a in state(page)["agents"] if a["id"] == "techie")
        check(tech["instructions"].startswith("Eres Tecno, el técnico del edificio"), "the team is installed in Spanish")
        page.click("#builtInView .back-btn"); page.wait_for_selector("#builtInView", state="hidden")
        # ---------- Building, strips ----------
        page.wait_for_timeout(400)
        check(not english(page, "body", "edificio"), f"the whole building in Spanish: {leftovers.get('building')}")
        photo(page, "2-building")
        page.click("#showStrips"); page.wait_for_selector(".agent-row"); page.wait_for_timeout(300)
        check(not english(page, "body", "franjas"), f"«Franjas» and the directory in Spanish: {leftovers.get('franjas')}")
        page.click("#showDrawing"); page.wait_for_selector(".tier.storey:not(.strip)")
        # ---------- Profiles (every tab) ----------
        for ag in ["boss", "sage1", "techie", "artie", "creator", "jev", "controller", "memory"]:
            for tab in range(4):
                profile_es(page, ag, tab)
                english(page, "#profile", f"ficha {ag} {tab}")
        check(not any(k.startswith("ficha") for k in leftovers), "every profile (identity, work, brain, capabilities) in Spanish: " + "; ".join(f"{k}: {v}" for k, v in leftovers.items() if k.startswith("ficha"))[:1500])
        profile_es(page, "techie", 0); photo(page, "3-profile")
        # ---------- Drawers ----------
        page.click("#openSettings"); page.wait_for_selector("#drawerBody h4"); page.wait_for_timeout(300)
        check(not english(page, "#drawer", "ajustes"), f"Settings in Spanish: {leftovers.get('settings')}")
        photo(page, "4-settings"); page.click("#closeDrawer")
        page.click("#meter"); page.wait_for_selector("#drawerBody .who-spends"); page.wait_for_timeout(200)
        check(not english(page, "#drawer", "gasto"), f"Spending in Spanish: {leftovers.get('spending')}")
        page.click("#closeDrawer")
        page.click("#createAgent"); page.wait_for_selector("#drawer:not([hidden])"); page.wait_for_timeout(300)
        check(not english(page, "#drawer", "crear agente"), f"Create agent in Spanish: {leftovers.get('crear agente')}")
        page.click("#closeDrawer")
        page.click("#createFloor"); page.wait_for_selector("#drawer:not([hidden])"); page.wait_for_timeout(200)
        check(not english(page, "#drawer", "crear piso"), f"Create floor in Spanish: {leftovers.get('crear piso')}")
        page.click("#closeDrawer")
        profile_es(page, "techie", 0); page.click("#profile .field button.btn.mini >> nth=0"); page.wait_for_selector("#drawerBody .pick4")
        check(page.inner_text("#drawerTitle") == "Foto y nombre de Tecno" and not english(page, "#drawer", "foto"), f"Photo and name in Spanish: {page.inner_text('#drawerTitle')} {leftovers.get('foto')}")
        eyes = page.get_attribute("#drawerBody [aria-label='Ojos: verdes']", "title")
        check(eyes == "Ojos: verdes" and page.is_visible("#drawerBody [aria-label='Ropa: verde']") and page.is_visible("#drawerBody [aria-label='Pelo: canoso']"),
              f"colours agree in Spanish (ojos verdes, ropa verde, pelo canoso): {eyes}")
        page.click("#closeDrawer")
        # ---------- Screens ----------
        for button, view, name in [("#openInbox", "#inboxView", "bandeja"), ("#openMonth", "#monthView", "mes"), ("#openRooms", "#roomsView", "salas"), ("#openActivity", None, "actividad")]:
            page.click(button); page.wait_for_timeout(500)
            english(page, view or "body", name)
            if view: page.click(f"{view} .back-btn"); page.wait_for_timeout(200)
        check(not any(k in leftovers for k in ["inbox", "month", "rooms", "actividad"]), "Bandeja, Agente del mes, Reuniones and Actividad in Spanish: " + "; ".join(f"{k}: {leftovers[k]}" for k in ["inbox", "month", "rooms", "actividad"] if k in leftovers)[:1200])
        # ---------- Chat with the boss: what is said to it, in Spanish ----------
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        page.fill("#messageInput", "Hola, ¿quién eres?"); page.keyboard.press("Enter")
        page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        s0 = next((x["sys"] for x in reversed(requests) if x["sys"].startswith("Eres el jefe del edificio")), "")
        check(s0 and "Te llamas Jefe" in s0 and "Regla: no inventes datos" in s0, "the boss is spoken to in Spanish (instructions, name, rule against making things up)")
        forbidden = [w for w in ["You are ", "Your name", "Rule:", "Date and time", "Org chart", "You can use tools"] if w in s0]
        check(not forbidden, f"and with no English pieces: {forbidden}")
        check(not english(page, "#chatView", "chat"), f"the chat in Spanish (not counting what they write): {leftovers.get('chat')}")
        photo(page, "5-chat")
        page.click("#messages .msg.bot:not(.greeting) .coin-btn >> nth=0")
        page.fill(".reason-row input", "Lo explicó muy claro"); page.click(".reason-row .btn.primary")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        check(not english(page, "#chatView", "chat2"), f"the chat, with coins, in Spanish: {leftovers.get('chat2')}")
        page.click("#closeChat")
        page.click("#openInbox"); page.wait_for_selector("#inboxView .request")
        check(not english(page, "#inboxView", "bandeja lección"), f"the inbox with the lesson, in Spanish: {leftovers.get('bandeja lección')}")
        page.click("#inboxView .back-btn")
        # ---------- The Creator designs an agent (in Spanish) ----------
        page.click("#createAgent"); page.fill("#drawerBody .creator textarea", "Quiero uno que planifique el menú de la semana")
        page.click("#drawerBody .creator button"); page.wait_for_selector("#drawerBody .why")
        check(not english(page, "#drawer", "creator"), f"the profile the Creator proposes, in Spanish: {leftovers.get('creator')}")
        page.click("#drawerBody button:text-is('Crear agente')"); page.wait_for_timeout(600)
        try:
            if page.is_visible(".back"): page.click(".back", timeout=2000)
        except Exception: pass
        page.click("#openMonth"); page.wait_for_timeout(400)
        check(not english(page, "#monthView", "mes2"), f"«Agente del mes» with coins, in Spanish: {leftovers.get('mes2')}")
        page.click("#monthView .back-btn")
        # ---------- A meeting ----------
        page.click("#openRooms"); page.wait_for_selector("#roomsView:not([hidden]) .form-dark")
        page.fill(".form-dark input >> nth=0", "Plan de la semana"); page.fill(".form-dark textarea", "Qué publicamos y con qué presupuesto.")
        page.click(".choose-attendees label:has-text('Sabio 1') input"); page.fill(".form-dark input[type=number]", "1")
        page.click(".form-dark .btn.primary"); page.wait_for_selector(".table .seat")
        page.click(".form-dark .btn.primary"); page.wait_for_selector("#roomsView .minutes", timeout=20000)
        check(not english(page, "#roomsView", "sala"), f"the meeting room in Spanish: {leftovers.get('sala')}")
        photo(page, "6-room")
        page.click("#roomsView .back-btn")
        # ---------- Activity, after all of the above ----------
        page.click("#openActivity"); page.wait_for_timeout(500)
        check(not english(page, "body", "actividad2"), f"the activity (what the engine notes) in Spanish: {leftovers.get('actividad2')}")
        photo(page, "7-activity")
        # ---------- Nothing the engine said was missing from the Spanish dictionary ----------
        without = page.evaluate("async () => { const m = await import('./engine.js'); return [...m.UNTRANSLATED]; }")
        check([x for x in without if x not in ("min", "h")] == [], f"the engine asked for no text missing from languages/es.js: {without[:8]}")
        med = page.inner_text("#meterToday")
        check(re.search(r"\d,\d+ \$", med), f"money in Spanish format (0,0012 $): «{med}»")
        check(not errors, f"no errors on the page: {errors}")
        b.close()
finally:
    server.terminate()
if leftovers: print("ENGLISH LEFT IN THE SPANISH WEBSITE:\n" + "\n".join(f"  [{k}] {v}" for k, v in leftovers.items()))
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
