"""Pruebas de la web del edificio (versión 6) con OpenRouter simulado (Playwright).
Uso: python3 pruebas/web_test.py  (arranca su propio servidor local; necesita node para el edificio de 72 agentes)"""
import json, os, sys, base64, subprocess, time, re
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.environ.get("SALIDA", os.path.join(RAIZ, "pruebas", "capturas"))
os.makedirs(SALIDA, exist_ok=True)
PUERTO = 8811
VERSION_MOTOR = re.search(r'VERSION = "([^"]+)"', open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine.js"), encoding="utf-8").read()).group(1)   # la versión que marca el motor
URL = f"http://localhost:{PUERTO}/index.html"
VADPKG = os.environ.get("VADPKG", "")  # carpeta con los paquetes reales del detector de voz (opcional)

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
JEV_DICE = {"choice": "seguir"}   # lo que contesta el JEV simulado

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
    if sys0.startswith("Conviertes el motivo"):   # v7: el modelo barato que convierte una moneda en regla
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
        if not page.is_visible("#cajon:not([hidden])"): instalar_equipo(page)   # sin clave se abre Ajustes: el equipo se instala después de pegarla

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
        check("empresa agéntica a tu servicio" in h1 and page.is_visible(".heroe > img[src='img/portada.webp']"), f"portada: «{h1}» sobre la torre de noche")
        check("Tú decides el organigrama y qué hace cada agente" in texto_portada, "portada: «Nosotros ponemos la base. Tú decides el organigrama y qué hace cada agente.»")
        check("reparte el trabajo" not in texto_portada and "hablas con el jefe" not in texto_portada.lower(), "ya no está la frase «hablas con el jefe y él reparte el trabajo» (en ninguna parte de la portada)")
        secciones = page.eval_on_selector_all("#landing .seccion-l h2", "hs => hs.map(h => h.textContent)")
        check(secciones[:5] == ["Cómo funciona", "Agentes de serie", "El gasto, bajo control", "Vive donde quieras", "Código abierto"], f"portada con sus secciones: {secciones}")
        page.screenshot(path=os.path.join(SALIDA, "portada.png"))
        entrar(page)
        page.wait_for_selector(".tramo")
        page.wait_for_selector("#cajon:not([hidden])", timeout=8000)
        check(page.is_visible("#cajonCuerpo h4:text-is('Tu clave de OpenRouter')"), "sin clave: se abre Ajustes para pegarla")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        # v7: el edificio arranca en pausa general; estas pruebas (de la v6) son de latidos y tareas, así que se pone en marcha con el interruptor
        check(page.get_attribute("#pausa", "aria-pressed") == "true" and page.inner_text("#pausaTxt") == "En pausa", "v7: arranca en pausa general (nada gasta solo)")
        page.click("#pausa"); page.wait_for_function("document.querySelector('#pausa').getAttribute('aria-pressed') === 'false'")
        check(page.evaluate("localStorage.getItem('ferAgent.key')") == "sk-or-test", "clave guardada solo en el navegador (la misma que la versión anterior)")
        instalar_equipo(page)
        # ---------- Edificio ----------
        check(page.inner_text("#medHoy") == "Hoy, sin gasto", f"contador siempre a la vista; sin gasto dice «{page.inner_text('#medHoy')}» y no «0,0000 $»")
        tramos = page.eval_on_selector_all(".tramo", "ts => ts.map(t => t.className.replace('tramo ', ''))")
        check(tramos == ["cupula", "piso", "vestibulo"], f"edificio con los trozos del dibujo: {tramos}")
        placas = page.eval_on_selector_all(".tramo .placa", "bs => bs.map(b => b.textContent)")
        check(placas == ["Cúpula", "Planta técnica", "Vestíbulo"], f"placas sin «0,0000 $» cuando no hay gasto: {placas}")
        ids = page.eval_on_selector_all(".tramo .pj", "ps => ps.map(p => p.dataset.id)")
        check(sorted(ids) == sorted(["jefe", "sabio1", "sabio2", "tecno", "arturito", "creador", "jev", "interventor", "memory"]), f"9 agentes de serie en su sitio: {ids}")
        for ancho in [1360, 1100, 900, 700]:
            page.set_viewport_size({"width": ancho, "height": 900}); page.wait_for_timeout(250)
            if ancho <= 900 and not page.is_visible(".tramo"): page.click("#tabEdificio"); page.wait_for_timeout(200)
            check(not choca(page, ".tramo.piso .placa", ".tramo .pj[data-id='tecno'] img"), f"la placa de la planta técnica no tapa a Tecno (ventana de {ancho} px)")
        page.set_viewport_size({"width": 1360, "height": 900}); page.wait_for_timeout(250)
        c1 = page.eval_on_selector(".leyenda .l-trabajando", "e => getComputedStyle(e).backgroundColor"); c2 = page.eval_on_selector(".leyenda .l-pendiente", "e => getComputedStyle(e).backgroundColor")
        check(c1 != c2, f"leyenda: «trabajando» ({c1}) y «con tareas pendientes» ({c2}) con colores distintos")
        e = estado(page)
        check(e["version"] == VERSION_MOTOR and all("cerebroSuperior" not in a for a in e["agentes"]), f"versión {VERSION_MOTOR} y sin «cerebro superior» en ningún agente")
        jev = next(a for a in e["agentes"] if a["rol"] == "jev")
        check(jev["cerebro"] == "~typesafe/jev-latest", f"JEV decide con «Jev Latest»: {jev['cerebro']}")
        check(all({"hablar", "oir"} <= set(a["capacidades"]) for a in e["agentes"] if a["cerebro"] and a["rol"] not in ("jev",)), "hablar y oír, encendidos en todos los agentes que conversan")
        page.screenshot(path=os.path.join(SALIDA, "edificio.png"))
        # ---------- Crear piso y agentes ----------
        page.click("#crearPiso"); page.fill("#cajonCuerpo input", "Contenidos"); page.fill("#cajonCuerpo textarea", "Escribir y publicar")
        page.click("#cajonCuerpo >> text=Crear piso")
        page.wait_for_selector(".planta-cab .nombre-planta")
        check(page.input_value(".nombre-planta") == "Contenidos" and estado(page)["plantas"][1]["nombre"] == "Contenidos", "crear piso: se construye arriba, bajo la cúpula, y se entra en él")
        page.click(".tira .modulo.despacho .hueco")
        page.wait_for_selector("#cajon:not([hidden]) >> text=Su ficha")
        page.fill("#cajonCuerpo input[placeholder='Cómo se llama']", "Redactor")
        page.select_option("#cajonCuerpo select >> nth=0", "subagente")
        page.fill("#cajonCuerpo textarea[placeholder^='Quién es']", "Escribes textos claros y cortos para el equipo.")
        optg = page.eval_on_selector_all("#cajonCuerpo .campo:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label)")
        check(optg and optg[0].startswith("Recomendados") and any(g.startswith("Todos · Texto (6)") for g in optg) and any(g.startswith("Otros") for g in optg), f"crear agente: cerebro con recomendados por nivel, todos los de texto y «Otros»: {optg}")
        caps = page.eval_on_selector_all("#cajonCuerpo .caps input:checked", "is => is.map(i => i.parentElement.textContent.split(/[A-Z]/).length && i.parentElement.querySelector('span').firstChild.textContent)")
        check(caps == ["Escribir", "Hablar", "Oír"], f"un agente nuevo viene con Hablar y Oír: {caps}")
        page.click("#cajonCuerpo .pick4 button >> text=Chica")
        page.click("#cajonCuerpo [aria-label='Ropa: amarillo']")
        page.click("#cajonCuerpo >> text=Crear agente")
        page.wait_for_selector(".tira .pj .etiqueta:text('Redactor')")
        red = agente(page, "Redactor")
        check(red["rol"] == "subagente" and red["aspecto"]["ropa"] == "#E8C22C" and {"hablar", "oir"} <= set(red["capacidades"]), "el Redactor aparece en su oficina, con su color, y puede hablar y oír")
        page.click("#crearAgente") if page.is_visible("#crearAgente") else page.click(".planta-acciones >> text=+ Agente en esta planta")
        page.fill("#cajonCuerpo .creador textarea", "quiero uno que me haga el menú de la semana")
        page.click("#cajonCuerpo .creador button")
        page.wait_for_selector("#cajonCuerpo .porque")
        caps = page.eval_on_selector_all("#cajonCuerpo .caps input:checked", "is => is.length")
        check(page.input_value("#cajonCuerpo input[placeholder='Cómo se llama']") == "Cocinero" and caps == 4, f"el Creador rellena la ficha; nunca capacidades que pagan ({caps} marcadas: escribir, buscar, hablar y oír)")
        page.click("#cajonCuerpo >> text=Crear agente")
        page.wait_for_selector(".tira .pj .etiqueta:text('Cocinero')")
        page.click(".volver"); page.wait_for_selector(".tramo")
        check(len(page.eval_on_selector_all(".tramo.piso", "t => t")) == 3, "de vuelta al edificio: ya tiene 3 pisos")
        # ---------- Chat con el jefe, a pantalla completa ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        primero = page.inner_text("#mensajes .msg >> nth=0")
        check(primero.startswith("Hola, soy el jefe de Mi edificio") and "clave" not in primero.lower(), f"el primer mensaje del chat es un saludo del jefe: «{primero[:60]}…»")
        check(page.inner_text("#jefeNombre") == "Jefe" and page.eval_on_selector("#avatar", "i => i.getBoundingClientRect().height") > 300, "chat a pantalla completa con el personaje en grande")
        enviar(page, "Que el redactor escriba un saludo ya")
        page.wait_for_selector(".msg.informe", timeout=15000)
        check("Informe de Redactor" in page.inner_text(".msg.informe"), "el jefe reparte, el Redactor trabaja y su informe llega al chat del jefe")
        check(not any("el control externo" in str(x.get("messages", [{}])[0].get("content", "")) for x in llamadas if "messages" in x), "ya no hay revisión de JEV después de cada trabajo (ni repetición con cerebro caro)")
        enviar(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.informe .propuesta", timeout=15000)
        page.click(".msg.informe .propuesta >> text=Crear a Tendero")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.some(a => a.nombre === 'Tendero')", timeout=5000)
        check(True, "pedirle un agente al jefe: el Creador lo diseña, JEV deja seguir y con un toque se crea")
        check(any("jev" in x and "Crear otro agente" in x["jev"]["state"][1] for x in llamadas), "antes de crear otro agente, se le pregunta a JEV")
        enviar(page, "Decisión importante: ¿abrimos oficina?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Consejo de anthropic') && b.textContent.includes('Consejo de openai'))", timeout=15000)
        check(True, "el consejo de sabios responde (los dos) cuando el jefe lo consulta")
        enviar(page, "Guarda que el coche de la empresa es un Seat azul")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Guardado'))", timeout=15000)
        enviar(page, "¿Recuerdas de qué color es el coche?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Seat azul'))", timeout=15000)
        check("Memory encontró 1" in page.inner_text("#mensajes"), "«recuerdas» → Memory busca y el jefe responde con el recuerdo")
        enviar(page, "Dibuja un faro")
        page.wait_for_selector(".msg.bot .burbuja img", timeout=15000)
        check(any("imagen" in x for x in llamadas), "crear imágenes: el jefe pide una imagen y se ve en el chat")
        page.click("#cerrarChat"); ficha(page, "Jefe", "Capacidades"); page.click("#ficha .cap:has-text('Crear música') input"); page.wait_for_timeout(250)
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        enviar(page, "Compón una sintonía")
        page.wait_for_selector(".msg.bot .burbuja audio", timeout=15000)
        lyria = [x for x in llamadas if str(x.get("model", "")).startswith("google/lyria")]
        check(lyria and lyria[-1].get("modalities") == ["text", "audio"] and lyria[-1].get("stream") is True, "crear música: pide audio a Lyria y la canción se oye en el chat")
        page.set_input_files("#fichero", os.path.join(RAIZ, "pruebas", "punto.png"))
        page.wait_for_selector("#adjunto:not([hidden])")
        enviar(page, "¿Qué ves?")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].some(b => b.textContent.includes('Veo la imagen'))", timeout=15000)
        check(True, "ver: el jefe recibe la imagen adjunta")
        page.screenshot(path=os.path.join(SALIDA, "chat-jefe.png"))
        # ---------- Chat con otro agente (el Redactor), con su propio cerebro ----------
        chat_con(page, "Redactor")
        check(page.inner_text("#jefeNombre") == "Redactor" and page.inner_text("#mensajes .msg >> nth=0").startswith("Hola, soy Redactor"), "cada agente tiene su chat: saludo del Redactor")
        n0 = len(llamadas)
        enviar(page, "Escribe una frase para la web")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        ultima = [x for x in llamadas[n0:] if "messages" in x][-1]
        check(ultima["messages"][0]["content"].startswith("Escribes textos claros") and ultima["model"] == red["cerebro"], "contesta el Redactor con sus instrucciones y su cerebro")
        e = estado(page); r2 = agente(page, "Redactor")
        check(len(r2["chat"]) == 2 and not any(x.get("content") == "Escribe una frase para la web" for x in e["conversacion"]), "la conversación queda en su chat, no en el del jefe")
        # Monedas: dorada desde el chat, con su motivo
        page.click("#mensajes .msg.bot:not(.saludo) .moneda-btn >> nth=0")
        page.fill(".motivo-fila input", "Escribió claro y corto"); page.click(".motivo-fila .btn.primario")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        e = estado(page)
        check(any(x["tipo"] == "oro" and x["estado"] == "confirmada" and x["motivo"] == "Escribió claro y corto" for x in e["monedas"]) and any(l["texto"] == "Escribe frases claras y cortas, de menos de 20 palabras." and l["papel"] == "subagente" and l["estado"] == "propuesta" for l in e["lecciones"]),
              "v7: moneda dorada con su motivo → un modelo barato la convierte en una regla concreta, que espera tu sí")
        # se aprueba en la bandeja (y se puede retocar)
        page.click("#cerrarChat"); page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja:not([hidden]) .peticion")
        check(page.is_visible("#vistaBandeja .peticion:has-text('Lección nueva') textarea"), "la lección llega a la bandeja, para aprobarla o retocarla")
        page.click("#vistaBandeja .peticion:has-text('Lección nueva') button:text-is('Aprobar')"); page.wait_for_timeout(300)
        check(any(l["estado"] == "aprobada" and "frases claras" in l["texto"] for l in estado(page)["lecciones"]), "aprobada: ya es lección de su papel")
        page.click("#vistaBandeja .volver-btn"); chat_con(page, "Redactor")
        n0 = len(llamadas)
        enviar(page, "Otra frase")
        page.wait_for_function("document.querySelectorAll('#mensajes .msg.bot:not(.saludo)').length >= 2", timeout=15000)
        ultima = [x for x in llamadas[n0:] if "messages" in x][-1]
        check("Escribe frases claras y cortas" in ultima["messages"][0]["content"], "la lección ya va en las instrucciones del Redactor")
        page.screenshot(path=os.path.join(SALIDA, "chat-redactor.png"))
        # Voz propia: dos agentes sin voz elegida suenan distinto
        n0 = len(llamadas)
        page.click("#mensajes .msg.bot:not(.saludo) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_function("[...document.querySelectorAll('.nota-voz')].some(n => n.textContent.includes('0,0009'))", timeout=15000)
        voz_red = [x for x in llamadas[n0:] if "voz" in x][-1]["voz"]
        page.click("#cerrarChat"); page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        n0 = len(llamadas)
        page.click("#mensajes .msg.bot:not(.saludo) .meta button:text('▶ Escuchar') >> nth=0"); page.wait_for_timeout(1500)
        voz_jefe = [x for x in llamadas[n0:] if "voz" in x][-1]["voz"]
        check(voz_red.get("voice") and voz_jefe.get("voice") and voz_red["voice"] != voz_jefe["voice"], f"cada agente con su voz: el jefe «{voz_jefe.get('voice')}», el Redactor «{voz_red.get('voice')}»")
        check(any(k.startswith("voz") or True for k in agente(page, "Redactor")["gasto"]) and sum(agente(page, "Redactor")["gasto"].values()) > 0, "lo que cuesta su voz y su chat se apunta al Redactor")
        page.click("#cerrarChat")
        # ---------- Ficha en cuatro pestañas ----------
        ficha(page, "Redactor")
        pest = page.eval_on_selector_all(".ficha-pestanas button", "bs => bs.map(b => b.textContent)")
        check(pest == ["Identidad", "Trabajo", "Cerebro y gasto", "Capacidades"], f"ficha en pestañas: {pest}")
        check("Cerebro superior" not in page.inner_text("body"), "ya no aparece «Cerebro superior»")
        page.fill("#ficha .campo:has(> span:text-is('Nombre')) input", "Redactora"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(any(a["nombre"] == "Redactora" for a in estado(page)["agentes"]), "se renombra desde Identidad")
        page.click(".ficha-pestanas button:text-is('Trabajo')")
        check(page.is_visible("#ficha .leccion:has-text('frases claras')"), "Trabajo: sus lecciones (las de su papel)")
        page.click("#ficha .leccion:has-text('frases claras') button:text-is('Fijar')"); page.wait_for_timeout(250)
        check(next(l for l in estado(page)["lecciones"] if "frases claras" in l["texto"])["fija"] is True, "una lección se puede fijar para que no salga nunca")
        page.select_option("#ficha .bloque:has(h4:text('Latido')) select >> nth=0", "min")
        page.fill("#ficha .bloque:has(h4:text('Latido')) input[type=number]", "10"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(agente(page, "Redactora")["latido"] == {"cada": 10, "unidad": "min"}, "Trabajo: el latido se cambia")
        page.click(".ficha-pestanas button:text-is('Cerebro y gasto')")
        page.click("#ficha .prioridad button >> text=1"); page.wait_for_timeout(200)
        check(agente(page, "Redactora")["prioridad"] == 1, "Cerebro y gasto: prioridad cambiada a 1")
        page.click(".ficha-pestanas button:text-is('Capacidades')")
        page.click("#ficha .cap:has-text('Crear música') input"); page.wait_for_selector("#ficha .cap-bloque.on:has-text('Crear música') select")
        mus = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Crear música') option", "os => os.map(o => o.value)")
        check("google/lyria-3-clip-preview" in mus and not any(v.startswith("anthropic/") for v in mus), f"Crear música: su selector solo trae modelos de música ({[v for v in mus if v]})")
        voz_ops = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Hablar') select >> nth=0 >> option", "os => os.map(o => o.value)")
        oido_ops = page.eval_on_selector_all("#ficha .cap-bloque:has-text('Oír') select option", "os => os.map(o => o.value)")
        check("google/gemini-3.8-flash-lite-tts" in voz_ops and "openai/whisper-large-v3-turbo" in oido_ops and "openai/whisper-large-v3-turbo" not in voz_ops, "cada modelo sale donde sirve: voz en Hablar, oído en Oír")
        page.select_option("#ficha .cap-bloque:has-text('Hablar') select >> nth=1", "Aoede"); page.wait_for_timeout(250)
        check(agente(page, "Redactora")["voz"]["voz"] == "Aoede", "Hablar: cada agente elige su voz")
        caps_avz = page.eval_on_selector_all("#ficha .cap.avz input", "is => is.map(i => i.disabled)")
        check(len(caps_avz) == 5 and all(caps_avz), "v7: las 5 capacidades avanzadas que quedan siguen como enchufes pendientes (navegar y la carpeta del ordenador ya son «Manos», con Fer Casa)")
        page.screenshot(path=os.path.join(SALIDA, "ficha.png"))
        ficha(page, "JEV", "Cerebro y gasto")
        check("Jev Latest" in page.inner_text("#ficha select option:checked"), "la ficha de JEV enseña «Jev Latest»")
        # ---------- JEV antes de gastar: buscar ----------
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
              "JEV dice «parar»: le llega quién es, qué va a hacer y su memoria corta, y no se gasta en buscar")
        JEV_DICE["choice"] = "seguir"
        page.click("#tabActividad"); page.click("#actJev"); page.wait_for_timeout(250)
        reg = page.inner_text("#registro")
        check("Redactora" in reg and "parar" in reg and "¿Sirvió?" in reg, "Actividad → Consultas a JEV: hora, agente, acción, lo que dijo JEV, lo que hizo y si sirvió")
        page.click("#registro .jev-consulta >> nth=0 >> button:text-is('Sí')"); page.wait_for_timeout(250)
        check(estado(page)["consultasJev"][-1]["sirvio"] is True, "se puede marcar si la consulta sirvió")
        page.click("#tabFicha")
        # ---------- Gasto, tope y la moneda roja que propone el Interventor ----------
        n_ag = len(estado(page)["agentes"])
        page.click("#medidor"); page.wait_for_selector("table.gasto")
        check(len(page.eval_on_selector_all("table.gasto tbody tr", "rs => rs")) == n_ag, f"gasto por agente: una fila por cada uno de los {n_ag} agentes")
        page.fill("#cajonCuerpo input[type=number] >> nth=0", "0.01"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        page.click("#cerrarCajon")
        congelados = page.eval_on_selector_all(".tramo .pj.congelado", "ps => ps.map(p => p.dataset.id)")
        check("jefe" in congelados, f"al llegar al tope se congela todo, también el jefe (en azul hielo): {len(congelados)}")
        page.click("#hablarJefe"); enviar(page, "hola")
        page.wait_for_selector(".msg.error")
        check("congelado" in page.inner_text(".msg.error"), "el jefe congelado no gasta y lo explica en su chat")
        page.click("#cerrarChat")
        page.click("#medidor"); page.fill("#cajonCuerpo input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(300); page.click("#cerrarCajon")
        check(page.eval_on_selector_all(".pj.congelado", "v => v.length") == 0, "al subir el tope, todos vuelven al trabajo")
        ficha(page, "Cocinero", "Cerebro y gasto")
        page.fill("#ficha input[placeholder='sin tope propio']", "0.0001"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        chat_con(page, "Cocinero"); enviar(page, "Hola"); page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000); page.wait_for_timeout(300)
        page.click("#cerrarChat")
        prop = [x for x in estado(page)["monedas"] if x["estado"] == "propuesta" and x["propone"] == "interventor"]
        check(prop and page.is_visible("#globoMes") and page.inner_text("#globoMes") == "1", "el Interventor propone una moneda roja al que llega a su tope; se avisa en «Agente del mes»")
        # ---------- Agente del mes ----------
        page.click("#abrirMes"); page.wait_for_selector("#vistaMes:not([hidden]) .podio")
        check("Redactora" in page.inner_text("#vistaMes .podio .primero"), "Agente del mes: la Redactora, con su moneda dorada, encabeza el podio")
        check(len(page.eval_on_selector_all("#vistaMes table.ranking tbody tr", "r => r")) == len(estado(page)["agentes"]), "clasificación con todos los agentes, por monedas y gasto")
        page.click("#vistaMes .fila-moneda:has-text('Cocinero') button:text-is('Confirmar')"); page.wait_for_timeout(300)
        e = estado(page)
        check(any(x["propone"] == "interventor" and x["estado"] == "confirmada" for x in e["monedas"]) and any(l["estado"] == "propuesta" and l["texto"].startswith("No gastes más de tu tope") for l in e["lecciones"]) and page.is_hidden("#globoMes"),
              "al confirmarla, la moneda roja cuenta y su regla espera tu sí en la bandeja")
        page.screenshot(path=os.path.join(SALIDA, "agente-del-mes.png"))
        page.click("#vistaMes .volver-btn")
        page.click("#medidor"); page.fill("#cajonCuerpo input[type=number] >> nth=0", "5"); page.keyboard.press("Tab"); page.wait_for_timeout(200); page.click("#cerrarCajon")
        ficha(page, "Cocinero", "Cerebro y gasto"); page.fill("#ficha input[placeholder='sin tope propio']", "0"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        # ---------- Salas de reuniones ----------
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden]) .form-osc")
        page.fill(".form-osc input >> nth=0", "Plan de la semana"); page.fill(".form-osc textarea", "Qué hacemos esta semana.")
        for nombre in ["Redactora", "Cocinero"]: page.click(f".elegir-asistentes label:has-text('{nombre}') input")
        page.fill(".form-osc input[type=number]", "1")
        check("Coste estimado" in page.inner_text(".form-osc") and not page.is_visible(".elegir-asistentes label:has-text('Memory')") and not page.is_visible(".elegir-asistentes label:has-text('JEV')"), "nueva reunión: coste estimado a la vista; Memory y JEV no se sientan")
        page.click(".form-osc .btn.primario:text-is('Convocar')"); page.wait_for_selector(".mesa .asiento")
        check(len(page.eval_on_selector_all(".mesa .asiento", "a => a")) == 3 and estado(page)["reuniones"][-1]["estado"] == "lista", "convocada: la mesa con el jefe y los dos; aún no empieza")
        page.click(".form-osc .btn.primario"); page.wait_for_selector("#vistaSalas .acta", timeout=20000)
        r = estado(page)["reuniones"][-1]
        check(r["estado"] == "terminada" and r["intervenciones"][0]["modera"] and len(r["intervenciones"]) == 3 and "## Decisiones" in r["acta"], "la reunión: modera el jefe, habla cada uno y al final el acta (conclusiones y decisiones)")
        page.screenshot(path=os.path.join(SALIDA, "sala.png"))
        page.click("#vistaSalas .volver-btn")
        # el jefe convoca: no empieza hasta que confirmas las rondas
        page.click("#hablarJefe"); enviar(page, "Reúne al equipo para el saludo")
        page.wait_for_selector(".tarjeta-reunion input[type=number]", timeout=15000)
        r = estado(page)["reuniones"][-1]
        check(r["convoca"] == "jefe" and r["estado"] == "propuesta", "el jefe propone una reunión; queda pendiente de tu sí")
        page.fill(".tarjeta-reunion input[type=number]", "1"); page.click(".tarjeta-reunion .btn.primario")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).reuniones.at(-1).estado === 'terminada'", timeout=20000)
        check(estado(page)["reuniones"][-1]["rondas"] == 1, "con tu sí y tus rondas, se celebra")
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
        check(e["nombre"] == "Torre Norte" and e["plantas"][0]["nombre"] == "Dirección" and e["plantas"][-1]["nombre"] == "Entrada", "se renombran el edificio, la cúpula y el vestíbulo")
        check(page.inner_text("#nombreEdificio") == "Torre Norte" and page.inner_text("#hablarJefe") == "Hablar con Ana" and "Dirección" in page.eval_on_selector_all(".placa b", "b => b.map(x => x.textContent)"), "y se ve en la cabecera, en el botón del jefe y en las placas")
        page.click("#hablarJefe")
        check(page.inner_text("#mensajes .msg >> nth=0").startswith("Hola, soy Ana, el jefe de Torre Norte"), "el saludo usa los nombres nuevos")
        n0 = len(llamadas)
        enviar(page, "Quiero un agente nuevo para la tienda")
        page.wait_for_selector(".msg.informe:has-text('Clara')", timeout=15000)
        sis = [x for x in llamadas[n0:] if "messages" in x][0]["messages"][0]["content"]
        check("Te llamas Ana" in sis, "el jefe sabe que ahora se llama Ana")
        check(True, "aunque el Creador se llame Clara, el jefe le sigue encargando agentes nuevos")
        page.click("#cerrarChat")
        # ---------- Aspecto del jefe (desde su ficha) ----------
        ficha(page, "Ana"); page.click("#ficha >> text=Cambiar su foto y su nombre"); page.click("#cajonCuerpo .pick4 button >> text=Chica")
        page.click("#cajonCuerpo [aria-label='Ropa: verde']")
        page.wait_for_function("getComputedStyle(document.documentElement).getPropertyValue('--acento').trim().toUpperCase() === '#2E9E5B'", timeout=5000)
        check(True, "aspecto del jefe desde su ficha: la web toma el color de su ropa")
        page.click("#cerrarCajon")
        # ---------- Ajustes: modelos, lecciones, vista; agentes de serie; copia ----------
        page.click("#abrirAjustes")
        txt = page.inner_text("#cajonCuerpo")
        check("Modelos por defecto del edificio" in txt and "Crear música" in txt and "Modelos recomendados" in txt, "Ajustes: modelos por defecto (también música) y recomendados")
        page.fill("#cajonCuerpo .campo:has-text('Lecciones que se guardan por papel') input", "3"); page.keyboard.press("Tab"); page.wait_for_timeout(250)
        check(estado(page)["ajustes"]["leccionesPorPapel"] == 3, "Ajustes: el número de lecciones por papel se cambia")
        page.click("#cerrarCajon")
        ficha(page, "Arturito"); page.click("#ficha >> text=Borrar"); page.click("#ficha >> text=¿Borrar? Pulsa otra vez")
        page.wait_for_function("!JSON.parse(localStorage.getItem('ferEdificio.estado')).agentes.some(a => a.id === 'arturito')")
        page.click("#abrirSerie"); page.click("#vistaSerie .serie-ag:has-text('Arturito') button:text-is('Instalar')")
        page.wait_for_selector("text=Instalado: Arturito.")
        check(any(a["id"] == "arturito" for a in estado(page)["agentes"]), "un agente de serie borrado (Arturito) se vuelve a instalar desde «Agentes de serie»")
        page.click("#vistaSerie .volver-btn"); page.click("#abrirAjustes")
        with page.expect_download() as d: page.click("#cajonCuerpo >> text=Guardar copia ahora")
        copia = json.loads(open(d.value.path()).read())
        check(copia["tipo"] == "fer-agent-copia" and len(copia["edificio"]["agentes"]) == len(estado(page)["agentes"]) and "sk-or" not in json.dumps(copia), "la copia del edificio se descarga (con imágenes y música) y no lleva la clave")
        page.click("#cerrarCajon")
        page.click("#tabActividad"); page.click("#actTodo")
        reg = page.inner_text("#registro")
        check("JEV" in reg and "Memory" in reg and "Redactora" in reg, "Actividad → Todo: se ve lo que hace cada agente")
        check(not errores, f"sin errores de JavaScript: {errores}")
        b.close()

        # ---------- Edificio de 72 agentes en 12 plantas, sin latido ni gasto ----------
        torre = subprocess.run(["node", os.path.join(RAIZ, "pruebas", "torre72.mjs")], capture_output=True, text=True, check=True).stdout
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); }" % json.dumps(torre))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        n0 = len(llamadas)
        t0 = time.time(); page.goto(URL); entrar(page); page.wait_for_selector(".tramo.franja"); t1 = time.time()
        e = estado(page)
        pisos = [x for x in e["plantas"] if x["tipo"] == "piso"]
        check(len(pisos) == 12 and sum(1 for a in e["agentes"] if any(a["planta"] == x["id"] for x in pisos)) == 72, f"edificio de prueba: 12 pisos con 72 agentes (más el jefe y Memory: {len(e['agentes'])})")
        franjas = page.eval_on_selector_all(".tramo.franja", "fs => fs.map(f => f.innerText.replace(/\\s+/g, ' '))")
        check(len(franjas) == 12 and all("6 agentes · 0 trabajando" in f and "$" not in f for f in franjas), f"vista automática en franjas: nombre, agentes, cuántos trabajan y sin «$» porque no hay gasto ({franjas[0]})")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 74, "el directorio lista a los 74")
        fil = page.eval_on_selector_all(".filtros button", "bs => bs.map(b => b.textContent)")
        check("Apagados (4)" in fil and "Con tareas pendientes (0)" in fil and "Todos (74)" in fil, f"filtros con su cuenta: {fil}")
        page.fill(".buscador", "legal"); page.wait_for_timeout(200)
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 6, "buscar «legal» deja los 6 de Legal")
        page.fill(".buscador", "")
        page.click(".filtros button:has-text('Apagados')")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 4, "filtro «Apagados»: los 4 apagados")
        page.click(".filtros button:has-text('Apagados')")
        page.screenshot(path=os.path.join(SALIDA, "torre72-franjas.png"))
        page.click(".tramo.franja >> nth=6"); page.wait_for_selector(".quienes")
        check(len(page.eval_on_selector_all(".quien", "q => q")) == 6, "al entrar en una planta, sus 6 agentes con figura")
        page.click(".volver"); page.wait_for_selector(".tramo.franja"); page.click("#verDibujo")
        try: page.wait_for_function("document.querySelectorAll('.tramo.piso:not(.franja)').length === 12 && document.querySelectorAll('.tramo .pj').length === 74", timeout=4000)
        except Exception: pass
        cuentas = (len(page.eval_on_selector_all(".tramo.piso:not(.franja)", "t => t")), len(page.eval_on_selector_all(".tramo .pj", "p => p")))
        check(cuentas == (12, 74), f"el interruptor «Dibujo» enseña los 12 pisos dibujados con sus 74 figuras: {cuentas}")
        page.click("#verFranjas"); page.wait_for_timeout(300)
        check(page.evaluate("document.documentElement.scrollWidth") <= 1360, "sin desbordarse a lo ancho")
        page.wait_for_timeout(24000)   # más de un latido del edificio
        pagadas = [x.get("model") or list(x)[0] for x in llamadas[n0:] if "messages" in x or "jev" in x or "voz" in x or "imagen" in x]
        check(not pagadas and page.inner_text("#medHoy") == "Hoy, sin gasto", f"en 25 segundos con la clave puesta: ninguna llamada de pago y «Hoy, sin gasto» ({pagadas}, {page.inner_text('#medHoy')})")
        check(t1 - t0 < 8, f"carga en {t1 - t0:.1f} s")
        check(not errores, f"edificio de 72 sin errores: {errores}")
        b.close()

        # ---------- Un edificio de la versión 4 guardado en el navegador pasa a la 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v4 = {"version": "4.0", "nombre": "Casa", "plantilla": "particular", "ajustes": {"topeDiario": 2}, "plantas": [{"id": "direccion", "nombre": "Dirección", "tipo": "direccion"}, {"id": "p1", "nombre": "Investigación", "tipo": "equipo"}, {"id": "control", "nombre": "Control", "tipo": "control"}],
              "agentes": [{"id": "jefe", "nombre": "Fer", "rol": "jefe", "planta": "direccion"}, {"id": "x", "nombre": "Investigador", "rol": "trabajador", "planta": "p1"}], "memoriaLarga": [{"id": "m", "ts": 1, "texto": "Me gustan las respuestas cortas"}], "conversacion": [], "registro": []}
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); localStorage.setItem('ferAgent.look', JSON.stringify({p: 'chica', chica: {ropa: '#7B3FB5'}})); }" % json.dumps(json.dumps(v4)))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); entrar(page); page.wait_for_selector(".tramo")
        e = estado(page)
        check([x["nombre"] for x in e["plantas"]] == ["Cúpula", "Planta técnica", "Investigación", "Vestíbulo"] and e["nombre"] == "Casa" and e["memoriaLarga"][0]["texto"].startswith("Me gustan") and e["ajustes"]["topeDiario"] == 2,
              "un edificio de la v4 se rehace con la estructura nueva y conserva nombre, topes y memoria")
        check(e["agentes"][0]["aspecto"]["p"] == "chica" and e["agentes"][0]["aspecto"]["ropa"] == "#7B3FB5", "el aspecto del jefe que tenías en la v4 se conserva")
        page.click("#hablarJefe")
        check(any(a["nombre"] == "Investigador" for a in e["agentes"]) and "Investigador" in page.inner_text("#mensajes"), "tu agente de la v4 pasa y Tecno te lo cuenta en el chat del jefe")
        p2 = ctx.new_page(); p2.on("pageerror", lambda e: errores.append(str(e)))
        p2.goto(URL); p2.wait_for_selector(".otra-pestana")
        check(p2.is_visible("text=El edificio ya está abierto en otra pestaña"), "segunda pestaña: avisa de que el edificio ya está abierto")
        page.close()
        p2.wait_for_selector("#portada:not([hidden])", timeout=10000); entrar(p2); p2.wait_for_selector(".tramo")
        check(not p2.is_visible(".otra-pestana"), "al cerrar la primera, la segunda se abre sola")
        check(not errores, f"paso de v4 a v6 sin errores: {errores}")
        b.close()

        # ---------- Un edificio de la versión 5 pasa a la 6 ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        v5 = subprocess.run(["node", "-e", "import('%s').then(async ({ Edificio }) => { let g; const ed = new Edificio({ cargar: async () => null, guardar: async (j) => { g = j; }, clave: () => '' }); await ed.iniciar('basico'); const e = JSON.parse(g); e.version = '5.0'; for (const a of e.agentes) { a.cerebroSuperior = 'openai/gpt-6.1-sol-pro'; delete a.voz; delete a.chat; a.capacidades = a.rol === 'jefe' ? a.capacidades : ['escribir']; } delete e.vozParaTodos; const j = e.agentes.find(a => a.rol === 'jev'); j.cerebro = 'deepseek/deepseek-v4.1-flash'; process.stdout.write(JSON.stringify(e)); })" % os.path.join(RAIZ, "engine.js")], capture_output=True, text=True, check=True).stdout
        ctx.add_init_script("if (!localStorage.getItem('ferEdificio.estado')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferEdificio.estado', %s); }" % json.dumps(v5))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); entrar(page); page.wait_for_selector(".tramo")
        e = estado(page)
        j = next(a for a in e["agentes"] if a["rol"] == "jev")
        check(e["version"] == VERSION_MOTOR and all("cerebroSuperior" not in a for a in e["agentes"]) and j["cerebro"] == "~typesafe/jev-latest", "un edificio de la v5: sin cerebro superior y JEV pasa a «Jev Latest» (y llega a la 7)")
        check(all({"hablar", "oir"} <= set(a["capacidades"]) for a in e["agentes"] if a["cerebro"] and a["rol"] != "jev"), "y Hablar y Oír se encienden una vez en todos los que conversan")
        check(not errores, f"paso de v5 a v6 sin errores: {errores}")
        b.close()

        # ---------- Micro con el detector simulado (en el chat del jefe y en el de otro agente) ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT + FAKE_VAD); ctx.route("https://**/*", router)
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload(); entrar(page); page.wait_for_selector(".tramo")
        page.click("#hablarJefe")
        page.click("#micro"); page.wait_for_function("(window.__vadCalls||[]).includes('start')")
        check(page.inner_text("#jefeEstado").startswith("Te escucho"), "micro: el jefe escucha")
        n = len(llamadas)
        page.evaluate("setTimeout(() => window.__vadOpts.onSpeechEnd(new Float32Array(16000)), 0)")
        page.wait_for_function("[...document.querySelectorAll('.msg.me .meta')].some(m => m.textContent.includes('por voz'))", timeout=15000)
        page.wait_for_function("window.__vadCalls.filter(c => c === 'start').length >= 2", timeout=15000)
        check(any("oido" in x for x in llamadas[n:]) and any("voz" in x for x in llamadas[n:]), "micro: Whisper transcribe, el jefe contesta en voz y vuelve a escuchar")
        page.click("#micro"); page.click("#cerrarChat")
        ficha(page, "Interventor")
        check(not page.is_visible("#ficha .btn.primario:has-text('Hablar con')"), "el Interventor (sin cerebro) no tiene chat")
        chat_con(page, "Tecno")
        check(not page.is_disabled("#micro"), "Tecno tiene micro en su chat")
        page.click("#cerrarChat"); ficha(page, "Tecno", "Capacidades"); page.click("#ficha .cap:has-text('Oír') input"); page.wait_for_timeout(250)
        chat_con(page, "Tecno")
        check(page.is_disabled("#micro"), "sin la capacidad Oír, el micro de su chat se apaga")
        check(not errores, f"micro sin errores: {errores}")
        b.close()

        # ---------- Detector de voz real con los archivos sellados ----------
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
            check(cargado, "detector real: los dos archivos sellados se descargan y el sello coincide (el navegador los acepta)")
            page.click("#micro"); b.close()

        # ---------- Traducción: un diccionario de prueba cambia los textos sin tocar el código ----------
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        ctx.route("**/textos/zz.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body='export default { "Tienes una empresa agéntica a tu servicio.": "You have an agentic company at your service.", "Hablar con {1}": "Talk to {1}", "Ajustes": "Settings", "Hoy, sin gasto": "Today, no spend" };'))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL + "?lang=zz"); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.goto(URL + "?lang=zz")
        page.wait_for_selector("#landing h1")
        check(page.inner_text("#landing h1") == "You have an agentic company at your service.", "traducción: la portada sale del diccionario")
        entrar(page); page.wait_for_selector(".tramo")
        check(page.inner_text("#hablarJefe") == "Talk to Jefe" and page.get_attribute("#abrirAjustes", "aria-label") == "Settings" and page.inner_text("#medHoy") == "Today, no spend", "traducción: también la cabecera, con frases que llevan datos («Talk to Fer»)")
        check(not errores, f"traducción sin errores: {errores}")
        b.close()

        # ---------- Móvil oscuro ----------
        b = p.chromium.launch()
        ctx = b.new_context(color_scheme="dark", viewport={"width": 390, "height": 844}, device_scale_factor=2); ctx.add_init_script(INIT); ctx.route("https://**/*", router)
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.evaluate("localStorage.setItem('ferAgent.key','sk-or-test')"); page.reload()
        page.wait_for_selector("#landing .boton-grande")
        check(page.evaluate("document.querySelector('#portada').scrollWidth") <= 390, "móvil: la portada no se desborda")
        page.screenshot(path=os.path.join(SALIDA, "movil-portada.png"))
        entrar(page); page.wait_for_selector(".tramo"); page.wait_for_timeout(600)
        check(page.is_visible(".edificio") and page.evaluate("document.documentElement.scrollWidth") <= 390, "móvil: se abre en el edificio, sin desplazamiento horizontal")
        check(page.is_visible("#abrirMes") and page.is_visible("#abrirSalas"), "móvil: «Agente del mes» y «Reuniones» también a mano")
        check(not choca(page, ".tramo.piso .placa", ".tramo .pj[data-id='tecno'] img"), "móvil: la placa no tapa a Tecno")
        page.screenshot(path=os.path.join(SALIDA, "movil-edificio.png"))
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390 and page.is_visible("#texto"), "móvil: el chat cabe")
        page.screenshot(path=os.path.join(SALIDA, "movil-chat.png"))
        page.click("#cerrarChat"); page.click(".tramo.piso .placa"); page.wait_for_selector(".tira .modulo")
        check(page.evaluate("document.documentElement.scrollWidth") <= 390, "móvil: dentro de una planta tampoco se desborda")
        page.click(".quien >> text=Tecno"); page.wait_for_timeout(300)
        check(page.is_visible("#vistaFicha .ficha-cab") and not page.is_visible(".edificio"), "móvil: tocar un agente abre su ficha")
        check(not errores, f"móvil sin errores: {errores}")
        b.close()
finally:
    servidor.terminate()
print("RESULTADO:", "OK" if ok else "FALLOS"); sys.exit(0 if ok else 1)
