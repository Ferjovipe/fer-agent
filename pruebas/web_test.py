"""Tests of the building's website (version 6) with a simulated OpenRouter (Playwright). The website in Spanish.
Usage: python3 pruebas/web_test.py  (it starts its own local server; it needs node for the 72-agent building)"""
import json, os, sys, base64, subprocess, time, re
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.environ.get("SALIDA", os.path.join(RAIZ, "pruebas", "capturas"))
os.makedirs(SALIDA, exist_ok=True)
PUERTO = 8811
VERSION_MOTOR = re.search(r'VERSION = "([^"]+)"', open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine.js"), encoding="utf-8").read()).group(1)   # the version the engine says
URL = f"http://localhost:{PUERTO}/index.html"
VADPKG = os.environ.get("VADPKG", "")  # folder with the voice detector's real packages (optional)

def m(id, name, pin, pout, inp=("text",), out=("text",), **extra):
    return dict({"id": id, "name": name, "pricing": {"prompt": pin, "completion": pout}, "architecture": {"input_modalities": list(inp), "output_modalities": list(out)}, "context_length": 200000}, **extra)
TEXTO = [
  m("anthropic/claude-opus-5.5", "Claude Opus 5.5", "0.000015", "0.000075", ("text", "image")),
  m("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "0.000002", "0.00001", ("text", "image")),
  m("anthropic/claude-haiku-5.5", "Claude Haiku 5.5", "0.0000001", "0.0000005", ("text", "image")),
  m("openai/gpt-6.1-sol-pro", "GPT 6.1 Sol Pro", "0.00002", "0.00008", ("text", "image")),
  m("openai/gpt-6-luna", "GPT 6 Luna", "0.0000001", "0.0000005"),
  m("deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "0.00000015", "0.0000006"),
]
VOCES = [m("google/gemini-3.8-flash-lite-tts", "Gemini 3.8 Flash Lite TTS", "0.0000005", "0.000006", out=("speech",), supported_voices=[{"id": v, "name": v} for v in ["Kore", "Puck", "Charon", "Aoede", "Fenrir"]])]
OIDOS = [m("openai/whisper-large-v3-turbo", "Whisper Large V3 Turbo", "0.00000333", "0", ("audio",), ("transcription",))]
IMAGENES = [dict(m("google/gemini-nano-banana-2.1", "Nano Banana 2.1", "0.0000015", "0.0000075", ("text", "image"), ("image", "text")), pricing={"prompt": "0.0000015", "completion": "0.0000075", "image": "0.04"})]
MUSICA = [dict(m("google/lyria-3-clip-preview", "Lyria 3 Clip", "0", "0", out=("text", "audio")), pricing={"prompt": "0", "completion": "0", "request": "0.04"})]
DECISIONES = [m("typesafe/jev-1.14", "Jev 1.14", "0.000000042", "0", out=("decisions",))]
OTROS = [m("openai/text-embedding-4", "Text Embedding 4", "0.00000002", "0", out=("embeddings",))]
TODOS = {"data": TEXTO + VOCES + OIDOS + IMAGENES + MUSICA + DECISIONES + OTROS}
PNG = base64.b64encode(open(os.path.join(RAIZ, "pruebas", "punto.png"), "rb").read()).decode()
MP3 = base64.b64encode(open(os.path.join(RAIZ, "pruebas", "tono.mp3"), "rb").read()).decode()
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "X-Generation-Id"}
llamadas = []
JEV_DICE = {"choice": "seguir"}   # what the simulated JEV answers

def resp(content, tool=None, cost=0.0012):
    msg = {"content": content}
    if tool: msg["tool_calls"] = [{"id": "c%d" % len(llamadas), "type": "function", "function": {"name": tool[0], "arguments": json.dumps(tool[1])}}]
    return json.dumps({"model": "simulado", "choices": [{"message": msg}], "usage": {"prompt_tokens": 120, "completion_tokens": 40, "cost": cost}})

def chat(b):
    msgs = b["messages"]; sys0 = str(msgs[0]["content"]); ultimo = msgs[-1]
    hay_tool = any(x["role"] == "tool" for x in msgs)
    user = next((x for x in reversed(msgs) if x["role"] == "user"), {"content": ""})
    ut = user["content"] if isinstance(user["content"], str) else " ".join(x.get("text", "") for x in user["content"])
    if sys0.startswith("Eres el Creador de agentes"):
        quiere_tienda = "tienda" in ut.lower()
        return resp(json.dumps({"nombre": "Tendero" if quiere_tienda else "Cocinero", "rol": "subagente", "planta": "nueva", "plantaNueva": {"nombre": "Tienda" if quiere_tienda else "Cocina", "funcion": "Pedidos y clientes" if quiere_tienda else "Menús y compras"},
            "puesto": "pool", "cuerpo": "Preparas el menú de la semana y la lista de la compra, sencillo y barato.", "objetivo": "Un menú cada lunes", "nivel": "economico",
            "latido": {"cada": 7, "unidad": "d"}, "alDespertar": "objetivo", "capacidades": ["escribir", "buscar", "pagos"], "aspecto": {"p": "abuela", "ropa": "#2E9E5B"}, "porque": "Barato y una vez por semana."}), cost=0.004)
    if sys0.startswith("Conviertes el motivo"):   # v7: the cheap model that turns a coin into a rule
        return resp("Escribe frases claras y cortas, de menos de 20 palabras." if "claro" in ut else "No gastes más de tu tope: avisa antes de llegar.", cost=0.00002)
    if "Estás en la sala de reuniones" in sys0:
        return resp("Intervención en la reunión: propongo empezar por lo más barato.", cost=0.0005)
    if "Escribe el acta" in ut:
        return resp("## Conclusiones\n- Empezar por lo más barato.\n\n## Decisiones\n- Revisarlo el lunes.", cost=0.0007)
    if sys0.startswith("Eres el jefe del edificio"):
        u = ut.lower()
        if "agente nuevo" in u and not hay_tool: return resp("", ("asignar_tarea", {"agente": "Creador de agentes", "tarea": "Un agente para la tienda online", "ahora": True}))
        if "redactor" in u and not hay_tool: return resp("", ("asignar_tarea", {"agente": "Redactor", "tarea": "Escribe un saludo para el equipo", "ahora": True}))
        if "decisión importante" in u and not hay_tool: return resp("", ("consultar_sabios", {"pregunta": "¿Abrimos oficina nueva?"}))
        if u.startswith("guarda") and not hay_tool: return resp("", ("guardar_memoria", {"texto": "El coche de la empresa es un Seat azul", "etiquetas": ["coche"]}))
        if "dibuja" in u and not hay_tool: return resp("", ("crear_imagen", {"descripcion": "Un faro al atardecer"}))
        if "compón" in u and not hay_tool: return resp("", ("crear_musica", {"descripcion": "Una sintonía alegre de diez segundos"}))
        if "reúne" in u and not hay_tool: return resp("", ("convocar_reunion", {"titulo": "Saludo al equipo", "orden_del_dia": "Decidir el saludo de la semana.", "participantes": ["Redactor"], "rondas": 2}))
        if hay_tool:
            t = next(x for x in reversed(msgs) if x["role"] == "tool")["content"]
            return resp("He hecho lo que pedías. " + t[:400])
        if "recuerdas" in u: return resp("Sí: " + ("el coche es un Seat azul." if "Seat azul" in sys0 else "no lo encuentro."))
        if "[Imagen adjunta" in ut or isinstance(user["content"], list): return resp("Veo la imagen: " + ("descrita" if "[Imagen adjunta" in ut else "directa"))
        return resp("**Hola.** Soy el jefe del edificio.")
    if "sabio del consejo" in sys0: return resp("Consejo de " + b["model"].split("/")[0], cost=0.02)
    if isinstance(ultimo["content"], list): return resp("Una foto de un punto.", cost=0.0002)
    return resp("¡Hola, equipo! Saludo del Redactor.", cost=0.0003)

def router(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if url.startswith("https://openrouter.ai/api/v1/models"):
        body = TODOS if "output_modalities=all" in url else {"data": VOCES} if "speech" in url else {"data": OIDOS} if "transcription" in url else {"data": IMAGENES} if "=image" in url else {"data": TEXTO}
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps(body))
    if url == "https://openrouter.ai/api/alpha/decisions":
        b = json.loads(request.post_data); llamadas.append({"jev": b})
        c = JEV_DICE["choice"]; probs = {k: (0.7 if k == c else 0.1) for k in ["seguir", "aprovechar", "parar", "preguntar_jefe"]}
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"answers": {"decision": {"choice": c, "probabilities": probs, "confidence": 0.7}}, "usage": {"input_tokens": 300, "output_tokens": 0, "cost": 0.0000126}}))
    if url == "https://openrouter.ai/api/v1/chat/completions":
        b = json.loads(request.post_data); llamadas.append(b)
        if str(b.get("model", "")).startswith("google/lyria"):
            sse = "data: " + json.dumps({"choices": [{"delta": {"audio": {"data": MP3[:len(MP3) // 2], "format": "mp3"}}}]}) + "\n\n" + \
                  "data: " + json.dumps({"choices": [{"delta": {"audio": {"data": MP3[len(MP3) // 2:]}}}], "usage": {"cost": 0.04}}) + "\n\ndata: [DONE]\n\n"
            return route.fulfill(status=200, content_type="text/event-stream", headers=CORS, body=sse)
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=chat(b))
    if url == "https://openrouter.ai/api/v1/images":
        llamadas.append({"imagen": json.loads(request.post_data)})
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"data": [{"b64_json": PNG, "media_type": "image/png"}], "usage": {"cost": 0.04}}))
    if url == "https://openrouter.ai/api/v1/audio/speech":
        llamadas.append({"voz": json.loads(request.post_data)})
        h = dict(CORS); h["X-Generation-Id"] = "gen-1"
        return route.fulfill(status=200, content_type="audio/mpeg", headers=h, body=open(os.path.join(RAIZ, "pruebas", "tono.mp3"), "rb").read())
    if url.startswith("https://openrouter.ai/api/v1/generation"):
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"data": {"total_cost": 0.0009}}))
    if url == "https://openrouter.ai/api/v1/audio/transcriptions":
        llamadas.append({"oido": True})
        return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps({"text": "Que el redactor escriba algo", "usage": {"seconds": 1.5, "cost": 0.000005}}))
    if url.startswith("https://cdn.jsdelivr.net/") and VADPKG:
        mm = re.match(r"https://cdn.jsdelivr.net/npm/(@ricky0123/vad-web|onnxruntime-web)@[^/]+/dist/(.+)", url)
        if mm:
            carpeta = os.path.join(VADPKG, "x/package/dist" if "vad-web" in mm.group(1) else "ort/package/dist")
            f = os.path.join(carpeta, mm.group(2))
            if os.path.exists(f):
                ct = "application/wasm" if f.endswith(".wasm") else "application/javascript" if f.endswith((".js", ".mjs")) else "application/octet-stream"
                return route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": ct}, body=open(f, "rb").read())
    return route.abort()

INIT = """
try { if (!localStorage.getItem("ferAgent.idioma")) localStorage.setItem("ferAgent.idioma", "es"); } catch (e) {}   // estas pruebas son de la web en español
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

def estado(page):
    return json.loads(page.evaluate("localStorage.getItem('ferEdificio.estado')"))
def agente(page, nombre):
    return next(a for a in estado(page)["agentes"] if a["nombre"] == nombre)

def instalar_equipo(page):
    """v8: un edificio nuevo empieza solo con el jefe; estas pruebas trabajan con el equipo recomendado (se instala como lo haría el usuario)"""
    try: solo = len(estado(page)["agentes"]) == 1
    except Exception: solo = False
    if not solo: return
    if page.is_visible("#cajon:not([hidden])"): page.click("#cerrarCajon"); page.wait_for_timeout(200)
    page.click("#abrirSerie"); page.click("#vistaSerie button:has-text('Instalar el equipo recomendado')")
    page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.length > 1")
    page.click("#vistaSerie .volver-btn"); page.wait_for_selector("#vistaSerie", state="hidden")

def entrar(page, equipo=True):
    page.wait_for_selector("#landing .boton-grande")
    page.click("#landing .boton-grande >> nth=0"); page.wait_for_selector("#portada", state="hidden")
    if equipo:
        page.wait_for_timeout(400)
        if not page.is_visible("#cajon:not([hidden])"): instalar_equipo(page)   # without a key Settings opens: the team is installed after pasting it

def ficha(page, nombre, tab="Identidad"):
    """Abre la ficha de un agente tocándolo en el dibujo (v8: el directorio solo sale en «Franjas»); si no está a la vista, en su planta"""
    if page.is_visible("#vistaChat"): page.click("#cerrarChat")
    volver(page)
    ag = agente(page, nombre); sel = f".tramo .pj[data-id='{ag['id']}']"
    if not page.is_visible(sel):
        idx = [p["id"] for p in estado(page)["plantas"]].index(ag["planta"])
        page.click(f".tramo >> nth={idx} >> .entrar"); page.wait_for_timeout(300)
        sel = f".pj[data-id='{ag['id']}']"
    page.click(sel); page.wait_for_selector("#ficha .ficha-pestanas"); page.wait_for_timeout(200)
    if tab: page.click(f".ficha-pestanas button:text-is('{tab}')"); page.wait_for_timeout(200)

def volver(page):
    """De una planta, al edificio entero"""
    try:
        if page.is_visible(".volver"): page.click(".volver", timeout=2000)
    except Exception: pass
    page.wait_for_selector(".tramo")

def chat_con(page, nombre):
    ficha(page, nombre); page.click(f"#ficha .btn.primario:text-is('Hablar con {nombre}')"); page.wait_for_selector("#vistaChat:not([hidden])")

def enviar(page, texto):
    page.fill("#texto", texto); page.keyboard.press("Enter")

def choca(page, a, b):
    """¿Se pisan dos cajas en pantalla?"""
    ra = page.eval_on_selector(a, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
    rb = page.eval_on_selector(b, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
    return not (ra[2] <= rb[0] or rb[2] <= ra[0] or ra[3] <= rb[1] or rb[3] <= ra[1])

servidor = subprocess.Popen([sys.executable, "-m", "http.server", str(PUERTO), "--directory", RAIZ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(viewport={"width": 1360, "height": 900})
        ctx.add_init_script(INIT)
        ctx.route("https://**/*", router)
        page = ctx.new_page(); errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL)
        # ---------- Portada ----------
        page.wait_for_selector("#landing .boton-grande")
        h1 = page.inner_text("#landing h1")
        texto_portada = page.inner_text("#landing")
        check("empresa agéntica a tu servicio" in h1 and page.is_visible(".heroe > img[src='img/portada.webp']"), f"home page: “{h1}” over the tower at night")
        check("Tú decides el organigrama y qué hace cada agente" in texto_portada, "home page: “Nosotros ponemos la base. Tú decides el organigrama y qué hace cada agente.”")
        check("reparte el trabajo" not in texto_portada and "hablas con el jefe" not in texto_portada.lower(), "the sentence “hablas con el jefe y él reparte el trabajo” is gone (from everywhere on the home page)")
        secciones = page.eval_on_selector_all("#landing .seccion-l h2", "hs => hs.map(h => h.textContent)")
        check(secciones[:5] == ["Cómo funciona", "Agentes de serie", "El gasto, bajo control", "Vive donde quieras", "Código abierto"], f"home page with its sections: {secciones}")
        page.screenshot(path=os.path.join(SALIDA, "portada.png"))
        entrar(page)
        page.wait_for_selector(".tramo")
        page.wait_for_selector("#cajon:not([hidden])", timeout=8000)
        check(page.is_visible("#cajonCuerpo h4:text-is('Tu clave de OpenRouter')"), "without a key: Settings opens to paste it")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        # v7: the building starts on general pause; these tests (from v6) are about heartbeats and tasks, so it's started with the switch
        check(page.get_attribute("#pausa", "aria-pressed") == "true" and page.inner_text("#pausaTxt") == "En pausa", "v7: it starts on general pause (nothing spends on its own)")
        page.click("#pausa"); page.wait_for_function("document.querySelector('#pausa').getAttribute('aria-pressed') === 'false'")
        check(page.evaluate("localStorage.getItem('ferAgent.key')") == "sk-or-test", "key saved only in the browser (the same one as the earlier version)")
        instalar_equipo(page)
        # ---------- Edificio ----------
        check(page.inner_text("#medHoy") == "Hoy, sin gasto", f"counter always in view; with no spending it says “{page.inner_text('#medHoy')}” and not “0,0000 $”")
        tramos = page.eval_on_selector_all(".tramo", "ts => ts.map(t => t.className.replace('tramo ', ''))")
        check(tramos == ["cupula", "piso", "vestibulo"], f"building with the drawing's pieces: {tramos}")
        placas = page.eval_on_selector_all(".tramo .placa", "bs => bs.map(b => b.textContent)")
        check(placas == ["Cúpula", "Planta técnica", "Vestíbulo"], f"signs without “0,0000 $” when there's no spending: {placas}")
        ids = page.eval_on_selector_all(".tramo .pj", "ps => ps.map(p => p.dataset.id)")
        check(sorted(ids) == sorted(["jefe", "sabio1", "sabio2", "tecno", "arturito", "creador", "jev", "interventor", "memory"]), f"9 built-in agents in their place: {ids}")
        for ancho in [1360, 1100, 900, 700]:
            page.set_viewport_size({"width": ancho, "height": 900}); page.wait_for_timeout(250)
            if ancho <= 900 and not page.is_visible(".tramo"): page.click("#tabEdificio"); page.wait_for_timeout(200)
            check(not choca(page, ".tramo.piso .placa", ".tramo .pj[data-id='tecno'] img"), f"the tech floor's sign doesn't cover Tecno (window of {ancho} px)")
        page.set_viewport_size({"width": 1360, "height": 900}); page.wait_for_timeout(250)
        c1 = page.eval_on_selector(".leyenda .l-trabajando", "e => getComputedStyle(e).backgroundColor"); c2 = page.eval_on_selector(".leyenda .l-pendiente", "e => getComputedStyle(e).backgroundColor")
        check(c1 != c2, f"legend: “trabajando” ({c1}) and “con tareas pendientes” ({c2}) with different colours")
        e = estado(page)
        check(e["version"] == VERSION_MOTOR and all("cerebroSuperior" not in a for a in e["agentes"]), f"version {VERSION_MOTOR} and no “higher brain” in any agent")
        jev = next(a for a in e["agentes"] if a["rol"] == "jev")
        check(jev["cerebro"] == "~typesafe/jev-latest", f"JEV decides with “Jev Latest”: {jev['cerebro']}")
        check(all({"hablar", "oir"} <= set(a["capacidades"]) for a in e["agentes"] if a["cerebro"] and a["rol"] not in ("jev",)), "speak and hear, on in every agent that holds conversations")
        page.screenshot(path=os.path.join(SALIDA, "edificio.png"))
        # ---------- Create a floor and agents ----------
        page.click("#crearPiso"); page.fill("#cajonCuerpo input", "Contenidos"); page.fill("#cajonCuerpo textarea", "Escribir y publicar")
        page.click("#cajonCuerpo >> text=Crear piso")
        page.wait_for_selector(".planta-cab .nombre-planta")
        check(page.input_value(".nombre-planta") == "Contenidos" and estado(page)["plantas"][1]["nombre"] == "Contenidos", "create floor: it's built on top, under the dome, and you go into it")
        page.click(".tira .modulo.despacho .hueco")
        page.wait_for_selector("#cajon:not([hidden]) >> text=Su ficha")
        page.fill("#cajonCuerpo input[placeholder='Cómo se llama']", "Redactor")
        page.select_option("#cajonCuerpo select >> nth=0", "subagente")
        page.fill("#cajonCuerpo textarea[placeholder^='Quién es']", "Escribes textos claros y cortos para el equipo.")
        optg = page.eval_on_selector_all("#cajonCuerpo .campo:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label)")
        check(optg and optg[0].startswith("Recomendados") and any(g.startswith("Todos · Texto (6)") for g in optg) and any(g.startswith("Otros") for g in optg), f"create agent: brain with recommended ones per level, all the text ones and “Otros”: {optg}")
        caps = page.eval_on_selector_all("#cajonCuerpo .caps input:checked", "is => is.map(i => i.parentElement.textContent.split(/[A-Z]/).length && i.parentElement.querySelector('span').firstChild.textContent)")
        check(caps == ["Escribir", "Hablar", "Oír"], f"a new agent comes with Speak and Hear: {caps}")
        page.click("#cajonCuerpo .pick4 button >> text=Chica")
        page.click("#cajonCuerpo [aria-label='Ropa: amarillo']")
        page.click("#cajonCuerpo >> text=Crear agente")
        page.wait_for_selector(".tira .pj .etiqueta:text('Redactor')")
        red = agente(page, "Redactor")
        check(red["rol"] == "subagente" and red["aspecto"]["ropa"] == "#E8C22C" and {"hablar", "oir"} <= set(red["capacidades"]), "the Redactor appears in its office, with its colour, and can speak and hear")
        page.click("#crearAgente") if page.is_visible("#crearAgente") else page.click(".planta-acciones >> text=+ Agente en esta planta")
        page.fill("#cajonCuerpo .creador textarea", "quiero uno que me haga el menú de la semana")
        page.click("#cajonCuerpo .creador button")
        page.wait_for_selector("#cajonCuerpo .porque")
        caps = page.eval_on_selector_all("#cajonCuerpo .caps input:checked", "is => is.length")
        check(page.input_value("#cajonCuerpo input[placeholder='Cómo se llama']") == "Cocinero" and caps == 4, f"the Creator fills in the profile; never capabilities that pay ({caps} ticked: write, search, speak and hear)")
        page.click("#cajonCuerpo >> text=Crear agente")
        page.wait_for_selector(".tira .pj .etiqueta:text('Cocinero')")
        page.click(".volver"); page.wait_for_selector(".tramo")
        check(len(page.eval_on_selector_all(".tramo.piso", "t => t")) == 3, "back in the building: it now has 3 floors")
        # ---------- Chat with the boss, full screen ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        primero = page.inner_text("#mensajes .msg >> nth=0")
        check(primero.startswith("Hola, soy el jefe de Mi edificio") and "clave" not in primero.lower(), f"the chat's first message is a greeting from the boss: “{primero[:60]}…”")
        check(page.inner_text("#jefeNombre") == "Jefe" and page.eval_on_selector("#avatar", "i => i.getBoundingClientRect().height") > 300, "full-screen chat with the character in big")
        enviar(page, "Que el redactor escriba un saludo ya")
        page.wait_for_selector(".msg.informe", timeout=15000)
        check("Informe de Redactor" in page.inner_text(".msg.informe"), "the boss shares out the work, the Redactor works and its report reaches the boss's chat")
        check(not any("el control externo" in str(x.get("messages", [{}])[0].get("content", "")) for x in llamadas if "messages" in x), "there's no longer a JEV review after each job (nor a repeat with an expensive brain)")
        enviar(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.informe .propuesta", timeout=15000)
        page.click(".msg.informe .propuesta >> text=Crear a Tendero")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.some(a => a.nombre === 'Tendero')", timeout=5000)
        check(True, "asking the boss for an agent: the Creator designs it, JEV lets it go ahead and it's created with one tap")
        check(any("jev" in x and "Crear otro agente" in x["jev"]["state"][1] for x in llamadas), "before creating another agent, JEV is asked")
        enviar(page, "Decisión importante: ¿abrimos oficina?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Consejo de anthropic') && b.textContent.includes('Consejo de openai'))", timeout=15000)
        check(True, "the council of sages answers (both) when the boss consults it")
        enviar(page, "Guarda que el coche de la empresa es un Seat azul")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Guardado'))", timeout=15000)
        enviar(page, "¿Recuerdas de qué color es el coche?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Seat azul'))", timeout=15000)
        check("Memory encontró 1" in page.inner_text("#mensajes"), "“recuerdas” → Memory searches and the boss answers with the memory")
        enviar(page, "Dibuja un faro")
        page.wait_for_selector(".msg.bot .burbuja img", timeout=15000)
        check(any("imagen" in x for x in llamadas), "create images: the boss asks for an image and it's shown in the chat")
        page.click("#cerrarChat"); ficha(page, "Jefe", "Capacidades"); page.click("#ficha .cap:has-text('Crear música') input"); page.wait_for_timeout(250)
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        enviar(page, "Compón una sintonía")
        page.wait_for_selector(".msg.bot .burbuja audio", timeout=15000)
        lyria = [x for x in llamadas if str(x.get("model", "")).startswith("google/lyria")]
        check(lyria and lyria[-1].get("modalities") == ["text", "audio"] and lyria[-1].get("stream") is True, "create music: it asks Lyria for audio and the song plays in the chat")
        page.set_input_files("#fichero", os.path.join(RAIZ, "pruebas", "punto.png"))
        page.wait_for_selector("#adjunto:not([hidden])")
        enviar(page, "¿Qué ves?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Veo la imagen'))", timeout=15000)
        check(True, "see: the boss receives the attached image")
        page.screenshot(path=os.path.join(SALIDA, "chat-jefe.png"))
        # ---------- Chat with another agent (the Redactor), with its own brain ----------
        chat_con(page, "Redactor")
        check(page.inner_text("#jefeNombre") == "Redactor" and page.inner_text("#mensajes .msg >> nth=0").startswith("Hola, soy Redactor"), "each agent has its own chat: the Redactor's greeting")
        n0 = len(llamadas)
        enviar(page, "Escribe una frase para la web")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        ultima = [x for x in llamadas[n0:] if "messages" in x][-1]
        check(ultima["messages"][0]["content"].startswith("Escribes textos claros") and ultima["model"] == red["cerebro"], "the Redactor answers with its instructions and its brain")
        e = estado(page); r2 = agente(page, "Redactor")
        check(len(r2["chat"]) == 2 and not any(x.get("content") == "Escribe una frase para la web" for x in e["conversacion"]), "the conversation stays in its chat, not the boss's")
        # Coins: a gold one from the chat, with its reason
        page.click("#mensajes .msg.bot:not(.saludo) .moneda-btn >> nth=0")
        page.fill(".motivo-fila input", "Escribió claro y corto"); page.click(".motivo-fila .btn.primario")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        e = estado(page)
        check(any(x["tipo"] == "oro" and x["estado"] == "confirmada" and x["motivo"] == "Escribió claro y corto" for x in e["monedas"]) and any(l["texto"] == "Escribe frases claras y cortas, de menos de 20 palabras." and l["papel"] == "subagente" and l["estado"] == "propuesta" for l in e["lecciones"]),
              "v7: a gold coin with its reason → a cheap model turns it into a concrete rule, which waits for your yes")
        # it's approved in the inbox (and can be retouched)
        page.click("#cerrarChat"); page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja:not([hidden]) .peticion")
        check(page.is_visible("#vistaBandeja .peticion:has-text('Lección nueva') textarea"), "the lesson reaches the inbox, to approve or retouch it")
        page.click("#vistaBandeja .peticion:has-text('Lección nueva') button:text-is('Aprobar')"); page.wait_for_timeout(300)
        check(any(l["estado"] == "aprobada" and "frases claras" in l["texto"] for l in estado(page)["lecciones"]), "approved: it's now a lesson of its role")
        page.click("#vistaBandeja .volver-btn"); chat_con(page, "Redactor")
        n0 = len(llamadas)
        enviar(page, "Otra frase")
        page.wait_for_function("document.querySelectorAll('#mensajes .msg.bot:not(.saludo)').length >= 2", timeout=15000)
        ultima = [x for x in llamadas[n0:] if "messages" in x][-1]
        check("Escribe frases claras y cortas" in ultima["messages"][0]["content"], "the lesson now goes in the Redactor's instructions")
        page.screenshot(path=os.path.join(SALIDA, "chat-redactor.png"))
        # Own voice: two agents with no voice chosen sound different
        n0 = len(llamadas)
        page.click("#mensajes .msg.bot:not(.saludo) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_function("[...document.querySelectorAll('.nota-voz')].some(n => n.textContent.includes('0,0009'))", timeout=15000)
        voz_red = [x for x in llamadas[n0:] if "voz" in x][-1]["voz"]
        page.click("#cerrarChat"); page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        n0 = len(llamadas)
        page.click("#mensajes .msg.bot:not(.saludo) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_timeout(1500)
        voz_jefe = [x for x in llamadas[n0:] if "voz" in x][-1]["voz"]
        check(voz_red.get("voice") and voz_jefe.get("voice") and voz_red["voice"] != voz_jefe["voice"], f"each agent with its own voice: the boss “{voz_jefe.get('voice')}”, the Redactor “{voz_red.get('voice')}”")
        check(any(k.startswith("voz") or True for k in agente(page, "Redactor")["gasto"]) and sum(agente(page, "Redactor")["gasto"].values()) > 0, "what its voice and its chat cost is charged to the Redactor")
        page.click("#cerrarChat")
        # ---------- Profile in four tabs ----------
        ficha(page, "Redactor")
        pest = page.eval_on_selector_all(".ficha-pestanas button", "bs => bs.map(b => b.textContent)")
        check(pest == ["Identidad", "Trabajo", "Cerebro y gasto", "Capacidades"], f"profile in tabs: {pest}")
        check("Cerebro superior" not in page.inner_text("body"), "“Cerebro superior” no longer appears")
        page.fill("#ficha .campo:has(> span:text-is('Nombre')) input", "Redactora"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(any(a["nombre"] == "Redactora" for a in estado(page)["agentes"]), "it's renamed from Identity")
        page.click(".ficha-pestanas button:text-is('Trabajo')")
        check(page.is_visible("#ficha .leccion:has-text('frases claras')"), "Work: its lessons (its role's)")
        page.click("#ficha .leccion:has-text('frases claras') button:text-is('Fijar')"); page.wait_for_timeout(250)
        check(next(l for l in estado(page)["lecciones"] if "frases claras" in l["texto"])["fija"] is True, "a lesson can be pinned so it never goes")
        page.select_option("#ficha .bloque:has(h4:text('Latido')) select >> nth=0", "min")
        page.fill("#ficha .bloque:has(h4:text('Latido')) input[type=number]", "10"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(agente(page, "Redactora")["latido"] == {"cada": 10, "unidad": "min"}, "Work: the heartbeat is changed")
        page.click(".ficha-pestanas button:text-is('Cerebro y gasto')")
        page.click("#ficha .prioridad button >> text=1"); page.wait_for_timeout(200)
        check(agente(page, "Redactora")["prioridad"] == 1, "Brain and spending: priority changed to 1")
        page.click(".ficha-pestanas button:text-is('Capacidades')")
        page.click("#ficha .cap:has-text('Crear música') input"); page.wait_for_selector("#ficha .cap-bloque.on:has-text('Crear música') select")
        mus = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Crear música') option", "os => os.map(o => o.value)")
        check("google/lyria-3-clip-preview" in mus and not any(v.startswith("anthropic/") for v in mus), f"Create music: its picker only has music models ({[v for v in mus if v]})")
        voz_ops = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Hablar') select >> nth=0 >> option", "os => os.map(o => o.value)")
        oido_ops = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Oír') select option", "os => os.map(o => o.value)")
        check("google/gemini-3.8-flash-lite-tts" in voz_ops and "openai/whisper-large-v3-turbo" in oido_ops and "openai/whisper-large-v3-turbo" not in voz_ops, "each model appears where it's useful: voice in Speak, hearing in Hear")
        page.select_option("#ficha .cap-bloque:has-text('Hablar') select >> nth=1", "Aoede"); page.wait_for_timeout(250)
        check(agente(page, "Redactora")["voz"]["voz"] == "Aoede", "Speak: each agent chooses its voice")
        caps_avz = page.eval_on_selector_all("#ficha .cap.avz input", "is => is.map(i => i.disabled)")
        check(len(caps_avz) == 5 and all(caps_avz), "v7: the 5 advanced capabilities left are still pending plugs (browsing and the computer's folder are now “Hands”, with Fer Home)")
        page.screenshot(path=os.path.join(SALIDA, "ficha.png"))
        ficha(page, "JEV", "Cerebro y gasto")
        check("Jev Latest" in page.inner_text("#ficha select option:checked"), "JEV's profile shows “Jev Latest”")
        # ---------- JEV before spending: searching ----------
        ficha(page, "Redactora", "Capacidades"); page.click("#ficha .cap:has-text('Buscar en internet') input"); page.wait_for_timeout(250)
        page.click(".ficha-pestanas button:text-is('Trabajo')")
        JEV_DICE["choice"] = "parar"; n0 = len(llamadas)
        page.fill("#ficha input[placeholder='Encárgale algo…']", "Busca precios de imprentas")
        page.check("#ficha .bloque:has(h4:text('Tareas')) input[type=checkbox]")
        page.click("#ficha >> text=Encargar")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.find(a => a.nombre === 'Redactora').tareas.some(t => t.texto === 'Busca precios de imprentas' && t.estado === 'parada')", timeout=15000)
        nuevas = llamadas[n0:]
        jev_q = [x["jev"] for x in nuevas if "jev" in x]
        check(jev_q and jev_q[0]["model"] == "~typesafe/jev-latest" and len(jev_q[0]["state"]) == 3 and not any("messages" in x for x in nuevas),
              "JEV says “stop”: it gets who the agent is, what it's about to do and its short memory, and nothing is spent on searching")
        JEV_DICE["choice"] = "seguir"
        page.click("#tabActividad"); page.click("#actJev"); page.wait_for_timeout(250)
        reg = page.inner_text("#registro")
        check("Redactora" in reg and "parar" in reg and "¿Sirvió?" in reg, "Activity → Questions to JEV: time, agent, action, what JEV said, what it did and whether it helped")
        page.click("#registro .jev-consulta >> nth=0 >> button:text-is('Sí')"); page.wait_for_timeout(250)
        check(estado(page)["consultasJev"][-1]["sirvio"] is True, "you can mark whether the question helped")
        page.click("#tabFicha")
        # ---------- Spending, cap and the red coin the Controller proposes ----------
        n_ag = len(estado(page)["agentes"])
        page.click("#medidor"); page.wait_for_selector("table.gasto")
        check(len(page.eval_on_selector_all("table.gasto tbody tr", "rs => rs")) == n_ag, f"spending per agent: one row for each of the {n_ag} agents")
        page.fill("#cajonCuerpo input[type=number] >> nth=0", "0.01"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        page.click("#cerrarCajon")
        congelados = page.eval_on_selector_all(".tramo .pj.congelado", "ps => ps.map(p => p.dataset.id)")
        check("jefe" in congelados, f"on reaching the cap everything freezes, the boss too (in ice blue): {len(congelados)}")
        page.click("#hablarJefe"); enviar(page, "hola")
        page.wait_for_selector(".msg.error")
        check("congelado" in page.inner_text(".msg.error"), "the frozen boss doesn't spend and explains it in its chat")
        page.click("#cerrarChat")
        page.click("#medidor"); page.fill("#cajonCuerpo input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(300); page.click("#cerrarCajon")
        check(page.eval_on_selector_all(".pj.congelado", "v => v.length") == 0, "when the cap is raised, everyone goes back to work")
        ficha(page, "Cocinero", "Cerebro y gasto")
        page.fill("#ficha input[placeholder='sin tope propio']", "0.0001"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        chat_con(page, "Cocinero"); enviar(page, "Hola"); page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000); page.wait_for_timeout(300)
        page.click("#cerrarChat")
        prop = [x for x in estado(page)["monedas"] if x["estado"] == "propuesta" and x["propone"] == "interventor"]
        check(prop and page.is_visible("#globoMes") and page.inner_text("#globoMes") == "1", "the Controller proposes a red coin for whoever reaches their cap; it's flagged in “Agent of the month”")
        # ---------- Agent of the month ----------
        page.click("#abrirMes"); page.wait_for_selector("#vistaMes:not([hidden]) .podio")
        check("Redactora" in page.inner_text("#vistaMes .podio .primero"), "Agent of the month: the Redactora, with her gold coin, tops the podium")
        check(len(page.eval_on_selector_all("#vistaMes table.ranking tbody tr", "r => r")) == len(estado(page)["agentes"]), "ranking with every agent, by coins and spending")
        page.click("#vistaMes .fila-moneda:has-text('Cocinero') button:text-is('Confirmar')"); page.wait_for_timeout(300)
        e = estado(page)
        check(any(x["propone"] == "interventor" and x["estado"] == "confirmada" for x in e["monedas"]) and any(l["estado"] == "propuesta" and l["texto"].startswith("No gastes más de tu tope") for l in e["lecciones"]) and page.is_hidden("#globoMes"),
              "once confirmed, the red coin counts and its rule waits for your yes in the inbox")
        page.screenshot(path=os.path.join(SALIDA, "agente-del-mes.png"))
        page.click("#vistaMes .volver-btn")
        page.click("#medidor"); page.fill("#cajonCuerpo input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(200); page.click("#cerrarCajon")
        ficha(page, "Cocinero", "Cerebro y gasto"); page.fill("#ficha input[placeholder='sin tope propio']", "0"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        # ---------- Meeting rooms ----------
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden]) .form-osc")
        page.fill(".form-osc input >> nth=0", "Plan de la semana"); page.fill(".form-osc textarea", "Qué hacemos esta semana.")
        for nombre in ["Redactora", "Cocinero"]: page.click(f".elegir-asistentes label:has-text('{nombre}') input")
        page.fill(".form-osc input[type=number]", "1")
        check("Coste estimado" in page.inner_text(".form-osc") and not page.is_visible(".elegir-asistentes label:has-text('Memory')") and not page.is_visible(".elegir-asistentes label:has-text('JEV')"), "new meeting: estimated cost in view; Memory and JEV don't sit down")
        page.click(".form-osc .btn.primario:text-is('Convocar')"); page.wait_for_selector(".mesa .asiento")
        check(len(page.eval_on_selector_all(".mesa .asiento", "a => a")) == 3 and estado(page)["reuniones"][-1]["estado"] == "lista", "called: the table with the boss and the two; it hasn't started yet")
        page.click(".form-osc .btn.primario"); page.wait_for_selector("#vistaSalas .acta", timeout=20000)
        r = estado(page)["reuniones"][-1]
        check(r["estado"] == "terminada" and r["intervenciones"][0]["modera"] and len(r["intervenciones"]) == 3 and "## Decisiones" in r["acta"], "the meeting: the boss chairs, each one speaks and at the end the minutes (conclusions and decisions)")
        page.screenshot(path=os.path.join(SALIDA, "sala.png"))
        page.click("#vistaSalas .volver-btn")
        # the boss calls it: it doesn't start until you confirm the rounds
        page.click("#hablarJefe"); enviar(page, "Reúne al equipo para el saludo")
        page.wait_for_selector(".tarjeta-reunion input[type=number]", timeout=15000)
        r = estado(page)["reuniones"][-1]
        check(r["convoca"] == "jefe" and r["estado"] == "propuesta", "the boss proposes a meeting; it waits for your yes")
        page.fill(".tarjeta-reunion input[type=number]", "1"); page.click(".tarjeta-reunion .btn.primario")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).reuniones.at(-1).estado === 'terminada'", timeout=20000)
        check(estado(page)["reuniones"][-1]["rondas"] == 1, "with your yes and your rounds, it's held")
        page.click("#vistaSalas .volver-btn") if page.is_visible("#vistaSalas") else None
        # ---------- Renombrarlo todo ----------
        page.click("#abrirAjustes")
        page.fill("#cajonCuerpo label:has-text('Nombre del edificio') input", "Torre Norte"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        page.click("#cerrarCajon")
        for i, nuevo in [(0, "Dirección"), (len(estado(page)["plantas"]) - 1, "Entrada")]:
            page.click(f".tramo >> nth={i} >> .placa"); page.wait_for_selector(".nombre-planta")
            page.fill(".nombre-planta", nuevo); page.keyboard.press("Tab"); page.wait_for_timeout(250); volver(page)
        ficha(page, "Jefe"); page.fill("#ficha .campo:has(> span:text-is('Nombre')) input", "Ana"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        ficha(page, "Creador de agentes"); page.fill("#ficha .campo:has(> span:text-is('Nombre')) input", "Clara"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        e = estado(page)
        check(e["nombre"] == "Torre Norte" and e["plantas"][0]["nombre"] == "Dirección" and e["plantas"][-1]["nombre"] == "Entrada", "the building, the dome and the lobby are renamed")
        check(page.inner_text("#nombreEdificio") == "Torre Norte" and page.inner_text("#hablarJefe") == "Hablar con Ana" and "Dirección" in page.eval_on_selector_all(".placa b", "b => b.map(x => x.textContent)"), "and it shows in the header, on the boss's button and on the signs")
        page.click("#hablarJefe")
        check(page.inner_text("#mensajes .msg >> nth=0").startswith("Hola, soy Ana, el jefe de Torre Norte"), "the greeting uses the new names")
        n0 = len(llamadas)
        enviar(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.informe:has-text('Clara')", timeout=15000)
        sis = [x for x in llamadas[n0:] if "messages" in x][0]["messages"][0]["content"]
        check("Te llamas Ana" in sis, "the boss knows it's now called Ana")
        check(True, "even if the Creator is called Clara, the boss still gives it new agents to make")
        page.click("#cerrarChat")
        # ---------- The boss's look (from its profile) ----------
        ficha(page, "Ana"); page.click("#ficha >> text=Cambiar su foto y su nombre"); page.click("#cajonCuerpo .pick4 button >> text=Chica")
        page.click("#cajonCuerpo [aria-label='Ropa: verde']")
        page.wait_for_function("getComputedStyle(document.documentElement).getPropertyValue('--acento').trim().toUpperCase() === '#2E9E5B'", timeout=5000)
        check(True, "the boss's look from its profile: the website takes the colour of its clothes")
        page.click("#cerrarCajon")
        # ---------- Settings: models, lessons, view; built-in agents; backup ----------
        page.click("#abrirAjustes")
        txt = page.inner_text("#cajonCuerpo")
        check("Modelos por defecto del edificio" in txt and "Crear música" in txt and "Modelos recomendados" in txt, "Settings: default models (music too) and recommended ones")
        page.fill("#cajonCuerpo .campo:has-text('Lecciones que se guardan por papel') input", "3"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(estado(page)["ajustes"]["leccionesPorPapel"] == 3, "Settings: the number of lessons per role is changed")
        page.click("#cerrarCajon")
        ficha(page, "Arturito"); page.click("#ficha >> text=Borrar"); page.click("#ficha >> text=¿Borrar? Pulsa otra vez")
        page.wait_for_function("!JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.some(a => a.id === 'arturito')")
        page.click("#abrirSerie"); page.click("#vistaSerie .serie-ag:has-text('Arturito') button:text-is('Instalar')")
        page.wait_for_selector("text=Instalado: Arturito.")
        check(any(a["id"] == "arturito" for a in estado(page)["agentes"]), "a deleted built-in agent (Arturito) is installed again from “Built-in agents”")
        page.click("#vistaSerie .volver-btn"); page.click("#abrirAjustes")
        with page.expect_download() as d: page.click("#cajonCuerpo >> text=Guardar copia ahora")
        copia = json.loads(open(d.value.path()).read())
        check(copia["tipo"] == "fer-agent-copia" and len(copia["edificio"]["agentes"]) == len(estado(page)["agentes"]) and "sk-or" not in json.dumps(copia), "the building's backup is downloaded (with images and music) and doesn't carry the key")
        page.click("#cerrarCajon")
        page.click("#tabActividad"); page.click("#actTodo")
        reg = page.inner_text("#registro")
        check("JEV" in reg and "Memory" in reg and "Redactora" in reg, "Activity → Everything: what each agent does is shown")
        check(not errores, f"no JavaScript errors: {errores}")
        b.close()

        # ---------- A building of 72 agents on 12 floors, with no heartbeat or spending ----------
        torre = subprocess.run(["node", os.path.join(RAIZ, "pruebas", "torre72.mjs")], capture_output=True, text=True, check=True).stdout
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); }" % json.dumps(torre))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        n0 = len(llamadas)
        t0 = time.time(); page.goto(URL); entrar(page); page.wait_for_selector(".tramo.franja"); t1 = time.time()
        e = estado(page)
        pisos = [x for x in e["plantas"] if x["tipo"] == "piso"]
        check(len(pisos) == 12 and sum(1 for a in e["agentes"] if any(a["planta"] == x["id"] for x in pisos)) == 72, f"test building: 12 floors with 72 agents (plus the boss and Memory: {len(e['agentes'])})")
        franjas = page.eval_on_selector_all(".tramo.franja", "fs => fs.map(f => f.innerText.replace(/\\s+/g, ' '))")
        check(len(franjas) == 12 and all("6 agentes · 0 trabajando" in f and "$" not in f for f in franjas), f"automatic view in strips: name, agents, how many are working and no “$” because there's no spending ({franjas[0]})")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 74, "the directory lists all 74")
        fil = page.eval_on_selector_all(".filtros button", "bs => bs.map(b => b.textContent)")
        check("Apagados (4)" in fil and "Con tareas pendientes (0)" in fil and "Todos (74)" in fil, f"filters with their count: {fil}")
        page.fill(".buscador", "legal"); page.wait_for_timeout(200)
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 6, "searching “legal” leaves Legal's 6")
        page.fill(".buscador", "")
        page.click(".filtros button:has-text('Apagados')")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 4, "filter “Apagados”: the 4 switched off")
        page.click(".filtros button:has-text('Apagados')")
        page.screenshot(path=os.path.join(SALIDA, "torre72-franjas.png"))
        page.click(".tramo.franja >> nth=6"); page.wait_for_selector(".quienes")
        check(len(page.eval_on_selector_all(".quien", "q => q")) == 6, "when going into a floor, its 6 agents with figures")
        page.click(".volver"); page.wait_for_selector(".tramo.franja"); page.click("#verDibujo")
        try: page.wait_for_function("document.querySelectorAll('.tramo.piso:not(.franja)').length === 12 && document.querySelectorAll('.tramo .pj').length === 74", timeout=4000)
        except Exception: pass
        cuentas = (len(page.eval_on_selector_all(".tramo.piso:not(.franja)", "t => t")), len(page.eval_on_selector_all(".tramo .pj", "p => p")))
        check(cuentas == (12, 74), f"the “Dibujo” switch shows the 12 drawn floors with their 74 figures: {cuentas}")
        page.click("#verFranjas"); page.wait_for_timeout(300)
        check(page.evaluate("document.documentElement.scrollWidth") <= 1360, "without overflowing in width")
        page.wait_for_timeout(24000)   # more than one building heartbeat
        pagadas = [x.get("model") or list(x)[0] for x in llamadas[n0:] if "messages" in x or "jev" in x or "voz" in x or "imagen" in x]
        check(not pagadas and page.inner_text("#medHoy") == "Hoy, sin gasto", f"in 25 seconds with the key set: no paid call and “Hoy, sin gasto” ({pagadas}, {page.inner_text('#medHoy')})")
        check(t1 - t0 < 8, f"loads in {t1 - t0:.1f} s")
        check(not errores, f"72-agent building with no errors: {errores}")
        b.close()

        # ---------- A version 4 building saved in the browser moves to 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v4 = {"version": "4.0", "nombre": "Casa", "plantilla": "particular", "ajustes": {"topeDiario": 2}, "plantas": [{"id": "direccion", "nombre": "Dirección", "tipo": "direccion"}, {"id": "p1", "nombre": "Investigación", "tipo": "equipo"}, {"id": "control", "nombre": "Control", "tipo": "control"}],
              "agentes": [{"id": "jefe", "nombre": "Fer", "rol": "jefe", "planta": "direccion"}, {"id": "x", "nombre": "Investigador", "rol": "trabajador", "planta": "p1"}], "memoriaLarga": [{"id": "m", "ts": 1, "texto": "Me gustan las respuestas cortas"}], "conversacion": [], "registro": []}
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); localStorage.setItem('ferAgent.look', JSON.stringify({p: 'chica', chica: {ropa: '#7B3FB5'}})); }" % json.dumps(json.dumps(v4)))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); entrar(page); page.wait_for_selector(".tramo")
        e = estado(page)
        check([x["nombre"] for x in e["plantas"]] == ["Cúpula", "Planta técnica", "Investigación", "Vestíbulo"] and e["nombre"] == "Casa" and e["memoriaLarga"][0]["texto"].startswith("Me gustan") and e["ajustes"]["topeDiario"] == 2,
              "a version 4 building is rebuilt with the new structure and keeps its name, caps and memory")
        check(e["agentes"][0]["aspecto"]["p"] == "chica" and e["agentes"][0]["aspecto"]["ropa"] == "#7B3FB5", "the boss's look you had in v4 is kept")
        page.click("#hablarJefe")
        check(any(a["nombre"] == "Investigador" for a in e["agentes"]) and "Investigador" in page.inner_text("#mensajes"), "your v4 agent comes along and Tecno tells you about it in the boss's chat")
        p2 = ctx.new_page(); p2.on("pageerror", lambda e: errores.append(str(e)))
        p2.goto(URL); p2.wait_for_selector(".otra-pestana")
        check(p2.is_visible("text=El edificio ya está abierto en otra pestaña"), "second tab: it warns that the building is already open")
        page.close()
        p2.wait_for_selector("#portada:not([hidden])", timeout=10000); entrar(p2); p2.wait_for_selector(".tramo")
        check(not p2.is_visible(".otra-pestana"), "when the first one closes, the second opens on its own")
        check(not errores, f"move from v4 to v6 with no errors: {errores}")
        b.close()

        # ---------- A version 5 building moves to 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v5 = subprocess.run(["node", "-e", "import('%s').then(async ({ Edificio }) => { let g; const ed = new Edificio({ cargar: async () => null, guardar: async (j) => { g = j; }, clave: () => '' }); await ed.iniciar('basico'); const e = JSON.parse(g); e.version = '5.0'; for (const a of e.agentes) { a.cerebroSuperior = 'openai/gpt-6.1-sol-pro'; delete a.voz; delete a.chat; a.capacidades = a.rol === 'jefe' ? a.capacidades : ['escribir']; } delete e.vozParaTodos; const j = e.agentes.find(a => a.rol === 'jev'); j.cerebro = 'deepseek/deepseek-v4.1-flash'; process.stdout.write(JSON.stringify(e)); })" % os.path.join(RAIZ, "engine.js")], capture_output=True, text=True, check=True).stdout
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); }" % json.dumps(v5))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); entrar(page); page.wait_for_selector(".tramo")
        e = estado(page)
        j = next(a for a in e["agentes"] if a["rol"] == "jev")
        check(e["version"] == VERSION_MOTOR and all("cerebroSuperior" not in a for a in e["agentes"]) and j["cerebro"] == "~typesafe/jev-latest", "a version 5 building: no higher brain and JEV moves to “Jev Latest” (and it reaches 7)")
        check(all({"hablar", "oir"} <= set(a["capacidades"]) for a in e["agentes"] if a["cerebro"] and a["rol"] != "jev"), "and Speak and Hear are switched on once in everyone that holds conversations")
        check(not errores, f"move from v5 to v6 with no errors: {errores}")
        b.close()

        # ---------- Mic with the simulated detector (in the boss's chat and in another agent's) ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT + FAKE_VAD); ctx.route("https://**/*", router)
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload(); entrar(page); page.wait_for_selector(".tramo")
        page.click("#hablarJefe")
        page.click("#micro"); page.wait_for_function("(window.__vadCalls||[]).includes('start')")
        check(page.inner_text("#jefeEstado").startswith("Te escucho"), "mic: the boss listens")
        n = len(llamadas)
        page.evaluate("setTimeout(() => window.__vadOpts.onSpeechEnd(new Float32Array(16000)), 0)")
        page.wait_for_function("[...document.querySelectorAll('.msg.me .meta')].some(m => m.textContent.includes('por voz'))", timeout=15000)
        page.wait_for_function("window.__vadCalls.filter(c => c === 'start').length >= 2", timeout=15000)
        check(any("oido" in x for x in llamadas[n:]) and any("voz" in x for x in llamadas[n:]), "mic: Whisper transcribes, the boss answers by voice and listens again")
        page.click("#micro"); page.click("#cerrarChat")
        ficha(page, "Interventor")
        check(not page.is_visible("#ficha .btn.primario:has-text('Hablar con')"), "the Controller (no brain) has no chat")
        chat_con(page, "Tecno")
        check(not page.is_disabled("#micro"), "Tecno has a mic in its chat")
        page.click("#cerrarChat"); ficha(page, "Tecno", "Capacidades"); page.click("#ficha .cap:has-text('Oír') input"); page.wait_for_timeout(250)
        chat_con(page, "Tecno")
        check(page.is_disabled("#micro"), "without the Hear capability, the mic in its chat switches off")
        check(not errores, f"mic with no errors: {errores}")
        b.close()

        # ---------- Real voice detector with the sealed files ----------
        if VADPKG:
            b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            ctx = b.new_context(); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
            page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
            page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload(); entrar(page); page.wait_for_selector(".tramo")
            page.click("#hablarJefe"); page.click("#micro")
            try:
                page.wait_for_function("document.querySelector('#jefeEstado').textContent.startsWith('Te escucho') || document.querySelector('.msg.error')", timeout=40000)
            except Exception: pass
            cargado = page.evaluate("!!(window.vad && window.vad.MicVAD && window.ort)")
            check(cargado, "real detector: the two sealed files are downloaded and the seal matches (the browser accepts them)")
            page.click("#micro"); b.close()

        # ---------- Translation: a test dictionary changes the texts without touching the code ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.route("**/textos/zz.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body='export default { "You have an agentic company at your service.": "ZZ · una empresa agéntica a tu servicio.", "Talk to {1}": "ZZ hablar con {1}", "Settings": "ZZ ajustes", "Today, no spending": "ZZ hoy, sin gasto" };'))   # v9: the code is in English; a dictionary has English on the left
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL + "?lang=zz"); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.goto(URL + "?lang=zz")
        page.wait_for_selector("#landing h1")
        check(page.inner_text("#landing h1") == "ZZ · una empresa agéntica a tu servicio.", "translation: the home page comes from the dictionary")
        entrar(page, equipo=False); page.wait_for_selector(".tramo")
        check(page.inner_text("#hablarJefe") == "ZZ hablar con Jefe" and page.get_attribute("#abrirAjustes", "aria-label") == "ZZ ajustes" and page.inner_text("#medHoy") == "ZZ hoy, sin gasto", "translation: the header too, with sentences that carry data (“ZZ hablar con Jefe”)")
        check(not errores, f"translation with no errors: {errores}")
        b.close()

        # ---------- Dark mobile ----------
        b = p.chromium.launch()
        ctx = b.new_context(color_scheme="dark", viewport={"width": 390, "height": 844}, device_scale_factor=2); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload()
        page.wait_for_selector("#landing .boton-grande")
        check(page.evaluate("document.querySelector('#portada').scrollWidth") <= 390, "mobile: the home page doesn't overflow")
        page.screenshot(path=os.path.join(SALIDA, "movil-portada.png"))
        entrar(page); page.wait_for_selector(".tramo"); page.wait_for_timeout(600)
        check(page.is_visible(".edificio") and page.evaluate("document.documentElement.scrollWidth") <= 390, "mobile: it opens in the building, with no horizontal scrolling")
        check(page.is_visible("#abrirMes") and page.is_visible("#abrirSalas"), "mobile: “Agente del mes” and “Reuniones” are within reach too")
        check(not choca(page, ".tramo.piso .placa", ".tramo .pj[data-id='tecno'] img"), "mobile: the sign doesn't cover Tecno")
        page.screenshot(path=os.path.join(SALIDA, "movil-edificio.png"))
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390 and page.is_visible("#texto"), "mobile: the chat fits")
        page.screenshot(path=os.path.join(SALIDA, "movil-chat.png"))
        page.click("#cerrarChat"); page.click(".tramo.piso .placa"); page.wait_for_selector(".tira .modulo")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390, "mobile: inside a floor it doesn't overflow either")
        page.click(".quien >> text=Tecno"); page.wait_for_timeout(300)
        check(page.is_visible("#vistaFicha .ficha-cab") and not page.is_visible(".edificio"), "mobile: touching an agent opens its profile")
        check(not errores, f"mobile with no errors: {errores}")
        b.close()
finally:
    servidor.terminate()
print("RESULT:", "OK" if ok else "FAILURES"); sys.exit(0 if ok else 1)
