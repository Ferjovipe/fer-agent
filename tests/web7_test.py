"""Tests of the website, version 7 (Playwright, everything simulated: OpenRouter, Claude, Google Drive and Google sign-in). The website in Spanish.
It checks what's new: the brake, the inbox, the direct brains, the voice sentence by sentence, “Parar”, interrupting it by talking,
the navigation, the coins, the personality, the objectives, the prices, the backups with images, moving and the brain folder.
Usage: python3 tests/web7_test.py   (leaves screenshots in tests/screenshots/v7-*.png)"""
import json, os, sys, re, time, subprocess, base64, urllib.parse
from datetime import datetime, timezone, timedelta
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8813"))

# ---------- Real models (data copied from OpenRouter, November 2026) to check the prices ----------
ALL["data"] += [
  {"id": "black-forest-labs/flux.2-max", "name": "FLUX.2 Max", "pricing": {"prompt": "0", "completion": "0", "image_output": "0.00001708984375"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["image"]}},
  {"id": "recraft/recraft-v4-pro", "name": "Recraft V4 Pro", "pricing": {"prompt": "0", "completion": "0", "image_token": "0.0000598802395209581", "image_output": "0.0000598802395209581"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["image"]}},
  {"id": "microsoft/mai-transcribe-1.5", "name": "MAI-Transcribe 1.5", "pricing": {"prompt": "0.36", "completion": "0"}, "architecture": {"input_modalities": ["audio"], "output_modalities": ["transcription"]}},
  {"id": "google/lyria-3-pro-preview", "name": "Lyria 3 Pro Preview", "description": "Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music models.", "pricing": {"prompt": "0", "completion": "0"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text", "audio"]}},
  {"id": "openai/gpt-audio", "name": "OpenAI: GPT Audio", "pricing": {"prompt": "0.0000025", "completion": "0.00001", "audio": "0.000032", "audio_output": "0.000064"}, "architecture": {"input_modalities": ["text", "audio"], "output_modalities": ["text", "audio"]}},
  {"id": "anthropic/claude-opus-4.1", "name": "Claude Opus 4.1", "pricing": {"prompt": "0.000015", "completion": "0.000075"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000}]
CORS7 = dict(CORS, **{"Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"})
anthropic_calls = []
GIS = """window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: (o) => {
  window.__gis = (window.__gis || []).concat([{ scope: cfg.scope, client_id: cfg.client_id, prompt: o && o.prompt }]);
  setTimeout(() => cfg.callback({ access_token: 'tok-drive', expires_in: 3600 }), 20); } }) } } };"""
# ---------- Simulated Google Drive (in memory) ----------
drive = {"n": 0, "files": {}}
def drive_new(name, parent, type, content=""):
    drive["n"] += 1; i = "f%d" % drive["n"]
    drive["files"][i] = {"id": i, "name": name, "parents": [parent], "mimeType": type, "content": content, "modifiedTime": datetime.now(timezone.utc).isoformat()}
    return i
def drive_path(rel_path):
    """id de un archivo por su ruta dentro de «Fer Agent»"""
    current = next((f["id"] for f in drive["files"].values() if f["name"] == "Fer Agent" and "root" in f["parents"]), None)
    for daily_report in [p for p in rel_path.split("/") if p]:
        current = next((f["id"] for f in drive["files"].values() if f["name"] == daily_report and current in f["parents"]), None)
    return current
def drive_router(route, request):
    url = urllib.parse.urlparse(request.url); qs = urllib.parse.parse_qs(url.query)
    if os.environ.get("DEPURAR"): print("DRIVE", request.method, url.path, qs.get("q", [""])[0][:90], time.strftime("%X"))
    if request.headers.get("authorization") != "Bearer tok-drive": return route.fulfill(status=401, headers=CORS7, body="{}")
    m = re.match(r"^/(upload/)?drive/v3/files(?:/([^/]+))?$", url.path)
    if not m: return route.fulfill(status=404, headers=CORS7, body="{}")
    upload, fid = m.group(1), m.group(2)
    if request.method == "GET" and fid and qs.get("alt") == ["media"]:
        return route.fulfill(status=200, headers=CORS7, body=drive["files"][fid]["content"])
    if request.method == "GET":
        q = qs.get("q", [""])[0]
        parent = re.search(r"'([^']+)' in parents", q).group(1)
        name = re.search(r"name = '((?:[^'\\]|\\.)*)'", q)
        res = [f for f in drive["files"].values() if parent in f["parents"] and (not name or f["name"] == name.group(1).replace("\\'", "'"))]
        if "mimeType = 'application/vnd.google-apps.folder'" in q: res = [f for f in res if f["mimeType"] == "application/vnd.google-apps.folder"]
        if "mimeType != 'application/vnd.google-apps.folder'" in q: res = [f for f in res if f["mimeType"] != "application/vnd.google-apps.folder"]
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"files": [{k: f[k] for k in ("id", "name", "mimeType", "modifiedTime")} for f in res]}))
    if request.method == "POST" and not upload:
        b = json.loads(request.post_data); i = drive_new(b["name"], b["parents"][0], b["mimeType"])
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": i}))
    if request.method == "POST" and upload:
        body = request.post_data; boundary = re.search(r"boundary=(\S+)", request.headers["content-type"]).group(1)
        parts = [p for p in body.split("--" + boundary) if p.strip() and p.strip() != "--"]
        meta = json.loads(parts[0].split("\r\n\r\n", 1)[1].strip()); content = parts[1].split("\r\n\r\n", 1)[1][:-2]
        i = drive_new(meta["name"], meta["parents"][0], meta["mimeType"], content)
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": i}))
    if request.method == "PATCH":
        f = drive["files"][fid]; f["content"] = request.post_data; f["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": fid}))
    return route.fulfill(status=400, headers=CORS7, body="{}")

LONG = ["Hoy el equipo ha avanzado mucho con los pisos turísticos de Madrid. ", "Arturito ha encontrado tres modelos nuevos que pueden servirnos más baratos. ", "Mañana te propongo revisar juntos el gasto de la semana."]
def router7(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS7)
    if url.startswith("https://accounts.google.com/gsi/client"): return route.fulfill(status=200, headers={"Content-Type": "application/javascript"}, body=GIS)
    if url.startswith("https://www.googleapis.com/"): return drive_router(route, request)
    if url.startswith("https://api.anthropic.com/v1/models"):
        if request.headers.get("x-api-key") != "sk-ant-web": return route.fulfill(status=401, headers=CORS7, body=json.dumps({"error": {"message": "invalid x-api-key"}}))
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"data": [{"id": "claude-opus-5-5", "created_at": "2026-10-01T00:00:00Z"}, {"id": "claude-sonnet-5-5", "created_at": "2026-09-01T00:00:00Z"}]}))
    if url == "https://api.anthropic.com/v1/messages":
        anthropic_calls.append({"h": dict(request.headers), "b": json.loads(request.post_data)})
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"model": "claude-opus-5-5", "content": [{"type": "text", "text": "Consejo meditado de Claude directo."}], "usage": {"input_tokens": 1000, "output_tokens": 50}}))
    if url == "https://openrouter.ai/api/v1/chat/completions":
        b = json.loads(request.post_data)
        u = b["messages"][-1]["content"] if isinstance(b["messages"][-1]["content"], str) else ""
        if b.get("stream") and "cuéntame" in u.lower():   # a reply in parts: three sentences in pieces
            calls.append(b)
            chunks = []
            for f in LONG: chunks += [f[:30], f[30:]]
            sse = "".join("data: " + json.dumps({"choices": [{"delta": {"content": t}}]}) + "\n\n" for t in chunks)
            sse += "data: " + json.dumps({"choices": [], "usage": {"prompt_tokens": 200, "completion_tokens": 60, "cost": 0.0011}}) + "\n\ndata: [DONE]\n\n"
            return route.fulfill(status=200, content_type="text/event-stream", headers=CORS7, body=sse)
    return router(route, request)

def drive_list(): return sorted(drive_paths())
def drive_paths():
    out = []
    def rec(pid, rel_path):
        for f in drive["files"].values():
            if pid in f["parents"]:
                r = (rel_path + "/" if rel_path else "") + f["name"]
                out.append(r)
                if f["mimeType"] == "application/vnd.google-apps.folder": rec(f["id"], r)
    root = drive_path("")
    if root: rec(root, "")
    return out
def photo(page, name, full=False): page.screenshot(path=os.path.join(OUTPUT, "v7-" + name + ".png"), full_page=full)

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
        ctx.add_init_script(INIT); ctx.add_init_script(FAKE_VAD); ctx.route("https://**/*", router7)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        enter(page)
        page.wait_for_selector("#drawer:not([hidden])", timeout=8000)
        # ---------- Your key: where it is and where it goes ----------
        txt = page.inner_text("#drawerBody")
        check("No pasa por ningún servidor de Fer Agent" in txt and "directamente a OpenRouter" in txt, "Settings explains clearly where the key is and where it travels")
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tier"); install_team(page)   # v8: the team is installed from “Agentes de serie”
        # ---------- 1. The brake ----------
        page.wait_for_selector(".tier")
        check(page.get_attribute("#pause", "aria-pressed") == "true" and page.inner_text("#pauseTxt") == "En pausa" and page.inner_text("#pauseSub") == "nada gasta solo", "the master switch, next to the counter: it starts paused")
        check(page.inner_text("#backupWhen") == "última: nunca" and "stale" in page.get_attribute("#quickBackup", "class"), "“Guardar copia” visible on top, warning that there's none yet")
        photo(page, "1-top-paused")
        page.click("#meter"); page.wait_for_selector("#drawerBody .who-spends")
        rows = page.eval_on_selector_all("#drawerBody .spender-row", "fs => fs.map(f => f.innerText.replace(/\\s+/g, ' '))")
        art = next(f for f in rows if f.startswith("Arturito"))
        check("avanza en su objetivo" in art and "por latido" in art and "al día" in art, f"Spending: who spends when waking up and how much (Arturito: “{art[:110]}”)")
        check(any(f.startswith("Interventor") and "no gasta" in f for f in rows), "the fixed-rule ones: “no gasta”")
        photo(page, "2-spending-who-spends")
        page.click("#drawerBody .spender-row:has-text('Arturito') button:text-is('Solo a petición')"); page.wait_for_timeout(300)
        check(agent(page, "Arturito")["heartbeat"]["unit"] == "on_request", "one tap and Arturito moves to “solo a petición”")
        page.click("#drawerBody .pause-btn"); page.wait_for_timeout(300)
        check(state(page)["settings"]["pause"] is False and page.get_attribute("#pause", "aria-pressed") == "false", "the switch can also be started from Spending")
        page.click("#closeDrawer")
        page.click("#pause"); page.wait_for_timeout(300)
        check(state(page)["settings"]["pause"] is True, "and paused again from the top")
        # ---------- 2. Navigation: logo, back arrow and “Volver” ----------
        page.click("#toLanding"); page.wait_for_timeout(500)
        check(page.is_visible("#landing .hero"), "the “Fer Agent” logo goes to the home page")
        page.go_back(); page.wait_for_timeout(600)
        check(not page.is_visible("#landing .hero") and page.is_visible(".tier"), "the browser's back arrow returns to the building")
        check(page.is_visible("#backToLanding"), "in the building, “Volver a la portada” is visible")
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        page.go_back(); page.wait_for_timeout(400)
        check(page.is_hidden("#chatView"), "from the chat, the back arrow returns to the building")
        page.go_forward(); page.wait_for_timeout(400)
        check(page.is_visible("#chatView"), "and the forward one returns to the chat")
        page.click("#closeChat"); page.wait_for_timeout(300)
        page.click("#openRooms"); page.wait_for_selector("#roomsView:not([hidden])")
        check(page.is_visible("#roomsView .back-btn"), "Reuniones: «Volver» visible")
        page.go_back(); page.wait_for_timeout(300)
        check(page.is_hidden("#roomsView"), "back from Meetings")
        page.click("#openSettings"); page.wait_for_selector("#drawer:not([hidden])")
        check(page.inner_text("#closeDrawer") == "← Volver", "Settings and the other drawers: “← Volver”")
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        check(page.is_hidden("#drawer"), "Escape goes back too")
        # closing something from the program (Cancel) doesn't leave an empty step: the first “back” already changes something
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        page.click("#closeChat"); page.wait_for_timeout(300)
        page.click("#createFloor"); page.wait_for_selector("#drawer:not([hidden])")
        page.click("#drawerBody button:text-is('Cancelar')"); page.wait_for_timeout(300)
        n_before = page.evaluate("history.state && history.state.n")
        page.go_back(); page.wait_for_timeout(600)
        n_after, v_after = page.evaluate("[history.state && history.state.n, history.state && history.state.v]")
        check(n_after < n_before - 1 and v_after != "building", f"after “Cancelar”, the first back arrow already changes screen: it skips the steps that left everything the same ({n_before} → {n_after}, {v_after})")
        page.go_forward(); page.wait_for_timeout(600)
        check(page.is_visible(".tier") and not page.is_visible("#landing .hero") and page.is_hidden("#drawer"), "and the forward one returns to the building")
        # ---------- 3. The building's objectives ----------
        page.click("#openSettings")
        ta = "#drawerBody .field:has(> span:text-is('Objetivos del edificio (tuyos o de tu empresa)')) textarea"
        page.fill(ta, "Alquilar todos los pisos turísticos de la empresa\nAhorrar dos horas al día al equipo\nUna\nDos\nTres\nSeis: sobra")
        tally = page.inner_text("#drawerBody .counter")
        check(tally.startswith("6/5 líneas") and "bad" in page.get_attribute("#drawerBody .counter", "class"), f"line counter: “{tally}”")
        page.keyboard.press("Tab"); page.wait_for_timeout(400)
        check(state(page)["objectives"].count("\n") == 4, "five lines at most are saved")
        photo(page, "3-settings-objectives")
        # ---------- 4. Other APIs (v8): Claude with your subscription's key, chosen in the profile ----------
        page.click("#drawerBody button:text-is('+ Claude (Anthropic)')"); page.wait_for_timeout(400)
        block = "#drawerBody .api-row:has(> span:text-matches('^Claude'))"
        page.fill(f"{block} input[type=password]", "sk-ant-web"); page.click(f"{block} button:text-is('Guardar')"); page.wait_for_timeout(300)
        check(page.evaluate("localStorage.getItem('ferAgent.keyAnthropic')") == "sk-ant-web", "Other APIs: Claude's key is only saved in this browser")
        check("clave-anthropic" not in json.dumps(state(page)) and "sk-ant-web" not in json.dumps(state(page)), "and it doesn't go inside the building (neither in backups nor when moving)")
        page.click(f"{block} button:text-is('Probar')"); page.wait_for_selector(f"{block} >> text=Funciona: 2 modelos", timeout=8000)
        check(True, "“Probar” talks to Claude's API and lists your models")
        photo(page, "4-settings-other-apis")
        page.click("#closeDrawer")
        profile(page, "Sabio 1", "Cerebro y gasto")
        sel_prov = "#profile .field:has(> span:text-is('Con qué piensa')) select"
        opts = page.eval_on_selector_all(sel_prov + " option", "os => os.map(o => o.textContent)")
        check(opts[:1] == ["OpenRouter (se paga por uso)"] and "Claude (Anthropic) · tu clave" in opts, f"in the profile, “Con qué piensa”: OpenRouter or your API ({opts})")
        page.select_option(sel_prov, "anthropic"); page.wait_for_timeout(500)
        s1 = agent(page, "Sabio 1")
        check(s1["provider"] == "anthropic" and s1["brain"].startswith("claude-"), f"Sabio 1 thinks with Claude from your subscription ({s1['brain']})")
        check(page.eval_on_selector(sel_prov, "s => s.value") == "anthropic" and page.is_visible("#profile >> text=Con tu clave de Claude: gasta de su saldo de API"), "its profile says so: it comes out of your subscription, it doesn't count towards the cap")
        check(page.is_visible("#profile >> text=Si se acaba tu cupo de Claude"), "and what to do if the quota runs out (OpenRouter or stop)")
        photo(page, "5-profile-other-api")
        chat_with(page, "Sabio 1"); send(page, "¿Compro el terreno del norte?")
        page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        check("Consejo meditado de Claude directo." in page.inner_text("#messages") and anthropic_calls and anthropic_calls[-1]["h"].get("anthropic-dangerous-direct-browser-access") == "true", "the sage answers with Claude, from the browser")
        check(": tu clave" in page.inner_text("#messages .msg.bot:not(.greeting) .meta"), "below the reply: “tu clave, pago por uso” (9.2.4: a key is paid per use, it isn't your app plan)")
        check(anthropic_calls[-1]["b"]["system"].startswith("Eres un sabio") and "Organigrama" not in anthropic_calls[-1]["b"]["system"], "the sage doesn't get the org chart")
        page.click("#closeChat")
        # ---------- 5. Personality and what each agent reads ----------
        profile(page, "Tecno", "Trabajo")
        page.fill("#profile .field:has(> span:text-is('Personalidad')) textarea", "Seco, con humor negro y muy al grano."); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(agent(page, "Tecno")["personality"] == "Seco, con humor negro y muy al grano.", "“Personalidad” field in the profile")
        photo(page, "6-profile-personality")
        n0 = len(calls)
        chat_with(page, "Tecno"); send(page, "¿Qué tal todo?"); page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        s = [x for x in calls[n0:] if "messages" in x][-1]["messages"][0]["content"]
        check("Tu personalidad: Seco, con humor negro" in s and "Objetivos del edificio:\nAlquilar todos los pisos" in s and "ME FALTA:" in s, "each call carries its personality, the building's objectives and the rule against making things up")
        check("Planta técnica:" in s and "latido" not in s.split("Organigrama")[1][:600], "the org chart, only what it needs and without details")
        # ---------- 6. Coins: big, rule written up and on the figure ----------
        tam = page.eval_on_selector("#messages .msg.bot:not(.greeting) .meta .coin-btn .coin", "m => m.getBoundingClientRect().width")
        check(tam >= 19, f"bigger coins below each reply ({tam:.0f} px)")
        page.click("#messages .msg.bot:not(.greeting) .coin-btn >> nth=0")
        page.fill(".reason-row input", "Conocía perfectamente su función"); page.click(".reason-row .btn.primary")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        photo(page, "7-chat-big-coins")
        page.click("#closeChat")
        check(page.inner_text("#inboxBadge") == "1", "the inbox warns: 1 thing waits for your yes")
        techie_figure = ".tier .fig[data-id='techie'] .coins-fig"
        check(page.is_visible(techie_figure) and page.inner_text(techie_figure).strip() == "1", "Tecno's figure carries its coin counter")
        page.click("#openInbox"); page.wait_for_selector("#inboxView .request")
        photo(page, "8-inbox")
        page.fill("#inboxView .request:has-text('Lección nueva') textarea", "Antes de contestar, repasa tu función y di solo lo que te toca.")
        page.click("#inboxView .request:has-text('Lección nueva') button:has-text('Todos los de su papel')"); page.wait_for_timeout(400)
        lec = [l for l in state(page)["lessons"] if l["state"] == "approved"]
        check(lec and lec[-1]["text"] == "Antes de contestar, repasa tu función y di solo lo que te toca." and lec[-1]["role"] == "techie", "you approve the (retouched) rule in the inbox and it's now a lesson of its role")
        check(page.is_visible("#inboxView .inbox-empty") and page.is_hidden("#inboxBadge"), "empty inbox and no warning")
        page.click("#inboxView .back-btn")
        # ---------- 7. The inbox with what the boss proposes and what an agent is missing ----------
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        send(page, "Quiero un agente nuevo para la tienda"); page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        page.wait_for_timeout(500)
        check(any("en pausa" in c for c in page.eval_on_selector_all("#messages .chip", "cs => cs.map(c => c.textContent)")), "while paused, the task the boss hands out waits (and says so)")
        page.click("#closeChat")
        profile(page, "Creador de agentes", "Identidad"); page.click("#profile >> text=Despertar ahora")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).proposals.some(p => p.state === 'pending')", timeout=15000)
        page.click("#openInbox"); page.wait_for_selector("#inboxView .request:has-text('Agente nuevo')")
        cost = page.inner_text("#inboxView .request:has-text('Agente nuevo') .p-cost")
        check(cost.endswith("al día"), f"the agent the Creator designs reaches the inbox with what it would spend: “{cost}”")
        page.click("#inboxView .request:has-text('Agente nuevo') button:text-is('Crear')"); page.wait_for_timeout(500)
        check(any(a["name"] == "Tendero" for a in state(page)["agents"]), "“Crear” from the inbox")
        page.click("#inboxView .back-btn")
        page.evaluate("""() => { const e = JSON.parse(localStorage.getItem('ferAgent.state')); }""")
        # ---------- 8. Prices and models ----------
        page.click("#openSettings")
        def options(field): return page.eval_on_selector_all(f"#drawerBody .field:has(> span:text-is('{field}')) option", "os => os.map(o => o.textContent)")
        img = options("Crear imágenes"); mus = options("Crear música"); hear = options("Oír: tu voz a texto")
        flux = next(o for o in img if o.startswith("FLUX.2 Max")); recraft = next(o for o in img if o.startswith("Recraft V4 Pro"))
        check("0,07 $ por imagen" in flux and "Gratis" not in flux, f"FLUX.2 Max no longer shows as free: “{flux}”")
        check("$ por imagen" in recraft and "Gratis" not in recraft, f"Recraft V4 Pro: «{recraft}»")
        mai = next(o for o in hear if o.startswith("MAI-Transcribe"))
        check("0,36 $ por hora" in mai, f"MAI-Transcribe 1.5 at 0,36 $ an hour: “{mai}”")
        lyria = next(o for o in mus if o.startswith("Lyria 3 Pro"))
        check("precio no publicado" in lyria and "0,08 $ por canción" in lyria, f"Lyria: «{lyria}»")
        check(not any("GPT Audio" in o for o in mus), "GPT Audio no longer appears in “Crear música”")
        check(page.is_visible("#drawerBody >> text=Dónde se activa: en la ficha de cada agente → Capacidades → «Crear música».") , "it says where “Crear música” is turned on")
        page.click("#closeDrawer")
        profile(page, "Jefe", "Cerebro y gasto")
        groups = page.eval_on_selector_all("#profile .field:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label + ': ' + [...g.children].map(o => o.value).join(','))")
        # 9.1: no recommended ones (they go out of date in a week): all of OpenRouter's, from cheapest to most expensive
        check(not any(g.startswith("Recomendados") for g in groups), f"no recommended groups: {[g[:40] for g in groups]}")
        todos = next((g for g in groups if g.startswith("Todos")), "")
        ids = todos.split(": ", 1)[1].split(",") if ": " in todos else []
        labels = page.eval_on_selector_all("#profile .field:has(> span:text-is('Cerebro')) optgroup[label^='Todos'] option", "os => os.map(o => o.textContent)")
        def price(t):
            m = re.search(r"([\d.,]+) / ([\d.,]+) \$", t)
            return float(m.group(1).replace(".", "").replace(",", ".")) + float(m.group(2).replace(".", "").replace(",", ".")) if m else 0
        ps = [price(t) for t in labels]
        check(len(ps) > 3 and ps == sorted(ps), f"all of them, from cheapest to most expensive ({[round(x, 2) for x in ps]})")
        # ---------- 9. Voice: sentence by sentence, “Parar” and interrupting it by talking ----------
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        page.click("#speaker")
        n0 = len(calls)
        send(page, "Cuéntame cómo va todo")
        page.wait_for_selector("#stopVoice:not([hidden])", timeout=10000)
        photo(page, "9-chat-speaking-stop")
        page.wait_for_function("document.querySelector('#stopVoice').hidden", timeout=15000)
        voices = [x["voice"]["input"] for x in calls[n0:] if "voice" in x]
        check(len(voices) == 3 and voices[0].startswith("Hoy el equipo") and voices[2].startswith("Mañana"), f"it speaks sentence by sentence while it writes: {len(voices)} pieces of voice")
        requested = [x for x in calls[n0:] if "messages" in x][0]
        check(requested.get("stream") is True and "habláis por voz: contesta corto" in requested["messages"][0]["content"] and requested.get("max_tokens") == 400, "with voice: a reply in parts, and short")
        check("Hoy el equipo ha avanzado" in page.inner_text("#messages"), "the text also appears in the chat")
        send(page, "Cuéntame otra vez"); page.wait_for_selector("#stopVoice:not([hidden])", timeout=10000)
        page.click("#stopVoice"); page.wait_for_timeout(300)
        check(page.is_hidden("#stopVoice") and page.inner_text("#bossState") == "Listo para hablar", "“Parar” silences it at once")
        page.wait_for_timeout(1500)
        page.click("#micro"); page.wait_for_function("window.__vadOpts && window.__vadCalls.includes('start')", timeout=8000)
        page.evaluate("window.__vadOpts.onSpeechEnd(new Float32Array(16000))")
        page.wait_for_selector("#stopVoice:not([hidden])", timeout=15000)
        page.evaluate("window.__vadOpts.onSpeechRealStart()"); page.wait_for_timeout(200)
        check(page.is_hidden("#stopVoice") and page.inner_text("#bossState").startswith("Te estoy oyendo"), "if you talk to it while it's speaking, it goes quiet and listens to you")
        check(window_calls := page.evaluate("window.__vadCalls").count("pause") <= 2, "the mic doesn't switch off while it speaks")
        page.click("#micro"); page.click("#speaker"); page.click("#closeChat")
        # ---------- 10. Images and music that aren't lost ----------
        page.click("#talkToBoss"); send(page, "Dibuja un faro"); page.wait_for_selector("#messages .bubble img", timeout=15000)
        page.reload(); enter(page); page.wait_for_selector(".tier")
        page.click("#talkToBoss"); page.wait_for_timeout(800)
        src = page.eval_on_selector("#messages .bubble img", "i => i.src") if page.is_visible("#messages .bubble img") else ""
        check(src.startswith("data:image/png"), "the image is still there after reloading the page")
        page.click("#closeChat")
        # ---------- 11. Backup and moving ----------
        with page.expect_download() as d: page.click("#quickBackup")
        backup = json.loads(open(d.value.path()).read())
        check(backup["type"] == "fer-agent-backup" and len(backup["media"]) == 1 and "sk-or" not in json.dumps(backup) and "sk-ant" not in json.dumps(backup), "“Guardar copia”: the whole building with its images, without any key")
        check(page.inner_text("#backupWhen") == "última: ahora mismo" and "stale" not in page.get_attribute("#quickBackup", "class"), "and it says when the last one was")
        page.click("#openSettings")
        with page.expect_download() as d: page.click("#drawerBody button:text-is('Preparar la mudanza')")
        relocation = d.value.path()
        photo(page, "10-settings-backups-move")
        page.click("#closeDrawer")
        ctx2 = b.new_context(viewport={"width": 1360, "height": 900}); ctx2.add_init_script(INIT); ctx2.route("https://**/*", router7)
        p2 = ctx2.new_page(); p2.goto(URL); enter(p2); p2.wait_for_selector("#drawer:not([hidden])")
        p2.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); p2.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        p2.click("#openSettings"); p2.set_input_files("#drawerBody input[type=file][accept^='application/json']", relocation); p2.wait_for_timeout(1200)
        e2 = state(p2)
        check(any(a["name"] == "Tendero" for a in e2["agents"]) and e2["objectives"].startswith("Alquilar") and agent(p2, "Tecno")["personality"].startswith("Seco"), "moving: on the new website, the same agents, objectives and personalities")
        p2.click("#talkToBoss"); p2.wait_for_timeout(800)
        check(p2.is_visible("#messages .bubble img"), "and the images")
        check(p2.evaluate("localStorage.getItem('ferAgent.keyAnthropic')") is None, "the keys don't travel when moving")
        ctx2.close()
        # ---------- 12. The brain folder in Google Drive ----------
        page.click("#openSettings")
        page.click("#drawerBody summary:text-is('Pasos para conectar Drive (una vez, unos 10 minutos)')")
        photo(page, "11-settings-brain-drive")
        page.fill("#drawerBody input[placeholder^='ID de cliente']", "123-abc.apps.googleusercontent.com")
        page.click("#drawerBody button:text-is('Conectar Google Drive')")
        page.wait_for_selector("#drawerBody .folder-state .dot.ok", timeout=15000)
        gis = page.evaluate("window.__gis")
        check(gis[0]["scope"] == "https://www.googleapis.com/auth/drive.file" and gis[0]["client_id"] == "123-abc.apps.googleusercontent.com", "it only asks Google for the drive.file permission (it only sees what the website creates)")
        paths = drive_list()
        check({"Biblioteca", "Memoria larga", "Memoria larga/Índice.md", "edificio.json"} <= set(paths), f"it creates the “Fer Agent” folder in your Drive with Biblioteca, Memoria larga and the backup: {paths}")
        page.click("#closeDrawer")
        page.click("#talkToBoss"); send(page, "Guarda que el coche es un Seat azul"); page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta >> nth=-1", timeout=15000)
        for _ in range(60):
            if drive_path("Memoria larga/coche.md"): break
            page.wait_for_timeout(250)
        page.wait_for_timeout(300)
        note = drive["files"].get(drive_path("Memoria larga/coche.md"), {}).get("content", "")
        if not note: print("DEBUG drive:", drive_list(), "memory:", [(n.get("topic"), n["text"]) for n in state(page)["longMemory"]], "conv:", [m.get("content", "")[:80] for m in state(page)["conversation"][-3:]])
        check("El coche de la empresa es un Seat azul #coche" in note, "what Memory saves appears in Drive as an Obsidian note (Memoria larga/coche.md)")
        # you correct it in Obsidian (in Drive) and the website reads it again
        f = drive["files"][drive_path("Memoria larga/coche.md")]
        f["content"] = f["content"].replace("Seat azul", "Seat rojo"); f["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        page.click("#closeChat"); page.click("#openSettings"); page.click("#drawerBody button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(any("Seat rojo" in n["text"] for n in state(page)["longMemory"]), "what you correct by hand in the note comes back to the website")
        page.set_input_files("#drawerBody input[type=file][multiple]", files=[{"name": "Hipoteca.md", "mimeType": "text/markdown", "buffer": "# Hipoteca\n\nEl tipo fijo es del 2,1 %.".encode()}]); page.wait_for_timeout(1500)
        check("Biblioteca/Hipoteca.md" in drive_list(), "“Añadir notas a la Biblioteca” uploads them to your folder")
        # the phone saves the building with another name: the website loads it
        ed_json = drive["files"][drive_path("edificio.json")]
        d = json.loads(ed_json["content"]); d["device"] = "ap_movil"; d["ts"] = int(time.time() * 1000) + 5000; d["building"]["name"] = "Edificio desde el móvil"
        ed_json["content"] = json.dumps(d); ed_json["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        page.click("#drawerBody button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(page.inner_text("#buildingName") == "Edificio desde el móvil", "the building your other device saved is loaded here (the phone and the Mac see the same one)")
        # both devices change things: nothing is overwritten until you choose
        page.fill(ta, "Alquilar todos los pisos\nCambiado en el Mac"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        d = json.loads(ed_json["content"]); d["ts"] = int(time.time() * 1000) + 9000; d["building"]["objectives"] = "Cambiado en el móvil"
        ed_json["content"] = json.dumps(d); ed_json["modifiedTime"] = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
        page.click("#drawerBody button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(page.is_visible("#conflict") and json.loads(drive["files"][drive_path("edificio.json")]["content"])["device"] == "ap_movil",
              "conflict: it asks which ones you keep and, meanwhile, it doesn't write over the other device's")
        page.click("#drawerBody button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1200)
        check(json.loads(drive["files"][drive_path("edificio.json")]["content"])["device"] == "ap_movil", "ni aunque vuelva a sincronizar")
        page.click("#conflict button:text-is('Quedarme con los de aquí')"); page.wait_for_timeout(1200)
        dj = json.loads(drive["files"][drive_path("edificio.json")]["content"])
        check(dj["device"] != "ap_movil" and "Cambiado en el Mac" in dj["building"]["objectives"] and page.is_hidden("#conflict"), "you choose “los de aquí” and then they're saved in the folder")
        page.click("#closeDrawer")
        # ---------- 12b. Or a folder on this computer (Chrome's picker is replaced by the browser's private folder) ----------
        page.evaluate("""async () => {
          const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Fer Agent', { create: true });
          const bib = await d.getDirectoryHandle('Biblioteca', { create: true });
          const f = await bib.getFileHandle('Viajes.md', { create: true }); const w = await f.createWritable(); await w.write('# Viajes\\n\\nEn octubre fuimos a Asunción para la boda.'); await w.close();
          window.showDirectoryPicker = async () => d; }""")
        page.click("#openSettings"); page.click("#drawerBody button:text-is('Elegir carpeta')"); page.wait_for_timeout(2500)
        est = page.inner_text("#drawerBody .folder-state")
        check("Conectado: Carpeta de este ordenador «Fer Agent»" in est and "1 notas en la Biblioteca" in est, f"a folder on this computer: connected and read ({est[:90]})")
        ed_local = page.evaluate("""async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Fer Agent'); const m = await d.getDirectoryHandle('Memoria larga'); const f = await m.getFileHandle('coche.md'); const e = await d.getFileHandle('edificio.json'); return [await (await f.getFile()).text(), JSON.parse(await (await e.getFile()).text()).type]; }""")
        check("Seat rojo" in ed_local[0] and ed_local[1] == "fer-agent-building", "it writes the long-term memory and the building's backup in that folder")
        page.click("#closeDrawer")
        check(not errors, f"no JavaScript errors: {errors}")
        # ---------- 13. Mobile ----------
        page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(400)
        photo(page, "12-mobile-top")
        page.click("#openInbox"); page.wait_for_selector("#inboxView:not([hidden])")
        width = page.evaluate("document.documentElement.scrollWidth")
        check(width <= 392, f"inbox on the phone without overflowing ({width} px)")
        photo(page, "13-mobile-inbox")
        b.close()
finally:
    server.terminate()
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
