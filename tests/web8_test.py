"""Tests of the website, version 8 (Playwright, everything simulated: OpenRouter and any API “from your subscription”). The website in Spanish.
It checks what's new in v8: the building full screen (the profile only when you touch an agent or go into a floor),
a new building with only the boss, the “Agentes de serie” page, the signs on top, the top bar on one line,
the directory only in “Franjas”, the brain (recommended, all of OpenRouter's and “Buscar entre todos”), “Otras API” (any address) and the picker
in the profile, “Informa a” with a search box and no loops, the name in “Foto y nombre”, the 6 new characters, no personal
references and “Orden del día” only once.
Usage: python3 tests/web8_test.py   (leaves screenshots in tests/screenshots/v8-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8814"))

# ---------- More text models, so that “Buscar entre todos” is needed ----------
EXTRA = [m(f"zeta/zeta-{i}", f"Zeta {i}", "0.000001", "0.000004") for i in range(1, 13)]
TEXT += EXTRA; ALL["data"] += EXTRA
# ---------- Any API, one of those the user adds (“O cualquier otra”) ----------
MIAPI = "https://api.miapi.test/v1"
myapi_calls = []
def router8(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if url == MIAPI + "/models":
        if request.headers.get("authorization") != "Bearer sk-mia": return route.fulfill(status=401, headers=CORS, body=json.dumps({"error": {"message": "clave mala"}}))
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"data": [{"id": "mia-grande", "created": 1790000000}, {"id": "mia-pequena", "created": 1780000000}, {"id": "mia-embed-1", "created": 1795000000}]}))
    if url == MIAPI + "/chat/completions":
        myapi_calls.append({"h": dict(request.headers), "b": json.loads(request.post_data)})
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"model": "mia-grande", "choices": [{"message": {"content": "Respuesta desde Mi API."}}], "usage": {"prompt_tokens": 800, "completion_tokens": 40}}))
    return router(route, request)

def photo(page, name, full=False): page.screenshot(path=os.path.join(OUTPUT, "v8-" + name + ".png"), full_page=full)
def box(page, sel): return page.eval_on_selector(sel, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
def bar_rows(page):
    """cuántas filas ocupa la barra de arriba (por el centro de cada cosa visible)"""
    return page.evaluate("""() => { const t = document.querySelector('header.top');
      const ys = [...t.children].filter(c => c.getClientRects().length && getComputedStyle(c).visibility !== 'hidden').map(c => { const r = c.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
      return { rows: new Set(ys.map(y => Math.round(y / 8))).size, salto: Math.max(...ys) - Math.min(...ys), high: Math.round(t.getBoundingClientRect().height) }; }""")
PERSONAL = re.compile(r"Realkimia|\bFer\b(?!\s+(Agent|Casa))")
def personal(text): return sorted(set(m.group(0) for m in PERSONAL.finditer(text)))

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1470, "height": 900})
        ctx.add_init_script(INIT); ctx.route("https://**/*", router8)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_selector("#landing .hero-txt")
        # ---------- Home page: no personal references and the text not over the building ----------
        check(personal(page.inner_text("#landing")) == [], f"home page with no personal references: {personal(page.inner_text('#landing'))}")
        txt = box(page, "#landing .hero-txt")
        check(txt[2] <= 1470 * 0.56, f"home page: the text stays in the dark part, on the left (it ends at {txt[2]:.0f} px of 1470)")
        photo(page, "1-landing")
        # ---------- A new building: only the boss, who is called “Jefe” ----------
        enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden])")
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tier .fig")
        e = state(page)
        check(len(e["agents"]) == 1 and e["agents"][0]["name"] == "Jefe" and e["agents"][0]["role"] == "boss", f"a new building starts with only the boss, “Jefe” ({[a['name'] for a in e['agents']]})")
        check(len(page.eval_on_selector_all(".tier .fig", "p => p")) == 1, "in the drawing, a single figure")
        check(page.inner_text("#talkToBoss") == "Hablar con Jefe", "on top: “Hablar con Jefe”")
        # ---------- Full screen: no profile beside it until you touch someone ----------
        check("with-panel" not in (page.get_attribute("body", "class") or "") and not page.is_visible("#profile"), "the whole building, without the profile beside it")
        width = box(page, ".building")
        check(width[2] - width[0] >= 1300, f"the building fills the screen ({width[2] - width[0]:.0f} px of 1470)")
        photo(page, "2-only-the-boss")
        page.click(".tier .fig[data-id='boss']"); page.wait_for_selector("#profile .profile-tabs")
        check("with-panel" in page.get_attribute("body", "class") and page.is_visible("#closePanel"), "you touch the boss: its profile appears, with its ✕")
        page.click("#closePanel"); page.wait_for_timeout(300)
        check("with-panel" not in page.get_attribute("body", "class") and not page.is_visible("#profile"), "with the ✕, the whole building again")
        # ---------- Built-in agents ----------
        page.click("#openBuiltIn"); page.wait_for_selector("#builtInView .builtin-agent")
        cards = page.eval_on_selector_all("#builtInView .builtin-agent .builtin-name", "bs => bs.map(b => b.textContent)")
        check(len(cards) == 10 and cards[-1] == "Correo" and "Sabio 2" in cards and "Jefe" in cards and not any("Consejera" in t for t in cards),
              f"“Agentes de serie”: the 9 of the recommended team, with “Sabio 2”, and Correo (v9) on its own ({cards})")
        check(page.is_visible("#builtInView .builtin-agent:has-text('Jefe') >> text=Siempre está") and page.is_visible("#builtInView button:text-is('Instalar el equipo recomendado (faltan 8)')"), "the boss is already there; button “Instalar el equipo recomendado (faltan 8)”")
        check(personal(page.inner_text("#builtInView")) == [], f"the built-in page, with no personal references: {personal(page.inner_text('#builtInView'))}")
        photo(page, "3-built-in-agents")
        page.click("#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) button:text-is('Instalar')"); page.wait_for_timeout(500)
        e = state(page)
        art = next((a for a in e["agents"] if a["id"] == "artie"), None)
        check(len(e["agents"]) == 2 and art and art["floor"] in [p["id"] for p in e["floors"]], "a single one can be installed (Arturito), with its floor")
        check(page.is_visible("#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) button:text-is('Quitar del edificio')"), "and its card changes to “En tu edificio · Quitar del edificio”")
        page.click("#builtInView button:has-text('Instalar el equipo recomendado')"); page.wait_for_timeout(600)
        e = state(page)
        check(len(e["agents"]) == 9 and page.is_visible("#builtInView >> text=Tienes instalado todo el equipo recomendado."), "“Instalar el equipo recomendado” puts in the missing ones (9 in total)")
        remove = "#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) button:text-is('Quitar del edificio')"
        page.click(remove); page.click("#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) .danger"); page.wait_for_timeout(500)
        check(len(state(page)["agents"]) == 8 and page.is_visible("#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) button:text-is('Instalar')"), "removing one (two taps): it leaves the building and is available to install again")
        page.click("#builtInView .builtin-agent:has(.builtin-name:text-is('Arturito')) button:text-is('Instalar')"); page.wait_for_timeout(500)
        page.click("#builtInView .back-btn"); page.wait_for_selector("#builtInView", state="hidden")
        # ---------- Signs on top, top bar on one line, directory only in “Franjas” ----------
        page.wait_for_selector(".tier.storey .sign")
        page.wait_for_function("(() => { const t = document.querySelector('.tier.storey'); return t && t.getBoundingClientRect().height > 0; })()")   # that the drawing has finished painting
        part, sign = box(page, ".tier.storey"), box(page, ".tier.storey .sign")
        check((sign[1] - part[1]) / (part[3] - part[1]) < 0.1, f"each floor's sign, on top ({(sign[1] - part[1]) / (part[3] - part[1]):.2f} of the height)")
        tops = page.eval_on_selector_all(".tier .sign", "ps => ps.map(p => { const t = p.closest('.tier').getBoundingClientRect(), r = p.getBoundingClientRect(); return (r.top - t.top) / t.height; })")
        check(all(t < 0.6 for t in tops), f"dome, floors and lobby: the sign in the top part ({[round(t, 2) for t in tops]})")
        names = page.eval_on_selector_all(".tier .fig .label", "es => es.map(e => e.textContent)")
        check(len(names) == 9 and "Sabio 2" in names, "each figure carries its name (shown on hover)")
        page.hover(".tier .fig[data-id='techie']"); page.wait_for_timeout(250)
        check(page.eval_on_selector(".tier .fig[data-id='techie'] .label", "e => getComputedStyle(e).opacity") == "1", "hovering over Tecno, its name")
        figure_height = page.eval_on_selector(".tier.storey .fig img", "i => i.getBoundingClientRect().height")
        check(figure_height >= 48, f"bigger figures with the building full screen ({figure_height:.0f} px)")
        check(len(page.eval_on_selector_all(".agent-row", "f => f")) == 0, "in “Dibujo” the list of agents isn't repeated")
        page.click("#showStrips"); page.wait_for_selector(".agent-row")
        check(len(page.eval_on_selector_all(".agent-row", "f => f")) == 9, "in “Franjas”, the directory (all 9)")
        page.click("#showDrawing"); page.wait_for_selector(".tier.storey:not(.strip)")
        photo(page, "4-whole-building")
        for w in (1470, 1084):
            page.set_viewport_size({"width": w, "height": 900}); page.wait_for_timeout(300)
            fb = bar_rows(page)
            check(fb["rows"] == 1 and fb["high"] <= 72, f"top bar on a single line at {w} px ({fb})")
        photo(page, "5-bar-1084")
        page.set_viewport_size({"width": 1470, "height": 900}); page.wait_for_timeout(300)
        # going into a floor opens its boss's profile; “Volver” closes it
        idx = [p["id"] for p in state(page)["floors"]].index(state(page)["agents"][[a["id"] for a in state(page)["agents"]].index("techie")]["floor"])
        page.click(f".tier >> nth={idx} >> .enter"); page.wait_for_selector(".back")
        check("with-panel" in page.get_attribute("body", "class") and page.is_visible("#profile .profile-tabs"), "when going into a floor, the profile beside it")
        photo(page, "6-inside-a-floor")
        page.click(".back"); page.wait_for_selector(".tier.storey"); page.wait_for_timeout(300)
        check("with-panel" not in page.get_attribute("body", "class"), "when going back to the building, it closes")
        # ---------- Brain: up to 15 recommended on top, ALL of OpenRouter's below, and also “Buscar entre todos” ----------
        profile(page, "Tecno", "Cerebro y gasto")
        sel = "#profile .field:has(> span:text-is('Cerebro')) select"
        groups = page.eval_on_selector_all(sel + " optgroup", "gs => gs.map(g => [g.label, g.children.length])")
        n_rec = sum(n for g, n in groups if g.startswith("Recomendados"))
        all_groups = [(g, n) for g, n in groups if g.startswith("Todos")]
        check(groups[0][0].startswith("Recomendados") and 1 <= n_rec <= 15, f"in the drop-down, the recommended ones per level on top (≤15): {n_rec}")
        check(all_groups == [(f"Todos · Texto ({len(TEXT)})", len(TEXT))] and any(g.startswith("Otros") for g, _ in groups), f"and below, in the same drop-down, ALL of OpenRouter's text ones (and “Otros”): {[g for g, _ in groups]}")
        page.select_option(sel, "zeta/zeta-7"); page.wait_for_timeout(400)
        check(agent(page, "Tecno")["brain"] == "zeta/zeta-7", "any one can be chosen directly in the drop-down")
        button = "#profile .field:has(> span:text-is('Cerebro')) .search-model"
        check(page.is_visible(button) and page.inner_text(button) == f"Buscar entre todos ({len(TEXT) + len(OTHERS)})", f"and also “Buscar entre todos (N)” to type the name: “{page.inner_text(button) if page.is_visible(button) else ''}”")
        page.click(button); page.fill("#profile input[aria-label='Buscar modelo']", "zeta 1"); page.wait_for_timeout(200)
        res = page.eval_on_selector_all("#profile .model-search .model-result", "bs => bs.map(b => b.textContent)")
        check(res and all("Zeta 1" in r for r in res), f"you type “zeta 1” and the ones that have it come up ({len(res)})")
        photo(page, "7-search-model")
        page.click("#profile .model-search .model-result:has-text('Zeta 12')"); page.wait_for_timeout(400)
        check(agent(page, "Tecno")["brain"] == "zeta/zeta-12", "you choose one from the search and it's now its brain")
        # ---------- Other APIs: any one, with its address ----------
        page.click("#openSettings"); page.wait_for_selector("#drawerBody h4:text-is('Otras API (tus suscripciones)')")
        check(personal(page.inner_text("#drawerBody")) == [], f"Settings with no personal references: {personal(page.inner_text('#drawerBody'))}")
        which = "#drawerBody .field:has(> span:text-is('O cualquier otra'))"
        page.fill(f"{which} input >> nth=0", "Mi API"); page.fill(f"{which} input >> nth=1", "ftp://mal"); page.click(f"{which} button:text-is('Añadir')")
        check(page.is_visible(f"{which} >> text=La dirección tiene que empezar por https://"), "a bad address isn't added (and it says so)")
        page.fill(f"{which} input >> nth=1", MIAPI); page.click(f"{which} button:text-is('Añadir')"); page.wait_for_timeout(400)
        row = "#drawerBody .api-row:has(> span:text-matches('^Mi API'))"
        check(page.is_visible(row) and any(c["id"] == "api-mi-api" and c["api"] == MIAPI for c in state(page)["settings"]["connections"]), "“Mi API” added with its address")
        page.fill(f"{row} input[type=password]", "sk-mia"); page.click(f"{row} button:text-is('Guardar')"); page.wait_for_timeout(300)
        check(page.evaluate("localStorage.getItem('ferAgent.keyApi.api-mi-api')") == "sk-mia" and "sk-mia" not in json.dumps(state(page)), "its key, only in this browser (not inside the building)")
        page.click(f"{row} button:text-is('Probar')"); page.wait_for_selector(f"{row} >> text=Funciona: 2 modelos", timeout=8000)
        check(True, "“Probar”: lists its conversation models (without the embedding ones)")
        photo(page, "8-other-apis")
        page.click("#closeDrawer")
        profile(page, "Tecno", "Cerebro y gasto")
        sel_prov = "#profile .field:has(> span:text-is('Con qué piensa')) select"
        opts = page.eval_on_selector_all(sel_prov + " option", "os => os.map(o => o.textContent)")
        check(opts == ["OpenRouter (se paga por uso)", "Mi API · tu suscripción"], f"in its profile, “Con qué piensa”: {opts}")
        page.select_option(sel_prov, "api-mi-api"); page.wait_for_timeout(500)
        t = agent(page, "Tecno")
        check(t["provider"] == "api-mi-api" and t["brain"] == "mia-grande", f"Tecno thinks with Mi API ({t['provider']} · {t['brain']})")
        check(page.is_visible("#profile >> text=Sale de tu suscripción de Mi API"), "the profile says so: it comes out of your subscription, it doesn't count towards the cap")
        photo(page, "9-profile-other-api")
        chat_with(page, "Tecno"); send(page, "¿Qué tal todo?")
        page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        check("Respuesta desde Mi API." in page.inner_text("#messages") and myapi_calls and myapi_calls[-1]["h"].get("authorization") == "Bearer sk-mia" and myapi_calls[-1]["b"]["model"] == "mia-grande", "it answers from Mi API, with its key and its model")
        check("Mi API: tu suscripción" in page.inner_text("#messages .msg.bot:not(.greeting) .meta"), "below: “Mi API: tu suscripción”")
        t = agent(page, "Tecno")
        check(sum(t["spending"].values()) == 0 and sum(x["tokens"] for x in t["subscription"].values()) == 840, f"it doesn't add to the spending; it's recorded apart ({t['subscription']})")
        page.click("#closeChat")
        # ---------- “Informa a”: anyone, with a search box; no loops ----------
        profile(page, "Tecno", "Identidad")
        inf = "#profile .field:has(> span:text-is('Informa a'))"
        n_ops = len(page.eval_on_selector_all(f"{inf} select option", "o => o"))
        check(page.is_visible(f"{inf} input[type=search]") and n_ops == 9, f"“Informa a”: Nadie and the other 8, with a search box ({n_ops} options)")
        page.fill(f"{inf} input[type=search]", "artu"); page.wait_for_timeout(200)
        ops = page.eval_on_selector_all(f"{inf} select option", "os => os.map(o => o.textContent)")
        check(any(o.startswith("Arturito") for o in ops) and len(ops) <= 3, f"you type “artu” and Arturito is left ({ops})")
        page.select_option(f"{inf} select", "artie"); page.wait_for_timeout(400)
        check(agent(page, "Tecno")["reportsTo"] == "artie", "Tecno informa a Arturito")
        profile(page, "Arturito", "Identidad")
        before = agent(page, "Arturito")["reportsTo"]
        page.select_option(f"{inf} select", "techie"); page.wait_for_timeout(500)
        notice = page.inner_text("#toast") if page.is_visible("#toast") else ""
        check(agent(page, "Arturito")["reportsTo"] == before and "no puede informar a" in notice, f"and Arturito can no longer report to Tecno (it would be a loop): “{notice[:90]}”")
        photo(page, "10-reports-to")
        # ---------- Photo and name: the name here and the 6 new characters ----------
        profile(page, "Tecno", "Identidad")
        page.click("#profile button:text-is('Cambiar su foto y su nombre')"); page.wait_for_selector("#drawerBody .pick4")
        check(page.inner_text("#drawerTitle") == "Foto y nombre de Tecno", "“Foto y nombre de Tecno”")
        pjs = page.eval_on_selector_all("#drawerBody .pick4 button img", "is => is.map(i => i.getAttribute('src'))")
        new_items = ["purple", "green", "coral", "blue", "teal", "shirt"]   # the picture files' names
        check(len(pjs) == 10 and all(f"img/character-{n}.webp" in pjs for n in new_items), f"10 characters: the 4 from before and the 6 new ones ({len(pjs)})")
        page.fill("#drawerBody input[aria-label='Nombre']", "Técnica"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        check(any(a["id"] == "techie" and a["name"] == "Técnica" for a in state(page)["agents"]) and page.inner_text("#drawerTitle") == "Foto y nombre de Técnica", "you change its name right there")
        page.click("#drawerBody .pick4 button:has(img[src='img/character-purple.webp'])"); page.wait_for_timeout(500)
        tech = next(a for a in state(page)["agents"] if a["id"] == "techie")
        check(tech["look"]["p"] == "purple" and page.is_visible("#drawerBody >> text=Este personaje va con sus colores tal cual."), "you choose a new character (it comes with its colours)")
        photo(page, "11-photo-and-name")
        page.click("#closeDrawer"); go_back(page); page.wait_for_timeout(300)
        check("character-purple" in page.get_attribute(".tier .fig[data-id='techie'] img", "src") and page.inner_text(".tier .fig[data-id='techie'] .label") == "Técnica", "in the building, with its new photo and name")
        # ---------- “Orden del día”, only once ----------
        page.click("#openRooms"); page.wait_for_selector("#roomsView:not([hidden]) .form-dark")
        page.fill(".form-dark input >> nth=0", "Plan de la semana"); page.fill(".form-dark textarea", "Orden del día: qué publicamos y con qué presupuesto.")
        page.click(".choose-attendees label:has-text('Sabio 1') input"); page.fill(".form-dark input[type=number]", "1")
        page.click(".form-dark .btn.primary:text-is('Convocar')"); page.wait_for_selector(".table .seat")
        order = page.inner_text("#roomsView .agenda")
        check(order.lower().count("orden del día") == 1 and "qué publicamos" in order, f"“Orden del día” appears only once: “{order[:70]}”")
        photo(page, "12-room")
        page.click("#roomsView .back-btn")
        # ---------- The boss's greeting and the building, with no personal references ----------
        page.click("#talkToBoss"); page.wait_for_selector("#messages .msg.greeting")
        out_lines = page.inner_text("#messages .msg.greeting")
        check(personal(out_lines) == [] and "jefe" in out_lines.lower(), f"the boss greets without anyone's names: “{out_lines[:80]}”")
        page.click("#closeChat")
        check(personal(page.inner_text("body")) == [], f"on the whole screen, no personal references: {personal(page.inner_text('body'))}")
        # ---------- Starting from scratch: “Solo el jefe” ----------
        page.click("#openSettings"); b_zero = "#drawerBody button:text-is('Solo el jefe')"
        page.click(b_zero); page.click("#drawerBody .row-c:has(button:text-is('Con el equipo recomendado')) button >> nth=0"); page.wait_for_timeout(700)
        e = state(page)
        check(len(e["agents"]) == 1 and e["agents"][0]["name"] == "Jefe" and any(c["id"] == "api-mi-api" for c in e["settings"]["connections"]), "starting from scratch “Solo el jefe”: the boss stays (and the settings are kept, like Mi API)")
        page.click("#closeDrawer") if page.is_visible("#closeDrawer") else None
        # ---------- Phone: the sign doesn't cover heads ----------
        mov = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mov.add_init_script(INIT); mov.add_init_script("localStorage.setItem('ferAgent.key','sk-or-test');"); mov.route("https://**/*", router8)
        pm = mov.new_page(); pm.on("pageerror", lambda e: errors.append(str(e)))
        pm.goto(URL); enter(pm); pm.wait_for_selector(".tier .fig[data-id='techie']")
        check(not overlaps(pm, ".tier.storey .sign", ".tier .fig[data-id='techie'] img"), "phone: the floor's sign doesn't cover anyone")
        photo(pm, "13-mobile")
        mov.close()
        check(not errors, f"no errors on the page: {errors[:3]}")
        b.close()
finally:
    server.terminate()
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
