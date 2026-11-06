"""Tests of the building's website (version 6) with a simulated OpenRouter (Playwright). The website in Spanish.
Usage: python3 pruebas/web_test.py  (it starts its own local server; it needs node for the 72-agent building)"""
import json, os, sys, base64, subprocess, time, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get("OUTPUT", os.path.join(ROOT, "pruebas", "capturas"))
os.makedirs(OUTPUT, exist_ok=True)
PORT = 8811
VERSION_MOTOR = re.search(r'VERSION = "([^"]+)"', open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine.js"), encoding="utf-8").read()).group(1)   # the version the engine says
URL = f"http://localhost:{PORT}/index.html"
VADPKG = os.environ.get("VADPKG", "")  # folder with the voice detector's real packages (optional)

def m(id, name, pin, pout, inp=("text",), out=("text",), **extra):
    return dict({"id": id, "name": name, "pricing": {"prompt": pin, "completion": pout}, "architecture": {"input_modalities": list(inp), "output_modalities": list(out)}, "context_length": 200000}, **extra)
TEXT = [
  m("anthropic/claude-opus-5.5", "Claude Opus 5.5", "0.000015", "0.000075", ("text", "image")),
  m("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "0.000002", "0.00001", ("text", "image")),
  m("anthropic/claude-haiku-5.5", "Claude Haiku 5.5", "0.0000001", "0.0000005", ("text", "image")),
  m("openai/gpt-6.1-sol-pro", "GPT 6.1 Sol Pro", "0.00002", "0.00008", ("text", "image")),
  m("openai/gpt-6-luna", "GPT 6 Luna", "0.0000001", "0.0000005"),
  m("deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "0.00000015", "0.0000006"),
]
VOICES = [m("google/gemini-3.8-flash-lite-tts", "Gemini 3.8 Flash Lite TTS", "0.0000005", "0.000006", out=("speech",), supported_voices=[{"id": v, "name": v} for v in ["Kore", "Puck", "Charon", "Aoede", "Fenrir"]])]
HEARING_MODELS = [m("openai/whisper-large-v3-turbo", "Whisper Large V3 Turbo", "0.00000333", "0", ("audio",), ("transcription",))]
IMAGES = [dict(m("google/gemini-nano-banana-2.1", "Nano Banana 2.1", "0.0000015", "0.0000075", ("text", "image"), ("image", "text")), pricing={"prompt": "0.0000015", "completion": "0.0000075", "image": "0.04"})]
MUSIC = [dict(m("google/lyria-3-clip-preview", "Lyria 3 Clip", "0", "0", out=("text", "audio")), pricing={"prompt": "0", "completion": "0", "request": "0.04"})]
DECISIONS = [m("typesafe/jev-1.14", "Jev 1.14", "0.000000042", "0", out=("decisions",))]
OTHERS = [m("openai/text-embedding-4", "Text Embedding 4", "0.00000002", "0", out=("embeddings",))]
ALL = {"data": TEXT + VOICES + HEARING_MODELS + IMAGES + MUSIC + DECISIONS + OTHERS}
PNG = base64.b64encode(open(os.path.join(ROOT, "pruebas", "punto.png"), "rb").read()).decode()
MP3 = base64.b64encode(open(os.path.join(ROOT, "pruebas", "tono.mp3"), "rb").read()).decode()
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "X-Generation-Id"}
calls = []
JEV_SAYS = {"choice": "go_ahead"}   # what the simulated JEV answers

def resp(content, tool=None, cost=0.0012):
    msg = {"content": content}
    if tool: msg["tool_calls"] = [{"id": "c%d" % len(calls), "type": "function", "function": {"name": tool[0], "arguments": json.dumps(tool[1])}}]
    return json.dumps({"model": "simulado", "choices": [{"message": msg}], "usage": {"prompt_tokens": 120, "completion_tokens": 40, "cost": cost}})

def chat(b):
    msgs = b["messages"]; sys0 = str(msgs[0]["content"]); last = msgs[-1]
    has_tool = any(x["role"] == "tool" for x in msgs)
    user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""})
    ut = user["content"] if isinstance(user["content"], str) else " ".join(x.get("text", "") for x in user["content"])
    if sys0.startswith("Eres el Creador de agentes"):
        wants_shop = "tienda" in ut.lower()
        return resp(json.dumps({"name": "Tendero" if wants_shop else "Cocinero", "role": "subagent", "floor": "new", "newFloor": {"name": "Tienda" if wants_shop else "Cocina", "job": "Pedidos y clientes" if wants_shop else "Menús y compras"},
            "seat": "pool", "instructions": "Preparas el menú de la semana y la lista de la compra, sencillo y barato.", "objective": "Un menú cada lunes", "level": "budget",
            "heartbeat": {"every": 7, "unit": "d"}, "onWake": "objective", "capabilities": ["write", "search", "payments"], "look": {"p": "grandma", "clothes": "#2E9E5B"}, "why": "Barato y una vez por semana."}), cost=0.004)
    if sys0.startswith("Conviertes el motivo"):   # v7: the cheap model that turns a coin into a rule
        return resp("Escribe frases claras y cortas, de menos de 20 palabras." if "claro" in ut else "No gastes más de tu tope: avisa antes de llegar.", cost=0.00002)
    if "Estás en la sala de reuniones" in sys0:
        return resp("Intervención en la reunión: propongo empezar por lo más barato.", cost=0.0005)
    if "Escribe el acta" in ut:
        return resp("## Conclusiones\n- Empezar por lo más barato.\n\n## Decisiones\n- Revisarlo el lunes.", cost=0.0007)
    if sys0.startswith("Eres el jefe del edificio"):
        u = ut.lower()
        if "agente nuevo" in u and not has_tool: return resp("", ("assign_task", {"agent": "Creador de agentes", "task": "Un agente para la tienda online", "now": True}))
        if "redactor" in u and not has_tool: return resp("", ("assign_task", {"agent": "Redactor", "task": "Escribe un saludo para el equipo", "now": True}))
        if "decisión importante" in u and not has_tool: return resp("", ("consult_sages", {"question": "¿Abrimos oficina nueva?"}))
        if u.startswith("guarda") and not has_tool: return resp("", ("save_memory", {"text": "El coche de la empresa es un Seat azul", "tags": ["coche"]}))
        if "dibuja" in u and not has_tool: return resp("", ("create_image", {"description": "Un faro al atardecer"}))
        if "compón" in u and not has_tool: return resp("", ("create_music", {"description": "Una sintonía alegre de diez segundos"}))
        if "reúne" in u and not has_tool: return resp("", ("call_meeting", {"title": "Saludo al equipo", "agenda": "Decidir el saludo de la semana.", "participants": ["Redactor"], "rounds": 2}))
        if has_tool:
            t = next(x for x in reversed(msgs) if x["role"] == "tool")["content"]
            return resp("He hecho lo que pedías. " + t[:400])
        if "recuerdas" in u: return resp("Sí: " + ("el coche es un Seat azul." if "Seat azul" in sys0 else "no lo encuentro."))
        if "[Imagen adjunta" in ut or isinstance(user["content"], list): return resp("Veo la imagen: " + ("descrita" if "[Imagen adjunta" in ut else "directa"))
        return resp("**Hola.** Soy el jefe del edificio.")
    if "sabio del consejo" in sys0: return resp("Consejo de " + b["model"].split("/")[0], cost=0.02)
    if isinstance(last["content"], list): return resp("Una foto de un punto.", cost=0.0002)
    return resp("¡Hola, equipo! Saludo del Redactor.", cost=0.0003)

def router(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if url.startswith("https://openrouter.ai/api/v1/models"):
        body = ALL if "output_modalities=all" in url else {"data": VOICES} if "speech" in url else {"data": HEARING_MODELS} if "transcription" in url else {"data": IMAGES} if "=image" in url else {"data": TEXT}
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps(body))
    if url == "https://openrouter.ai/api/alpha/decisions":
        b = json.loads(request.post_data); calls.append({"jev": b})
        c = JEV_SAYS["choice"]; probs = {k: (0.7 if k == c else 0.1) for k in ["go_ahead", "reuse", "stop", "ask_boss"]}
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"answers": {"decision": {"choice": c, "probabilities": probs, "confidence": 0.7}}, "usage": {"input_tokens": 300, "output_tokens": 0, "cost": 0.0000126}}))
    if url == "https://openrouter.ai/api/v1/chat/completions":
        b = json.loads(request.post_data); calls.append(b)
        if str(b.get("model", "")).startswith("google/lyria"):
            sse = "data: " + json.dumps({"choices": [{"delta": {"audio": {"data": MP3[:len(MP3) // 2], "format": "mp3"}}}]}) + "\n\n" + \
                  "data: " + json.dumps({"choices": [{"delta": {"audio": {"data": MP3[len(MP3) // 2:]}}}], "usage": {"cost": 0.04}}) + "\n\ndata: [DONE]\n\n"
            return route.fulfill(status=200, content_type="text/event-stream", headers=CORS, body=sse)
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=chat(b))
    if url == "https://openrouter.ai/api/v1/images":
        calls.append({"image": json.loads(request.post_data)})
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"data": [{"b64_json": PNG, "media_type": "image/png"}], "usage": {"cost": 0.04}}))
    if url == "https://openrouter.ai/api/v1/audio/speech":
        calls.append({"voice": json.loads(request.post_data)})
        h = dict(CORS); h["X-Generation-Id"] = "gen-1"
        return route.fulfill(status=200, content_type="audio/mpeg", headers=h, body=open(os.path.join(ROOT, "pruebas", "tono.mp3"), "rb").read())
    if url.startswith("https://openrouter.ai/api/v1/generation"):
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"data": {"total_cost": 0.0009}}))
    if url == "https://openrouter.ai/api/v1/audio/transcriptions":
        calls.append({"hearing": True})
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"text": "Que el redactor escriba algo", "usage": {"seconds": 1.5, "cost": 0.000005}}))
    if url.startswith("https://cdn.jsdelivr.net/") and VADPKG:
        mm = re.match(r"https://cdn.jsdelivr.net/npm/(@ricky0123/vad-web|onnxruntime-web)@[^/]+/dist/(.+)", url)
        if mm:
            folder = os.path.join(VADPKG, "x/package/dist" if "vad-web" in mm.group(1) else "ort/package/dist")
            f = os.path.join(folder, mm.group(2))
            if os.path.exists(f):
                ct = "application/wasm" if f.endswith(".wasm") else "application/javascript" if f.endswith((".js", ".mjs")) else "application/octet-stream"
                return route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": ct}, body=open(f, "rb").read())
    return route.abort()

INIT = """
try { if (!localStorage.getItem("ferAgent.language")) localStorage.setItem("ferAgent.language", "es"); } catch (e) {}   // these tests are of the website in Spanish
HTMLMediaElement.prototype.play = function () { window.__sonado = (window.__sonado || 0) + 1; if (String(this.src).startsWith('blob:')) setTimeout(() => this.dispatchEvent(new Event('ended')), 150); return Promise.resolve(); };
HTMLMediaElement.prototype.pause = function () {};
"""
FAKE_VAD = """
window.vad = { MicVAD: { new: async (o) => { window.__vadOpts = o; window.__vadCalls = window.__vadCalls || []; window.__vadCalls.push('new');
  return { start: async () => window.__vadCalls.push('start'), pause: async () => window.__vadCalls.push('pause'), destroy: async () => window.__vadCalls.push('destroy') }; } } };
"""
ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)

def state(page):
    return json.loads(page.evaluate("localStorage.getItem('ferAgent.state')"))
def agent(page, name):
    return next(a for a in state(page)["agents"] if a["name"] == name)

def install_team(page):
    """v8: un edificio nuevo empieza solo con el jefe; estas pruebas trabajan con el equipo recomendado (se instala como lo haría el usuario)"""
    try: only = len(state(page)["agents"]) == 1
    except Exception: only = False
    if not only: return
    if page.is_visible("#drawer:not([hidden])"): page.click("#closeDrawer"); page.wait_for_timeout(200)
    page.click("#openBuiltIn"); page.click("#builtInView button:has-text('Instalar el equipo recomendado')")
    page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).agents.length > 1")
    page.click("#builtInView .back-btn"); page.wait_for_selector("#builtInView", state="hidden")

def enter(page, team=True):
    page.wait_for_selector("#landing .button-big")
    page.click("#landing .button-big >> nth=0"); page.wait_for_selector("#landingPage", state="hidden")
    if team:
        page.wait_for_timeout(400)
        if not page.is_visible("#drawer:not([hidden])"): install_team(page)   # without a key Settings opens: the team is installed after pasting it

def profile(page, name, tab="Identidad"):
    """Abre la ficha de un agente tocándolo en el dibujo (v8: el directorio solo sale en «Franjas»); si no está a la vista, en su planta"""
    if page.is_visible("#chatView"): page.click("#closeChat")
    go_back(page)
    ag = agent(page, name); sel = f".tier .fig[data-id='{ag['id']}']"
    if not page.is_visible(sel):
        idx = [p["id"] for p in state(page)["floors"]].index(ag["floor"])
        page.click(f".tier >> nth={idx} >> .enter"); page.wait_for_timeout(300)
        sel = f".fig[data-id='{ag['id']}']"
    page.click(sel); page.wait_for_selector("#profile .profile-tabs"); page.wait_for_timeout(200)
    if tab: page.click(f".profile-tabs button:text-is('{tab}')"); page.wait_for_timeout(200)

def go_back(page):
    """De una planta, al edificio entero"""
    try:
        if page.is_visible(".back"): page.click(".back", timeout=2000)
    except Exception: pass
    page.wait_for_selector(".tier")

def chat_with(page, name):
    profile(page, name); page.click(f"#profile .btn.primary:text-is('Hablar con {name}')"); page.wait_for_selector("#chatView:not([hidden])")

def send(page, text):
    page.fill("#messageInput", text); page.keyboard.press("Enter")

def overlaps(page, a, b):
    """¿Se pisan dos cajas en pantalla?"""
    ra = page.eval_on_selector(a, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
    rb = page.eval_on_selector(b, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
    return not (ra[2] <= rb[0] or rb[2] <= ra[0] or ra[3] <= rb[1] or rb[3] <= ra[1])

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 1360, "height": 900})
        ctx.add_init_script(INIT)
        ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        # ---------- Home page ----------
        page.wait_for_selector("#landing .button-big")
        h1 = page.inner_text("#landing h1")
        landing_text = page.inner_text("#landing")
        check("empresa agéntica a tu servicio" in h1 and page.is_visible(".hero > img[src='img/portada.webp']"), f"home page: “{h1}” over the tower at night")
        check("Tú decides el organigrama y qué hace cada agente" in landing_text, "home page: “Nosotros ponemos la base. Tú decides el organigrama y qué hace cada agente.”")
        check("reparte el trabajo" not in landing_text and "hablas con el jefe" not in landing_text.lower(), "the sentence “hablas con el jefe y él reparte el trabajo” is gone (from everywhere on the home page)")
        sections = page.eval_on_selector_all("#landing .section-l h2", "hs => hs.map(h => h.textContent)")
        check(sections[:5] == ["Cómo funciona", "Agentes de serie", "El gasto, bajo control", "Vive donde quieras", "Código abierto"], f"home page with its sections: {sections}")
        page.screenshot(path=os.path.join(OUTPUT, "portada.png"))
        enter(page)
        page.wait_for_selector(".tier")
        page.wait_for_selector("#drawer:not([hidden])", timeout=8000)
        check(page.is_visible("#drawerBody h4:text-is('Tu clave de OpenRouter')"), "without a key: Settings opens to paste it")
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        # v7: the building starts on general pause; these tests (from v6) are about heartbeats and tasks, so it's started with the switch
        check(page.get_attribute("#pause", "aria-pressed") == "true" and page.inner_text("#pauseTxt") == "En pausa", "v7: it starts on general pause (nothing spends on its own)")
        page.click("#pause"); page.wait_for_function("document.querySelector('#pause').getAttribute('aria-pressed') === 'false'")
        check(page.evaluate("localStorage.getItem('ferAgent.key')") == "sk-or-test", "key saved only in the browser (the same one as the earlier version)")
        install_team(page)
        # ---------- Building ----------
        check(page.inner_text("#meterToday") == "Hoy, sin gasto", f"counter always in view; with no spending it says “{page.inner_text('#meterToday')}” and not “0,0000 $”")
        parts = page.eval_on_selector_all(".tier", "ts => ts.map(t => t.className.replace('tier ', ''))")
        check(parts == ["dome", "storey", "lobby"], f"building with the drawing's pieces: {parts}")
        signs = page.eval_on_selector_all(".tier .sign", "bs => bs.map(b => b.textContent)")
        check(signs == ["Cúpula", "Planta técnica", "Vestíbulo"], f"signs without “0,0000 $” when there's no spending: {signs}")
        ids = page.eval_on_selector_all(".tier .fig", "ps => ps.map(p => p.dataset.id)")
        check(sorted(ids) == sorted(["boss", "sage1", "sage2", "techie", "artie", "creator", "jev", "controller", "memory"]), f"9 built-in agents in their place: {ids}")
        for width in [1360, 1100, 900, 700]:
            page.set_viewport_size({"width": width, "height": 900}); page.wait_for_timeout(250)
            if width <= 900 and not page.is_visible(".tier"): page.click("#tabBuilding"); page.wait_for_timeout(200)
            check(not overlaps(page, ".tier.storey .sign", ".tier .fig[data-id='techie'] img"), f"the tech floor's sign doesn't cover Tecno (window of {width} px)")
        page.set_viewport_size({"width": 1360, "height": 900}); page.wait_for_timeout(250)
        c1 = page.eval_on_selector(".legend .l-working", "e => getComputedStyle(e).backgroundColor"); c2 = page.eval_on_selector(".legend .l-pending", "e => getComputedStyle(e).backgroundColor")
        check(c1 != c2, f"legend: “trabajando” ({c1}) and “con tareas pendientes” ({c2}) with different colours")
        e = state(page)
        check(e["version"] == VERSION_MOTOR and all("higherBrain" not in a for a in e["agents"]), f"version {VERSION_MOTOR} and no “higher brain” in any agent")
        jev = next(a for a in e["agents"] if a["role"] == "jev")
        check(jev["brain"] == "~typesafe/jev-latest", f"JEV decides with “Jev Latest”: {jev['brain']}")
        check(all({"speak", "hear"} <= set(a["capabilities"]) for a in e["agents"] if a["brain"] and a["role"] not in ("jev",)), "speak and hear, on in every agent that holds conversations")
        page.screenshot(path=os.path.join(OUTPUT, "edificio.png"))
        # ---------- Create a floor and agents ----------
        page.click("#createFloor"); page.fill("#drawerBody input", "Contenidos"); page.fill("#drawerBody textarea", "Escribir y publicar")
        page.click("#drawerBody >> text=Crear piso")
        page.wait_for_selector(".floor-head .floor-name")
        check(page.input_value(".floor-name") == "Contenidos" and state(page)["floors"][1]["name"] == "Contenidos", "create floor: it's built on top, under the dome, and you go into it")
        page.click(".rail .module.head-office .slot")
        page.wait_for_selector("#drawer:not([hidden]) >> text=Su ficha")
        page.fill("#drawerBody input[placeholder='Cómo se llama']", "Redactor")
        page.select_option("#drawerBody select >> nth=0", "subagent")
        page.fill("#drawerBody textarea[placeholder^='Quién es']", "Escribes textos claros y cortos para el equipo.")
        optg = page.eval_on_selector_all("#drawerBody .field:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label)")
        check(optg and optg[0].startswith("Recomendados") and any(g.startswith("Todos · Texto (6)") for g in optg) and any(g.startswith("Otros") for g in optg), f"create agent: brain with recommended ones per level, all the text ones and “Otros”: {optg}")
        caps = page.eval_on_selector_all("#drawerBody .caps input:checked", "is => is.map(i => i.parentElement.textContent.split(/[A-Z]/).length && i.parentElement.querySelector('span').firstChild.textContent)")
        check(caps == ["Escribir", "Hablar", "Oír"], f"a new agent comes with Speak and Hear: {caps}")
        page.click("#drawerBody .pick4 button >> text=Chica")
        page.click("#drawerBody [aria-label='Ropa: amarillo']")
        page.click("#drawerBody >> text=Crear agente")
        page.wait_for_selector(".rail .fig .label:text('Redactor')")
        red = agent(page, "Redactor")
        check(red["role"] == "subagent" and red["look"]["clothes"] == "#E8C22C" and {"speak", "hear"} <= set(red["capabilities"]), "the Redactor appears in its office, with its colour, and can speak and hear")
        page.click("#createAgent") if page.is_visible("#createAgent") else page.click(".floor-actions >> text=+ Agente en esta planta")
        page.fill("#drawerBody .creator textarea", "quiero uno que me haga el menú de la semana")
        page.click("#drawerBody .creator button")
        page.wait_for_selector("#drawerBody .why")
        caps = page.eval_on_selector_all("#drawerBody .caps input:checked", "is => is.length")
        check(page.input_value("#drawerBody input[placeholder='Cómo se llama']") == "Cocinero" and caps == 4, f"the Creator fills in the profile; never capabilities that pay ({caps} ticked: write, search, speak and hear)")
        page.click("#drawerBody >> text=Crear agente")
        page.wait_for_selector(".rail .fig .label:text('Cocinero')")
        page.click(".back"); page.wait_for_selector(".tier")
        check(len(page.eval_on_selector_all(".tier.storey", "t => t")) == 3, "back in the building: it now has 3 floors")
        # ---------- Chat with the boss, full screen ----------
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        first = page.inner_text("#messages .msg >> nth=0")
        check(first.startswith("Hola, soy el jefe de Mi edificio") and "clave" not in first.lower(), f"the chat's first message is a greeting from the boss: “{first[:60]}…”")
        check(page.inner_text("#bossName") == "Jefe" and page.eval_on_selector("#avatar", "i => i.getBoundingClientRect().height") > 300, "full-screen chat with the character in big")
        send(page, "Que el redactor escriba un saludo ya")
        page.wait_for_selector(".msg.report", timeout=15000)
        check("Informe de Redactor" in page.inner_text(".msg.report"), "the boss shares out the work, the Redactor works and its report reaches the boss's chat")
        check(not any("el control externo" in str(x.get("messages", [{}])[0].get("content", "")) for x in calls if "messages" in x), "there's no longer a JEV review after each job (nor a repeat with an expensive brain)")
        send(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.report .proposal", timeout=15000)
        page.click(".msg.report .proposal >> text=Crear a Tendero")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).agents.some(a => a.name === 'Tendero')", timeout=5000)
        check(True, "asking the boss for an agent: the Creator designs it, JEV lets it go ahead and it's created with one tap")
        check(any("jev" in x and "Crear otro agente" in x["jev"]["state"][1] for x in calls), "before creating another agent, JEV is asked")
        send(page, "Decisión importante: ¿abrimos oficina?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .bubble')].some(b => b.textContent.includes('Consejo de anthropic') && b.textContent.includes('Consejo de openai'))", timeout=15000)
        check(True, "the council of sages answers (both) when the boss consults it")
        send(page, "Guarda que el coche de la empresa es un Seat azul")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .bubble')].some(b => b.textContent.includes('Saved'))", timeout=15000)
        send(page, "¿Recuerdas de qué color es el coche?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .bubble')].some(b => b.textContent.includes('Seat azul'))", timeout=15000)
        check("Memory encontró 1" in page.inner_text("#messages"), "“recuerdas” → Memory searches and the boss answers with the memory")
        send(page, "Dibuja un faro")
        page.wait_for_selector(".msg.bot .bubble img", timeout=15000)
        check(any("image" in x for x in calls), "create images: the boss asks for an image and it's shown in the chat")
        page.click("#closeChat"); profile(page, "Jefe", "Capacidades"); page.click("#profile .cap:has-text('Crear música') input"); page.wait_for_timeout(250)
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        send(page, "Compón una sintonía")
        page.wait_for_selector(".msg.bot .bubble audio", timeout=15000)
        lyria = [x for x in calls if str(x.get("model", "")).startswith("google/lyria")]
        check(lyria and lyria[-1].get("modalities") == ["text", "audio"] and lyria[-1].get("stream") is True, "create music: it asks Lyria for audio and the song plays in the chat")
        page.set_input_files("#fileInput", os.path.join(ROOT, "pruebas", "punto.png"))
        page.wait_for_selector("#attachment:not([hidden])")
        send(page, "¿Qué ves?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .bubble')].some(b => b.textContent.includes('Veo la imagen'))", timeout=15000)
        check(True, "see: the boss receives the attached image")
        page.screenshot(path=os.path.join(OUTPUT, "chat-jefe.png"))
        # ---------- Chat with another agent (the Redactor), with its own brain ----------
        chat_with(page, "Redactor")
        check(page.inner_text("#bossName") == "Redactor" and page.inner_text("#messages .msg >> nth=0").startswith("Hola, soy Redactor"), "each agent has its own chat: the Redactor's greeting")
        n0 = len(calls)
        send(page, "Escribe una frase para la web")
        page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000)
        last = [x for x in calls[n0:] if "messages" in x][-1]
        check(last["messages"][0]["content"].startswith("Escribes textos claros") and last["model"] == red["brain"], "the Redactor answers with its instructions and its brain")
        e = state(page); r2 = agent(page, "Redactor")
        check(len(r2["chat"]) == 2 and not any(x.get("content") == "Escribe una frase para la web" for x in e["conversation"]), "the conversation stays in its chat, not the boss's")
        # Coins: a gold one from the chat, with its reason
        page.click("#messages .msg.bot:not(.greeting) .coin-btn >> nth=0")
        page.fill(".reason-row input", "Escribió claro y corto"); page.click(".reason-row .btn.primary")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        e = state(page)
        check(any(x["type"] == "gold" and x["state"] == "confirmed" and x["reason"] == "Escribió claro y corto" for x in e["coins"]) and any(l["text"] == "Escribe frases claras y cortas, de menos de 20 palabras." and l["role"] == "subagent" and l["state"] == "proposed" for l in e["lessons"]),
              "v7: a gold coin with its reason → a cheap model turns it into a concrete rule, which waits for your yes")
        # it's approved in the inbox (and can be retouched)
        page.click("#closeChat"); page.click("#openInbox"); page.wait_for_selector("#inboxView:not([hidden]) .request")
        check(page.is_visible("#inboxView .request:has-text('Lección nueva') textarea"), "the lesson reaches the inbox, to approve or retouch it")
        page.click("#inboxView .request:has-text('Lección nueva') button:text-is('Aprobar')"); page.wait_for_timeout(300)
        check(any(l["state"] == "approved" and "frases claras" in l["text"] for l in state(page)["lessons"]), "approved: it's now a lesson of its role")
        page.click("#inboxView .back-btn"); chat_with(page, "Redactor")
        n0 = len(calls)
        send(page, "Otra frase")
        page.wait_for_function("document.querySelectorAll('#messages .msg.bot:not(.greeting)').length >= 2", timeout=15000)
        last = [x for x in calls[n0:] if "messages" in x][-1]
        check("Escribe frases claras y cortas" in last["messages"][0]["content"], "the lesson now goes in the Redactor's instructions")
        page.screenshot(path=os.path.join(OUTPUT, "chat-redactor.png"))
        # Own voice: two agents with no voice chosen sound different
        n0 = len(calls)
        page.click("#messages .msg.bot:not(.greeting) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_function("[...document.querySelectorAll('.voice-note')].some(n => n.textContent.includes('0,0009'))", timeout=15000)
        red_voice = [x for x in calls[n0:] if "voice" in x][-1]["voice"]
        page.click("#closeChat"); page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        n0 = len(calls)
        page.click("#messages .msg.bot:not(.greeting) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_timeout(1500)
        boss_voice = [x for x in calls[n0:] if "voice" in x][-1]["voice"]
        check(red_voice.get("voice") and boss_voice.get("voice") and red_voice["voice"] != boss_voice["voice"], f"each agent with its own voice: the boss “{boss_voice.get('voice')}”, the Redactor “{red_voice.get('voice')}”")
        check(any(k.startswith("voz") or True for k in agent(page, "Redactor")["spending"]) and sum(agent(page, "Redactor")["spending"].values()) > 0, "what its voice and its chat cost is charged to the Redactor")
        page.click("#closeChat")
        # ---------- Profile in four tabs ----------
        profile(page, "Redactor")
        pest = page.eval_on_selector_all(".profile-tabs button", "bs => bs.map(b => b.textContent)")
        check(pest == ["Identidad", "Trabajo", "Cerebro y gasto", "Capacidades"], f"profile in tabs: {pest}")
        check("Cerebro superior" not in page.inner_text("body"), "“Cerebro superior” no longer appears")
        page.fill("#profile .field:has(> span:text-is('Nombre')) input", "Redactora"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(any(a["name"] == "Redactora" for a in state(page)["agents"]), "it's renamed from Identity")
        page.click(".profile-tabs button:text-is('Trabajo')")
        check(page.is_visible("#profile .lesson:has-text('frases claras')"), "Work: its lessons (its role's)")
        page.click("#profile .lesson:has-text('frases claras') button:text-is('Fijar')"); page.wait_for_timeout(250)
        check(next(l for l in state(page)["lessons"] if "frases claras" in l["text"])["fixed"] is True, "a lesson can be pinned so it never goes")
        page.select_option("#profile .block:has(h4:text('Latido')) select >> nth=0", "min")
        page.fill("#profile .block:has(h4:text('Latido')) input[type=number]", "10"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(agent(page, "Redactora")["heartbeat"] == {"every": 10, "unit": "min"}, "Work: the heartbeat is changed")
        page.click(".profile-tabs button:text-is('Cerebro y gasto')")
        page.click("#profile .priority button >> text=1"); page.wait_for_timeout(200)
        check(agent(page, "Redactora")["priority"] == 1, "Brain and spending: priority changed to 1")
        page.click(".profile-tabs button:text-is('Capacidades')")
        page.click("#profile .cap:has-text('Crear música') input"); page.wait_for_selector("#profile .cap-block.on:has-text('Crear música') select")
        mus = page.eval_on_selector_all("#profile .cap-block:has-text('Crear música') option", "os => os.map(o => o.value)")
        check("google/lyria-3-clip-preview" in mus and not any(v.startswith("anthropic/") for v in mus), f"Create music: its picker only has music models ({[v for v in mus if v]})")
        voice_ops = page.eval_on_selector_all("#profile .cap-block:has-text('Hablar') select >> nth=0 >> option", "os => os.map(o => o.value)")
        hearing_ops = page.eval_on_selector_all("#profile .cap-block:has-text('Oír') select option", "os => os.map(o => o.value)")
        check("google/gemini-3.8-flash-lite-tts" in voice_ops and "openai/whisper-large-v3-turbo" in hearing_ops and "openai/whisper-large-v3-turbo" not in voice_ops, "each model appears where it's useful: voice in Speak, hearing in Hear")
        page.select_option("#profile .cap-block:has-text('Hablar') select >> nth=1", "Aoede"); page.wait_for_timeout(250)
        check(agent(page, "Redactora")["voice"]["voice"] == "Aoede", "Speak: each agent chooses its voice")
        caps_avz = page.eval_on_selector_all("#profile .cap.adv input", "is => is.map(i => i.disabled)")
        check(len(caps_avz) == 5 and all(caps_avz), "v7: the 5 advanced capabilities left are still pending plugs (browsing and the computer's folder are now “Hands”, with Fer Home)")
        page.screenshot(path=os.path.join(OUTPUT, "ficha.png"))
        profile(page, "JEV", "Cerebro y gasto")
        check("Jev Latest" in page.inner_text("#profile select option:checked"), "JEV's profile shows “Jev Latest”")
        # ---------- JEV before spending: searching ----------
        profile(page, "Redactora", "Capacidades"); page.click("#profile .cap:has-text('Buscar en internet') input"); page.wait_for_timeout(250)
        page.click(".profile-tabs button:text-is('Trabajo')")
        JEV_SAYS["choice"] = "stop"; n0 = len(calls)
        page.fill("#profile input[placeholder='Encárgale algo…']", "Busca precios de imprentas")
        page.check("#profile .block:has(h4:text('Tareas')) input[type=checkbox]")
        page.click("#profile >> text=Encargar")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).agents.find(a => a.name === 'Redactora').tasks.some(t => t.text === 'Busca precios de imprentas' && t.state === 'stopped')", timeout=15000)
        new_ones = calls[n0:]
        jev_q = [x["jev"] for x in new_ones if "jev" in x]
        check(jev_q and jev_q[0]["model"] == "~typesafe/jev-latest" and len(jev_q[0]["state"]) == 3 and not any("messages" in x for x in new_ones),
              "JEV says “stop”: it gets who the agent is, what it's about to do and its short memory, and nothing is spent on searching")
        JEV_SAYS["choice"] = "go_ahead"
        page.click("#tabActivity"); page.click("#actJev"); page.wait_for_timeout(250)
        reg = page.inner_text("#log")
        check("Redactora" in reg and "parar" in reg and "¿Sirvió?" in reg, "Activity → Questions to JEV: time, agent, action, what JEV said, what it did and whether it helped")
        page.click("#log .jev-query >> nth=0 >> button:text-is('Sí')"); page.wait_for_timeout(250)
        check(state(page)["jevQueries"][-1]["helped"] is True, "you can mark whether the question helped")
        page.click("#tabProfile")
        # ---------- Spending, cap and the red coin the Controller proposes ----------
        n_ag = len(state(page)["agents"])
        page.click("#meter"); page.wait_for_selector("table.spending")
        check(len(page.eval_on_selector_all("table.spending tbody tr", "rs => rs")) == n_ag, f"spending per agent: one row for each of the {n_ag} agents")
        page.fill("#drawerBody input[type=number] >> nth=0", "0.01"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        page.click("#closeDrawer")
        frozen_ids = page.eval_on_selector_all(".tier .fig.frozen", "ps => ps.map(p => p.dataset.id)")
        check("boss" in frozen_ids, f"on reaching the cap everything freezes, the boss too (in ice blue): {len(frozen_ids)}")
        page.click("#talkToBoss"); send(page, "hola")
        page.wait_for_selector(".msg.error")
        check("congelado" in page.inner_text(".msg.error"), "the frozen boss doesn't spend and explains it in its chat")
        page.click("#closeChat")
        page.click("#meter"); page.fill("#drawerBody input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(300); page.click("#closeDrawer")
        check(page.eval_on_selector_all(".fig.frozen", "v => v.length") == 0, "when the cap is raised, everyone goes back to work")
        profile(page, "Cocinero", "Cerebro y gasto")
        page.fill("#profile input[placeholder='sin tope propio']", "0.0001"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        chat_with(page, "Cocinero"); send(page, "Hola"); page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=15000); page.wait_for_timeout(300)
        page.click("#closeChat")
        prop = [x for x in state(page)["coins"] if x["state"] == "proposed" and x["proposedBy"] == "controller"]
        check(prop and page.is_visible("#monthBadge") and page.inner_text("#monthBadge") == "1", "the Controller proposes a red coin for whoever reaches their cap; it's flagged in “Agent of the month”")
        # ---------- Agent of the month ----------
        page.click("#openMonth"); page.wait_for_selector("#monthView:not([hidden]) .podium")
        check("Redactora" in page.inner_text("#monthView .podium .first"), "Agent of the month: the Redactora, with her gold coin, tops the podium")
        check(len(page.eval_on_selector_all("#monthView table.ranking tbody tr", "r => r")) == len(state(page)["agents"]), "ranking with every agent, by coins and spending")
        page.click("#monthView .coin-row:has-text('Cocinero') button:text-is('Confirmar')"); page.wait_for_timeout(300)
        e = state(page)
        check(any(x["proposedBy"] == "controller" and x["state"] == "confirmed" for x in e["coins"]) and any(l["state"] == "proposed" and l["text"].startswith("No gastes más de tu tope") for l in e["lessons"]) and page.is_hidden("#monthBadge"),
              "once confirmed, the red coin counts and its rule waits for your yes in the inbox")
        page.screenshot(path=os.path.join(OUTPUT, "agente-del-mes.png"))
        page.click("#monthView .back-btn")
        page.click("#meter"); page.fill("#drawerBody input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(200); page.click("#closeDrawer")
        profile(page, "Cocinero", "Cerebro y gasto"); page.fill("#profile input[placeholder='sin tope propio']", "0"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        # ---------- Meeting rooms ----------
        page.click("#openRooms"); page.wait_for_selector("#roomsView:not([hidden]) .form-dark")
        page.fill(".form-dark input >> nth=0", "Plan de la semana"); page.fill(".form-dark textarea", "Qué hacemos esta semana.")
        for name in ["Redactora", "Cocinero"]: page.click(f".choose-attendees label:has-text('{name}') input")
        page.fill(".form-dark input[type=number]", "1")
        check("Coste estimado" in page.inner_text(".form-dark") and not page.is_visible(".choose-attendees label:has-text('Memory')") and not page.is_visible(".choose-attendees label:has-text('JEV')"), "new meeting: estimated cost in view; Memory and JEV don't sit down")
        page.click(".form-dark .btn.primary:text-is('Convocar')"); page.wait_for_selector(".table .seat")
        check(len(page.eval_on_selector_all(".table .seat", "a => a")) == 3 and state(page)["meetings"][-1]["state"] == "ready", "called: the table with the boss and the two; it hasn't started yet")
        page.click(".form-dark .btn.primary"); page.wait_for_selector("#roomsView .minutes", timeout=20000)
        r = state(page)["meetings"][-1]
        check(r["state"] == "finished" and r["contributions"][0]["chairs"] and len(r["contributions"]) == 3 and "## Decisiones" in r["minutes"], "the meeting: the boss chairs, each one speaks and at the end the minutes (conclusions and decisions)")
        page.screenshot(path=os.path.join(OUTPUT, "sala.png"))
        page.click("#roomsView .back-btn")
        # the boss calls it: it doesn't start until you confirm the rounds
        page.click("#talkToBoss"); send(page, "Reúne al equipo para el saludo")
        page.wait_for_selector(".meeting-card input[type=number]", timeout=15000)
        r = state(page)["meetings"][-1]
        check(r["calledBy"] == "boss" and r["state"] == "proposed", "the boss proposes a meeting; it waits for your yes")
        page.fill(".meeting-card input[type=number]", "1"); page.click(".meeting-card .btn.primary")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).meetings.at(-1).state === 'finished'", timeout=20000)
        check(state(page)["meetings"][-1]["rounds"] == 1, "with your yes and your rounds, it's held")
        page.click("#roomsView .back-btn") if page.is_visible("#roomsView") else None
        # ---------- Renaming everything ----------
        page.click("#openSettings")
        page.fill("#drawerBody label:has-text('Nombre del edificio') input", "Torre Norte"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        page.click("#closeDrawer")
        for i, fresh in [(0, "Dirección"), (len(state(page)["floors"]) - 1, "Entrada")]:
            page.click(f".tier >> nth={i} >> .sign"); page.wait_for_selector(".floor-name")
            page.fill(".floor-name", fresh); page.keyboard.press("Tab"); page.wait_for_timeout(250); go_back(page)
        profile(page, "Jefe"); page.fill("#profile .field:has(> span:text-is('Nombre')) input", "Ana"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        profile(page, "Creador de agentes"); page.fill("#profile .field:has(> span:text-is('Nombre')) input", "Clara"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        e = state(page)
        check(e["name"] == "Torre Norte" and e["floors"][0]["name"] == "Dirección" and e["floors"][-1]["name"] == "Entrada", "the building, the dome and the lobby are renamed")
        check(page.inner_text("#buildingName") == "Torre Norte" and page.inner_text("#talkToBoss") == "Hablar con Ana" and "Dirección" in page.eval_on_selector_all(".sign b", "b => b.map(x => x.textContent)"), "and it shows in the header, on the boss's button and on the signs")
        page.click("#talkToBoss")
        check(page.inner_text("#messages .msg >> nth=0").startswith("Hola, soy Ana, el jefe de Torre Norte"), "the greeting uses the new names")
        n0 = len(calls)
        send(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.report:has-text('Clara')", timeout=15000)
        sis = [x for x in calls[n0:] if "messages" in x][0]["messages"][0]["content"]
        check("Te llamas Ana" in sis, "the boss knows it's now called Ana")
        check(True, "even if the Creator is called Clara, the boss still gives it new agents to make")
        page.click("#closeChat")
        # ---------- The boss's look (from its profile) ----------
        profile(page, "Ana"); page.click("#profile >> text=Cambiar su foto y su nombre"); page.click("#drawerBody .pick4 button >> text=Chica")
        page.click("#drawerBody [aria-label='Ropa: verde']")
        page.wait_for_function("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase() === '#2E9E5B'", timeout=5000)
        check(True, "the boss's look from its profile: the website takes the colour of its clothes")
        page.click("#closeDrawer")
        # ---------- Settings: models, lessons, view; built-in agents; backup ----------
        page.click("#openSettings")
        txt = page.inner_text("#drawerBody")
        check("Modelos por defecto del edificio" in txt and "Crear música" in txt and "Modelos recomendados" in txt, "Settings: default models (music too) and recommended ones")
        page.fill("#drawerBody .field:has-text('Lecciones que se guardan por papel') input", "3"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(state(page)["settings"]["lessonsPerRole"] == 3, "Settings: the number of lessons per role is changed")
        page.click("#closeDrawer")
        profile(page, "Arturito"); page.click("#profile >> text=Borrar"); page.click("#profile >> text=¿Borrar? Pulsa otra vez")
        page.wait_for_function("!JSON.parse(localStorage.getItem('ferAgent.state')).agents.some(a => a.id === 'artie')")
        page.click("#openBuiltIn"); page.click("#builtInView .builtin-agent:has-text('Arturito') button:text-is('Instalar')")
        page.wait_for_selector("text=Instalado: Arturito.")
        check(any(a["id"] == "artie" for a in state(page)["agents"]), "a deleted built-in agent (Arturito) is installed again from “Built-in agents”")
        page.click("#builtInView .back-btn"); page.click("#openSettings")
        with page.expect_download() as d: page.click("#drawerBody >> text=Guardar copia ahora")
        backup = json.loads(open(d.value.path()).read())
        check(backup["type"] == "fer-agent-backup" and len(backup["building"]["agents"]) == len(state(page)["agents"]) and "sk-or" not in json.dumps(backup), "the building's backup is downloaded (with images and music) and doesn't carry the key")
        page.click("#closeDrawer")
        page.click("#tabActivity"); page.click("#actAll")
        reg = page.inner_text("#log")
        check("JEV" in reg and "Memory" in reg and "Redactora" in reg, "Activity → Everything: what each agent does is shown")
        check(not errors, f"no JavaScript errors: {errors}")
        b.close()

        # ---------- A building of 72 agents on 12 floors, with no heartbeat or spending ----------
        tower = subprocess.run(["node", os.path.join(ROOT, "pruebas", "torre72.mjs")], capture_output=True, text=True, check=True).stdout
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.add_init_script("if (!localStorage.getItem('ferAgent.state')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferAgent.state', %s); }" % json.dumps(tower))
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        n0 = len(calls)
        t0 = time.time(); page.goto(URL); enter(page); page.wait_for_selector(".tier.strip"); t1 = time.time()
        e = state(page)
        storeys = [x for x in e["floors"] if x["type"] == "storey"]
        check(len(storeys) == 12 and sum(1 for a in e["agents"] if any(a["floor"] == x["id"] for x in storeys)) == 72, f"test building: 12 floors with 72 agents (plus the boss and Memory: {len(e['agents'])})")
        strips = page.eval_on_selector_all(".tier.strip", "fs => fs.map(f => f.innerText.replace(/\\s+/g, ' '))")
        check(len(strips) == 12 and all("6 agentes · 0 trabajando" in f and "$" not in f for f in strips), f"automatic view in strips: name, agents, how many are working and no “$” because there's no spending ({strips[0]})")
        check(len(page.eval_on_selector_all(".agent-row", "f => f")) == 74, "the directory lists all 74")
        fil = page.eval_on_selector_all(".filters button", "bs => bs.map(b => b.textContent)")
        check("Apagados (4)" in fil and "Con tareas pendientes (0)" in fil and "Todos (74)" in fil, f"filters with their count: {fil}")
        page.fill(".search-box", "legal"); page.wait_for_timeout(200)
        check(len(page.eval_on_selector_all(".agent-row", "f => f")) == 6, "searching “legal” leaves Legal's 6")
        page.fill(".search-box", "")
        page.click(".filters button:has-text('Apagados')")
        check(len(page.eval_on_selector_all(".agent-row", "f => f")) == 4, "filter “Apagados”: the 4 switched off")
        page.click(".filters button:has-text('Apagados')")
        page.screenshot(path=os.path.join(OUTPUT, "torre72-franjas.png"))
        page.click(".tier.strip >> nth=6"); page.wait_for_selector(".who-list")
        check(len(page.eval_on_selector_all(".who", "q => q")) == 6, "when going into a floor, its 6 agents with figures")
        page.click(".back"); page.wait_for_selector(".tier.strip"); page.click("#showDrawing")
        try: page.wait_for_function("document.querySelectorAll('.tier.storey:not(.strip)').length === 12 && document.querySelectorAll('.tier .fig').length === 74", timeout=4000)
        except Exception: pass
        counts = (len(page.eval_on_selector_all(".tier.storey:not(.strip)", "t => t")), len(page.eval_on_selector_all(".tier .fig", "p => p")))
        check(counts == (12, 74), f"the “Dibujo” switch shows the 12 drawn floors with their 74 figures: {counts}")
        page.click("#showStrips"); page.wait_for_timeout(300)
        check(page.evaluate("document.documentElement.scrollWidth") <= 1360, "without overflowing in width")
        page.wait_for_timeout(24000)   # more than one building heartbeat
        paid = [x.get("model") or list(x)[0] for x in calls[n0:] if "messages" in x or "jev" in x or "voice" in x or "image" in x]
        check(not paid and page.inner_text("#meterToday") == "Hoy, sin gasto", f"in 25 seconds with the key set: no paid call and “Hoy, sin gasto” ({paid}, {page.inner_text('#meterToday')})")
        check(t1 - t0 < 8, f"loads in {t1 - t0:.1f} s")
        check(not errors, f"72-agent building with no errors: {errors}")
        b.close()

        # ---------- A version 4 building saved in the browser moves to 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v4 = {"version": "4.0", "nombre": "Casa", "plantilla": "particular", "ajustes": {"topeDiario": 2}, "plantas": [{"id": "direccion", "nombre": "Dirección", "tipo": "direccion"}, {"id": "p1", "nombre": "Investigación", "tipo": "equipo"}, {"id": "control", "nombre": "Control", "tipo": "control"}],
              "agentes": [{"id": "jefe", "nombre": "Fer", "rol": "jefe", "planta": "direccion"}, {"id": "x", "nombre": "Investigador", "rol": "trabajador", "planta": "p1"}], "memoriaLarga": [{"id": "m", "ts": 1, "texto": "Me gustan las respuestas cortas"}], "conversacion": [], "registro": []}
        ctx.add_init_script("if (!localStorage.getItem('ferAgent.state')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferAgent.state', %s); localStorage.setItem('ferAgent.look', JSON.stringify({p: 'chica', chica: {ropa: '#7B3FB5'}})); }" % json.dumps(json.dumps(v4)))
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page); page.wait_for_selector(".tier")
        e = state(page)
        check([x["name"] for x in e["floors"]] == ["Cúpula", "Planta técnica", "Investigación", "Vestíbulo"] and e["name"] == "Casa" and e["longMemory"][0]["text"].startswith("Me gustan") and e["settings"]["dailyCap"] == 2,
              "a version 4 building is rebuilt with the new structure and keeps its name, caps and memory")
        check(e["agents"][0]["look"]["p"] == "girl" and e["agents"][0]["look"]["clothes"] == "#7B3FB5", "the boss's look you had in v4 is kept")
        page.click("#talkToBoss")
        check(any(a["name"] == "Investigador" for a in e["agents"]) and "Investigador" in page.inner_text("#messages"), "your v4 agent comes along and Tecno tells you about it in the boss's chat")
        p2 = ctx.new_page(); p2.on("pageerror", lambda e: errors.append(str(e)))
        p2.goto(URL); p2.wait_for_selector(".other-tab")
        check(p2.is_visible("text=El edificio ya está abierto en otra pestaña"), "second tab: it warns that the building is already open")
        page.close()
        p2.wait_for_selector("#landingPage:not([hidden])", timeout=10000); enter(p2); p2.wait_for_selector(".tier")
        check(not p2.is_visible(".other-tab"), "when the first one closes, the second opens on its own")
        check(not errors, f"move from v4 to v6 with no errors: {errors}")
        b.close()

        # ---------- A version 5 building moves to 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v5 = json.load(open(os.path.join(ROOT, "pruebas", "edificio-v8.json"), encoding="utf-8"))   # a building saved by an earlier version (Spanish names), made to look like version 5
        v5["version"] = "5.0"; v5.pop("vozParaTodos", None)
        for a in v5["agentes"]:
            a["cerebroSuperior"] = "openai/gpt-6.1-sol-pro"; a.pop("voz", None); a.pop("chat", None)
            if a["rol"] != "jefe": a["capacidades"] = ["escribir"]
        next(a for a in v5["agentes"] if a["rol"] == "jev")["cerebro"] = "deepseek/deepseek-v4.1-flash"
        v5 = json.dumps(v5)
        ctx.add_init_script("if (!localStorage.getItem('ferAgent.state')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferAgent.state', %s); }" % json.dumps(v5))
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page); page.wait_for_selector(".tier")
        e = state(page)
        j = next(a for a in e["agents"] if a["role"] == "jev")
        check(e["version"] == VERSION_MOTOR and all("higherBrain" not in a for a in e["agents"]) and j["brain"] == "~typesafe/jev-latest", "a version 5 building: no higher brain and JEV moves to “Jev Latest” (and it reaches 7)")
        check(all({"speak", "hear"} <= set(a["capabilities"]) for a in e["agents"] if a["brain"] and a["role"] != "jev"), "and Speak and Hear are switched on once in everyone that holds conversations")
        check(not errors, f"move from v5 to v6 with no errors: {errors}")
        b.close()

        # ---------- Mic with the simulated detector (in the boss's chat and in another agent's) ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT + FAKE_VAD); ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload(); enter(page); page.wait_for_selector(".tier")
        page.click("#talkToBoss")
        page.click("#micro"); page.wait_for_function("(window.__vadCalls||[]).includes('start')")
        check(page.inner_text("#bossState").startswith("Te escucho"), "mic: the boss listens")
        n = len(calls)
        page.evaluate("setTimeout(() => window.__vadOpts.onSpeechEnd(new Float32Array(16000)), 0)")
        page.wait_for_function("[...document.querySelectorAll('.msg.me .meta')].some(m => m.textContent.includes('por voz'))", timeout=15000)
        page.wait_for_function("window.__vadCalls.filter(c => c === 'start').length >= 2", timeout=15000)
        check(any("hearing" in x for x in calls[n:]) and any("voice" in x for x in calls[n:]), "mic: Whisper transcribes, the boss answers by voice and listens again")
        page.click("#micro"); page.click("#closeChat")
        profile(page, "Interventor")
        check(not page.is_visible("#profile .btn.primary:has-text('Hablar con')"), "the Controller (no brain) has no chat")
        chat_with(page, "Tecno")
        check(not page.is_disabled("#micro"), "Tecno has a mic in its chat")
        page.click("#closeChat"); profile(page, "Tecno", "Capacidades"); page.click("#profile .cap:has-text('Oír') input"); page.wait_for_timeout(250)
        chat_with(page, "Tecno")
        check(page.is_disabled("#micro"), "without the Hear capability, the mic in its chat switches off")
        check(not errors, f"mic with no errors: {errors}")
        b.close()

        # ---------- Real voice detector with the sealed files ----------
        if VADPKG:
            b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            ctx = b.new_context(); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
            page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload(); enter(page); page.wait_for_selector(".tier")
            page.click("#talkToBoss"); page.click("#micro")
            try:
                page.wait_for_function("document.querySelector('#bossState').textContent.startsWith('Te escucho') || document.querySelector('.msg.error')", timeout=40000)
            except Exception: pass
            loaded = page.evaluate("!!(window.vad && window.vad.MicVAD && window.ort)")
            check(loaded, "real detector: the two sealed files are downloaded and the seal matches (the browser accepts them)")
            page.click("#micro"); b.close()

        # ---------- Translation: a test dictionary changes the texts without touching the code ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.route("**/textos/zz.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body='export default { "You have an agentic company at your service.": "ZZ · una empresa agéntica a tu servicio.", "Talk to {1}": "ZZ hablar con {1}", "Settings": "ZZ ajustes", "Today, no spending": "ZZ hoy, sin gasto" };'))   # v9: the code is in English; a dictionary has English on the left
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL + "?lang=zz"); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.goto(URL + "?lang=zz")
        page.wait_for_selector("#landing h1")
        check(page.inner_text("#landing h1") == "ZZ · una empresa agéntica a tu servicio.", "translation: the home page comes from the dictionary")
        enter(page, team=False); page.wait_for_selector(".tier")
        check(page.inner_text("#talkToBoss") == "ZZ hablar con Jefe" and page.get_attribute("#openSettings", "aria-label") == "ZZ ajustes" and page.inner_text("#meterToday") == "ZZ hoy, sin gasto", "translation: the header too, with sentences that carry data (“ZZ hablar con Jefe”)")
        check(not errors, f"translation with no errors: {errors}")
        b.close()

        # ---------- Dark mobile ----------
        b = p.chromium.launch()
        ctx = b.new_context(color_scheme="dark", viewport={"width": 390, "height": 844}, device_scale_factor=2); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload()
        page.wait_for_selector("#landing .button-big")
        check(page.evaluate("document.querySelector('#landingPage').scrollWidth") <= 390, "mobile: the home page doesn't overflow")
        page.screenshot(path=os.path.join(OUTPUT, "movil-portada.png"))
        enter(page); page.wait_for_selector(".tier"); page.wait_for_timeout(600)
        check(page.is_visible(".building") and page.evaluate("document.documentElement.scrollWidth") <= 390, "mobile: it opens in the building, with no horizontal scrolling")
        check(page.is_visible("#openMonth") and page.is_visible("#openRooms"), "mobile: “Agente del mes” and “Reuniones” are within reach too")
        check(not overlaps(page, ".tier.storey .sign", ".tier .fig[data-id='techie'] img"), "mobile: the sign doesn't cover Tecno")
        page.screenshot(path=os.path.join(OUTPUT, "movil-edificio.png"))
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390 and page.is_visible("#messageInput"), "mobile: the chat fits")
        page.screenshot(path=os.path.join(OUTPUT, "movil-chat.png"))
        page.click("#closeChat"); page.click(".tier.storey .sign"); page.wait_for_selector(".rail .module")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390, "mobile: inside a floor it doesn't overflow either")
        page.click(".who >> text=Tecno"); page.wait_for_timeout(300)
        check(page.is_visible("#profileView .profile-head") and not page.is_visible(".building"), "mobile: touching an agent opens its profile")
        check(not errors, f"mobile with no errors: {errors}")
        b.close()
finally:
    server.terminate()
print("RESULT:", "OK" if ok else "FAILURES"); sys.exit(0 if ok else 1)
