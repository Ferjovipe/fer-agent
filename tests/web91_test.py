"""Tests of the website, version 9.1 (first round of Fer's list), in Spanish, with a simulated OpenRouter:
- the new logo (home page, top bar and tab icon) and the building's heart next to the pause;
- the screen isn't redrawn when nothing changes (before, it shook on every check);
- the brain picker: all of OpenRouter's from cheapest to most expensive, no recommended ones, a link to the most popular ones, warnings when choosing;
- «When it works» (only when asked / wakes up by itself / off), the pause warning with its button, «Wake up now» that always says what happened;
- what an agent does on waking up, in its own chat; a «Copy» button on every message; «start from scratch»;
- the Creator designs from its chat; «Create agent» asks for the personality only once; priority 1 = the most important.
Usage: python3 tests/web91_test.py   (leaves screenshots in tests/screenshots/v91-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8819"))

# models: one that doesn't use tools and a free one, to see the warnings
TEXT.append(m("google/gemma-3-4b-it", "Gemma 3 4B", "0.00000001", "0.00000002", supported_parameters=["temperature", "max_tokens"]))
TEXT.append(m("google/gemma-4-26b-a4b-it:free", "Gemma 4 26B A4B (free)", "0", "0", supported_parameters=["tools", "temperature"]))
for x in TEXT:
    if "supported_parameters" not in x: x["supported_parameters"] = ["tools", "tool_choice", "temperature"]
ALL["data"] = TEXT + VOICES + HEARING_MODELS + IMAGES + MUSIC + DECISIONS + OTHERS

DESIGN = {"name": "Redactor 1", "role": "subagent", "floor": "tech", "seat": "office", "instructions": "Escribes historias de ficción en español.", "objective": "Escribir historias.",
          "personality": "Un genio loco.", "level": "budget", "heartbeat": {"every": 1, "unit": "on_request"}, "onWake": "tasks", "capabilities": ["write"], "look": {"p": "boy"}, "why": "Un escritor, solo cuando se lo pidas."}
# a character on a plain green background, as the image model is asked for (to cut it out)
import io, base64
from PIL import Image, ImageDraw
_im = Image.new("RGB", (300, 600), (0, 255, 0)); _d = ImageDraw.Draw(_im)
_d.ellipse((110, 60, 190, 140), fill=(240, 190, 160)); _d.rectangle((95, 150, 205, 420), fill=(200, 40, 40)); _d.rectangle((110, 420, 190, 560), fill=(30, 30, 90))
_buf = io.BytesIO(); _im.save(_buf, "PNG"); GREEN = base64.b64encode(_buf.getvalue()).decode()
def chat91(b):
    msgs = b["messages"]; sys0 = str(msgs[0]["content"]); last = msgs[-1]
    user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""}); ut = user["content"] if isinstance(user["content"], str) else ""
    if "Estás en la sala de bucle" in sys0:
        prev = re.search(r"La última versión, de [^:]+:\n<<<\n([\s\S]*?)\n>>>", ut)
        who = re.search(r"Te llamas ([^.]+)\.", sys0).group(1)
        return resp((prev.group(1) + " + " + who) if prev else "v1 de " + who, cost=0.0002)
    if "El bucle ha terminado" in ut: return resp("Mejoró en cada vuelta; la última es la mejor.")
    if "Escribe el objetivo del agente" in sys0: return resp("Saludar cada mañana con una frase distinta.")
    if "Responde SOLO con un objeto JSON" in sys0 and "Creador" in sys0: return resp(json.dumps(DESIGN))
    if "Creador de agentes" in sys0 and last["role"] == "tool": return resp("Te lo he dejado aquí abajo: acéptalo para crearlo.")
    if "Creador de agentes" in sys0 and "crea un redactor" in ut.lower(): return resp("", ("design_agent", {"request": "Un escritor de ficción llamado Redactor 1, solo cuando se lo pidan."}))
    if "Gemma" in sys0: return resp("¡Hola! Que tengas un día precioso.", cost=0.0001)
    return chat(b)
FAIL = {"Brunos": False}   # the «Brunos» loop: while True, every brain call fails (as with the timeout Fer saw)
def router91(route, request):
    if request.url == "https://openrouter.ai/api/v1/chat/completions" and request.method == "POST" and FAIL["Brunos"] and "«Brunos»" in request.post_data:
        return route.fulfill(status=500, content_type="application/json", headers=CORS, body=json.dumps({"error": {"message": "The operation was aborted due to timeout"}}))
    if request.url == "https://openrouter.ai/api/v1/images" and request.method == "POST" and "pure green background" in request.post_data:
        calls.append({"image": json.loads(request.post_data)})
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"data": [{"b64_json": GREEN, "media_type": "image/png"}], "usage": {"cost": 0.04}}))
    if request.url == "https://openrouter.ai/api/v1/chat/completions" and request.method == "POST":
        b = json.loads(request.post_data); calls.append(b)
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=chat91(b))
    return router(route, request)

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def photo(page, name): page.screenshot(path=os.path.join(OUTPUT, f"v91-{name}.png"))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://localhost:{PORT}")
        ctx.add_init_script(INIT)
        ctx.route("https://**/*", router91)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        # ---------- the new logo ----------
        page.wait_for_selector("#landing .button-big")
        check(page.is_visible("#landing img.landing-logo[src='img/logo.webp']") and page.get_attribute("#landing img.landing-logo", "alt") == "Fer Agent", "home page: the new logo")
        check(page.evaluate("document.querySelector('link[rel=icon]').getAttribute('href')") == "img/mark.webp", "the tab's icon: the dome")
        photo(page, "1-landing")
        enter(page, team=False)
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test")
        txt = page.inner_text("#drawerBody")
        check("¿Por qué OpenRouter?" in txt and "Fer Agent no cobra nada encima" in txt and page.is_visible("#drawerBody a.btn[href='https://openrouter.ai/keys']"), "Settings: why OpenRouter, and a direct button to get the key")
        page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        install_team(page)
        check(page.is_visible("header.top img.brand-mark") and page.is_visible("#pause .heart"), "top bar: the dome next to the name, and the heart next to the pause")
        # ---------- the screen isn't redrawn when nothing changes ----------
        page.evaluate("""() => { window.__redraws = 0; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList && m.target.classList.contains('tower')) window.__redraws++; }).observe(document.querySelector('#building'), { childList: true, subtree: true }); }""")
        page.wait_for_timeout(23000)   # at least one heartbeat of the building (every 20 s)
        check(page.evaluate("window.__redraws") == 0, f"nothing changed in 23 s: the building isn't redrawn (before 9.1 it shook): {page.evaluate('window.__redraws')}")
        # ---------- priority: 1 is the most important ----------
        profile(page, "Jefe", "Cerebro y gasto")
        check(agent(page, "Jefe")["priority"] == 1 and "1 es la más importante" in page.inner_text("#profile"), "priority: the boss is 1, the most important; and it says so")
        groups = page.eval_on_selector_all("#profile .field:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label)")
        check(not any(g.startswith("Recomendados") for g in groups) and groups[0].endswith("del más barato al más caro"), f"brain: no recommended ones, all of them cheapest first: {groups}")
        check(page.is_visible("#profile a[href*='order=most-popular']"), "and a link to OpenRouter's most popular ones")
        # ---------- an agent like Fer's Gemma: when it works, the pause, its brain ----------
        page.click("#closePanel") if page.is_visible("#closePanel") else None
        page.evaluate("""() => { const e = JSON.parse(localStorage.getItem('ferAgent.state'));
          e.agents.push(Object.assign(JSON.parse(JSON.stringify(e.agents.find(a => a.role === 'creator'))), { id: 'gemma', name: 'Gemma', role: 'subagent', floor: 'tech', seat: 'office', reportsTo: 'boss',
            instructions: 'Cada vez que despiertes, escribes un saludo simpático.', objective: 'Probar que puedes saludar.', brain: 'google/gemma-3-4b-it', heartbeat: { every: 1, unit: 'on_request' }, onWake: 'objective',
            capabilities: ['write'], chat: [{ role: 'user', content: 'Continúa la historia', ts: Date.now() - 6e4 }, { role: 'assistant', content: 'Había una vez…', ts: Date.now() - 5e4 }], shortMemory: [{ ts: Date.now(), type: 'result', text: 'Historia' }], tasks: [], spending: {}, look: { p: 'girl' } }));
          localStorage.setItem('ferAgent.state', JSON.stringify(e)); }""")
        page.reload(); page.wait_for_selector("#landing .button-big"); enter(page, team=False)
        profile(page, "Gemma", "Trabajo")
        wm = "#profile .block:has(h4:text('Cuándo trabaja'))"
        modes = page.eval_on_selector_all(f"{wm} label.cap", "ls => ls.map(l => l.querySelector('span').firstChild.textContent + (l.querySelector('input').checked ? ' ✓' : ''))")
        check(modes == ["Solo cuando se lo piden ✓", "Se despierta solo", "Apagado"], f"«When it works»: one clear choice: {modes}")
        check("Solo trabaja cuando alguien" not in page.inner_text("#profile") and not page.is_visible("#profile .block:has(h4:text-is('Latido'))"), "the old «Heartbeat» block and its fixed sentence are gone")
        page.click(f"{wm} input[value=alone]"); page.wait_for_selector(f"{wm} input[type=number]")
        page.select_option(f"{wm} select >> nth=0", "min"); page.wait_for_timeout(300)
        check(agent(page, "Gemma")["heartbeat"]["unit"] == "min", "it wakes up by itself every minute")
        check(page.is_visible(f"{wm} >> text=El edificio está en pausa general") and page.is_visible(f"{wm} button:text-is('Quitar la pausa')"), "with the general pause on, it says it won't wake up, with a button to lift it")
        check("Se despierta solo cada 1 min · en pausa" in page.inner_text("#profile .how-it-works-link"), f"the header says it: {page.inner_text('#profile .how-it-works-link')}")
        photo(page, "2-when-it-works")
        page.click(".profile-tabs button:text-is('Cerebro y gasto')")
        w = page.inner_text("#profile .brain-warnings") if page.is_visible("#profile .brain-warnings") else ""
        check("no usa herramientas" in w, f"its brain doesn't use tools: it says so when you choose it: «{w[:80]}»")
        page.select_option("#profile .field:has(> span:text-is('Cerebro')) select", "google/gemma-4-26b-a4b-it:free"); page.wait_for_timeout(400)
        w = page.inner_text("#profile .brain-warnings") if page.is_visible("#profile .brain-warnings") else ""
        check("se saturan a menudo" in w and "no usa herramientas" not in w, f"a free one with a heartbeat every minute: it warns that it'll be overloaded: «{w[:80]}»")
        page.select_option("#profile .field:has(> span:text-is('Cerebro')) select", "openai/gpt-6-luna"); page.wait_for_timeout(300)
        # ---------- «start from scratch» after changing who it is ----------
        page.click(".profile-tabs button:text-is('Trabajo')")
        page.fill("#profile .field:has(> span:text-is('Instrucciones (quién es y cómo trabaja)')) textarea", "Cada vez que despiertes, saludas con una frase."); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        check(page.is_visible("#profile .fresh-start >> text=Has cambiado quién es"), "changing who it is: it offers to start from scratch")
        page.click("#profile .fresh-start button:text-is('Empezar de cero')"); page.wait_for_timeout(400)
        g = agent(page, "Gemma")
        check(g["chat"] == [] and g["shortMemory"] == [], "started from scratch: its old conversation and short memory are gone")
        # ---------- «Wake up now» always says what happened; what it did, in its own chat ----------
        page.click("#profile button:text-is('Despertar ahora')")
        page.wait_for_selector("#toast >> text=Gemma ha terminado", timeout=15000)
        check(True, "«Wake up now»: it says it has finished")
        check(any(x["role"] == "report" and x.get("own") for x in agent(page, "Gemma")["chat"]), "what it did is in its own chat")
        page.click(f"#profile .btn.primary:text-is('Hablar con Gemma')"); page.wait_for_selector("#chatView:not([hidden])")
        rep = page.locator("#messages .msg.report").last
        check("Al despertar" in rep.inner_text() and "Que tengas un día precioso" in rep.inner_text(), f"in its chat, «On waking up» with what it wrote: {rep.inner_text()[:80]}")
        rep.locator("button.copy-btn").click(); page.wait_for_timeout(200)
        clip = page.evaluate("navigator.clipboard.readText()")
        check(clip.strip() == "¡Hola! Que tengas un día precioso." and "Copiado" in rep.inner_text(), f"«Copy» copies the whole text, as you see it: «{clip}»")
        photo(page, "3-own-chat-copy")
        # ---------- the Creator, in its own chat, designs the agent you ask it for ----------
        page.click("#closeChat")
        chat_with(page, "Creador de agentes")
        send(page, "Crea un redactor de historias")
        page.wait_for_selector("#messages .msg.report .proposal button:has-text('Crear')", timeout=15000)
        check("Redactor 1" in page.inner_text("#messages .msg.report >> nth=-1"), "the Creator's proposal, in its chat, with its buttons")
        page.click("#messages .msg.report .proposal button.btn.primary"); page.wait_for_timeout(500)
        check(any(a["name"] == "Redactor 1" for a in state(page)["agents"]), "created with your yes, without leaving the chat")
        page.click("#closeChat")
        # ---------- «Create agent»: the personality only once ----------
        page.click("#createAgent") if page.is_visible("#createAgent") else None
        page.wait_for_selector("#drawer:not([hidden]) >> text=Cuéntaselo con tus palabras")
        per = page.eval_on_selector_all("#drawerBody .field > span", "ss => ss.map(s => s.textContent).filter(t => /personalidad/i.test(t))")
        check(len(per) == 1, f"«Create agent» asks for the personality only once: {per}")
        modes = page.eval_on_selector_all("#drawerBody .work-mode label.cap", "ls => ls.map(l => l.querySelector('span').firstChild.textContent)")
        check(modes == ["Solo cuando se lo piden", "Se despierta solo"], f"and «When it works», the same choice as in the profile: {modes}")
        photo(page, "4-create-agent")
        page.click("#closeDrawer")
        # ---------- second round: Junior, the Creator writes it, personality chips ----------
        page.click("#createAgent") if page.is_visible("#createAgent") else None
        page.wait_for_selector("#drawer:not([hidden]) >> text=Cuéntaselo con tus palabras")
        roles = page.eval_on_selector_all("#drawerBody .field:has(> span:text-is('Papel')) option", "os => os.map(o => o.textContent)")
        check("Junior" in roles, f"the Junior role, for very simple and repetitive jobs: {roles}")
        page.click("#closeDrawer")
        profile(page, "Gemma", "Trabajo")
        page.click("#profile .personality-chips button:text-is('Divertido')"); page.wait_for_timeout(400)
        check("divertido" in agent(page, "Gemma")["personality"].lower(), f"personality: tick a ready-made one: «{agent(page, 'Gemma')['personality']}»")
        page.fill("#profile .field:has(> span:text-is('Objetivo')) textarea", "que salude por las mañanas")
        page.locator("#profile button.creator-writes").last.click()
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).agents.find(a => a.name === 'Gemma').objective.startsWith('Saludar cada mañana')", timeout=15000)
        check(page.input_value("#profile .field:has(> span:text-is('Objetivo')) textarea").startswith("Saludar cada mañana"), "«Let the Creator write it»: the objective, written from your words")
        photo(page, "5-work-creator-chips")
        # ---------- a coin: the boss asks who learns the lesson ----------
        chat_with(page, "Gemma")
        page.locator("#messages .msg.report .coin-btn").first.click()
        page.fill(".reason-row input", "Saludó con gracia"); page.click(".reason-row .btn.primary")
        page.wait_for_timeout(800); page.click("#closeChat")
        chat_with(page, "Jefe")
        page.wait_for_selector("#messages .lesson-reach", timeout=15000)
        check("Te gustó lo que hizo Gemma" in page.inner_text("#messages .msg.report >> nth=-1"), "the boss asks, in its chat, who should learn it")
        page.click("#messages .lesson-reach button:has-text('Solo Gemma')"); page.wait_for_timeout(500)
        l = next(x for x in state(page)["lessons"] if "gracia" in x.get("reason", ""))
        check(l["state"] == "approved" and l.get("scope") == "agent", f"only Gemma learns it: {l.get('scope')}")
        check("La aprende: solo Gemma" in page.inner_text("#messages"), "and the chat says who learns it")
        page.click("#closeChat")
        # ---------- a loop room: each one improves the previous one's whole version ----------
        page.click("#openRooms"); page.wait_for_selector("#roomsView:not([hidden]) .form-dark")
        page.fill(".form-dark input >> nth=0", "Lupes")
        page.click(".room-mode:has-text('Bucle: mejorar') input"); page.wait_for_timeout(300)
        page.fill(".form-dark textarea", "¿Cuál es la mejor forma de aprender un idioma?")
        page.click(".choose-attendees label:has-text('Gemma') input"); page.click(".choose-attendees label:has-text('Redactor 1') input")
        check("Gemma → Redactor 1" in page.inner_text(".form-dark .loop-order"), f"the order of the loop, as you tick them: {page.inner_text('.form-dark .loop-order')}")
        page.fill(".form-dark input[type=number]", "2")
        page.click(".form-dark .btn.primary"); page.wait_for_selector(".room .btn.primary")
        page.click(".room .btn.primary")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).meetings.some(r => r.title === 'Lupes' && r.state === 'finished')", timeout=30000)
        page.wait_for_selector(".room .minutes", timeout=10000)
        mins = page.inner_text(".room .minutes")
        check("v1 de Gemma + Redactor 1 + Gemma + Redactor 1" in mins and "Cómo se llegó aquí" in mins, f"the minutes: the last version, whole, and how it got there: «{mins[:120]}»")
        check(page.is_visible(".room .minutes .copy-btn") and "versión 4" in page.inner_text(".room .transcript"), "every version is kept, and the result can be copied")
        photo(page, "6-loop-room")
        # ---------- a loop where everyone fails: it stops (not before trying each one), says why and can be resumed ----------
        FAIL["Brunos"] = True
        page.click(".rooms-list .btn.primary:has-text('Nueva reunión')"); page.wait_for_selector("#roomsView .form-dark")
        page.fill(".form-dark input >> nth=0", "Brunos")
        page.click(".room-mode:has-text('Bucle: mejorar') input"); page.wait_for_timeout(300)
        page.fill(".form-dark textarea", "¿De dónde vinieron los monos de América?")
        page.click(".choose-attendees label:has-text('Gemma') input"); page.click(".choose-attendees label:has-text('Redactor 1') input")
        page.fill(".form-dark input[type=number]", "1")
        page.click(".form-dark .btn.primary"); page.wait_for_selector(".room .btn.primary")
        page.click(".room .btn.primary")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).meetings.some(r => r.title === 'Brunos' && r.state === 'interrupted')", timeout=40000)
        page.wait_for_selector(".room button:text-is('Reanudar')", timeout=10000)
        said = page.inner_text(".room .transcript")
        check(said.count("no pudo hacer su turno") == 2 and "nadie pudo hacer su turno" in page.inner_text(".room"), f"each one was tried, it says why it stopped and offers «Reanudar»: «{said[:160]}»")
        photo(page, "7-loop-resume")
        FAIL["Brunos"] = False
        page.click(".room button:text-is('Reanudar')")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).meetings.some(r => r.title === 'Brunos' && r.state === 'finished')", timeout=30000)
        page.wait_for_selector(".room .minutes", timeout=10000)
        check("v1 de Gemma + Redactor 1" in page.inner_text(".room .minutes") and "no pudo" not in page.inner_text(".room .transcript"), "resumed: the failed turns are done again and the minutes come out")
        page.click("#roomsView .back-btn")
        # ---------- its own look, made with AI ----------
        profile(page, "Gemma", "Identidad")
        page.click("#profile button:text-is('Cambiar su aspecto')"); page.wait_for_selector("#drawerBody .own-look")
        page.fill("#drawerBody .own-look textarea", "una chica con chaqueta roja")
        page.click("#drawerBody .own-look button:text-is('Crearlo con IA')")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).agents.find(a => a.name === 'Gemma').look.p === 'custom'", timeout=20000)
        look = agent(page, "Gemma")["look"]
        check(look["media"].startswith("med_") and look["accent"].startswith("#"), f"its own look: kept with the media, with its colour ({look})")
        img = [x for x in calls if isinstance(x, dict) and "image" in x][-1]["image"]
        check("pure green background" in img["prompt"] and "una chica con chaqueta roja" in img["prompt"], "asked in the building's style, on green, with your description")
        corner = page.evaluate("""async () => { const src = document.querySelector('#drawerBody .fig-preview').src; const i = new Image(); i.src = src; await i.decode();
          const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return [c.width, c.height, x.getImageData(0, 0, 1, 1).data[3]]; }""")
        check(corner[1] == 880 and corner[2] == 0, f"cut out of the green and sized like the others: {corner}")
        page.click("#closeDrawer"); page.wait_for_timeout(500)
        check(page.eval_on_selector(f".fig[data-id='gemma'] img", "i => i.src.startsWith('data:image/png') || i.src.startsWith('blob:')"), "and that's how it looks in the building")
        photo(page, "7-own-look")
        check(not errors, f"no JavaScript errors: {errors[:3]}")
        b.close()
finally:
    server.terminate()
print("ALL OK" if ok else "THERE ARE FAILURES")
sys.exit(0 if ok else 1)
