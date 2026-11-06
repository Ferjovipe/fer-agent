"""Prueba de Fer Casa: arranca un OpenRouter simulado y el programa real, y comprueba la API, el PIN,
la pasarela de voz, el latido y la web conectada. Uso: python3 pruebas/casa_test.py"""
import json, os, sys, subprocess, time, threading, tempfile, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.environ.get("SALIDA", os.path.join(RAIZ, "pruebas", "capturas"))
os.makedirs(SALIDA, exist_ok=True)
P_OR, P_CASA = 9911, 8791
MODELOS = {"data": [
  {"id": "anthropic/claude-sonnet-5.5", "name": "Claude Sonnet 5.5", "pricing": {"prompt": "0.000002", "completion": "0.00001"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 128000},
  {"id": "deepseek/deepseek-v4.1-flash", "name": "DeepSeek Flash", "pricing": {"prompt": "0.00000015", "completion": "0.0000006"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 128000}]}
recibido = []

class OR(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body, ctype="application/json", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        recibido.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELOS)
        if self.path.startswith("/api/v1/generation"): return self._resp(200, {"data": {"total_cost": 0.0007}})
        self._resp(404, {"error": {"message": "no"}})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        recibido.append(("POST", self.path, self.headers.get("Authorization")))
        if self.path == "/api/v1/chat/completions":
            b = json.loads(raw); sys0 = str(b["messages"][0]["content"])
            if "el control externo" in sys0: txt = '{"veredicto":"vale"}'
            elif sys0.startswith("Eres el jefe del edificio"): txt = "Hola desde Fer Casa."
            else: txt = "Trabajo hecho en casa."
            return self._resp(200, {"model": b["model"], "choices": [{"message": {"content": txt}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.0005}})
        if self.path == "/api/alpha/decisions":
            b = json.loads(raw)
            return self._resp(200, {"answers": {"decision": {"choice": "seguir", "probabilities": {"seguir": 0.8, "aprovechar": 0.1, "parar": 0.05, "preguntar_jefe": 0.05}, "confidence": 0.8}}, "usage": {"cost": 0.00001}})
        if self.path == "/api/v1/audio/speech":
            return self._resp(200, open(os.path.join(RAIZ, "pruebas", "tono.mp3"), "rb").read(), "audio/mpeg", {"X-Generation-Id": "gen-casa"})
        self._resp(404, {"error": {"message": "no"}})

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def pedir(ruta, metodo="GET", cuerpo=None, pin=None):
    req = urllib.request.Request(f"http://localhost:{P_CASA}{ruta}", method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers={"Content-Type": "application/json", **({"X-Fer-Pin": pin} if pin else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)

srv = ThreadingHTTPServer(("127.0.0.1", P_OR), OR); threading.Thread(target=srv.serve_forever, daemon=True).start()
datos = tempfile.mkdtemp(prefix="fercasa-")
env = dict(os.environ, OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", OPENROUTER_API_KEY="sk-or-casa", FER_PIN="24681357", FER_PUERTO=str(P_CASA), FER_DATOS=datos, FER_LATIDO_SEG="1", FER_PLANTILLA="basico")   # v8: sin esto, Fer Casa nace solo con el jefe
casa = subprocess.Popen(["node", os.path.join(RAIZ, "fer-casa.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
salida = []
threading.Thread(target=lambda: [salida.append(l) for l in casa.stdout], daemon=True).start()
try:
    for _ in range(50):
        if any("encendido" in l for l in salida): break
        time.sleep(0.2)
    check(any("encendido" in l for l in salida), "Fer Casa arranca y enseña sus direcciones")
    s, b, _ = pedir("/api/hola"); check(s == 200 and json.loads(b)["ferCasa"], "la web puede reconocer a Fer Casa")
    s, b, _ = pedir("/api/estado"); check(s == 401, "sin PIN no se ve nada")
    s, b, _ = pedir("/api/estado", pin="0000"); check(s == 401, "con PIN equivocado tampoco")
    for _ in range(6): pedir("/api/estado")
    s, b, _ = pedir("/api/estado", pin="24681357"); check(s == 200, "peticiones sin PIN no bloquean al dueño")
    s, b, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b)["estado"]
    check(s == 200 and len(e["agentes"]) == 9 and [p["tipo"] for p in e["plantas"]] == ["cupula", "piso", "vestibulo"], f"con PIN: el edificio de serie con {len(e['agentes'])} agentes")
    check(next(a for a in e["agentes"] if a["rol"] == "jefe")["cerebro"] == "anthropic/claude-sonnet-5.5", "Fer Casa elige cerebros con la lista de OpenRouter")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "hablar", "texto": "Hola"}, "24681357")
    check(s == 200 and json.loads(b)["respuesta"] == "Hola desde Fer Casa.", "hablar con el jefe a través de Fer Casa")
    check(all(a == "Bearer sk-or-casa" for (m, p, a) in recibido if m == "POST"), "la clave la pone Fer Casa; nunca viaja al navegador")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "crearPlanta", "nombre": "Contenidos", "funcion": "Escribir"}, "24681357")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "crearAgente", "ficha": {"nombre": "Redactor", "rol": "subagente", "planta": json.loads(b)["id"], "cuerpo": "Escribes textos claros y cortos."}}, "24681357")
    check(s == 200, "crear piso y agente a través de Fer Casa")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "asignarTarea", "id": "Redactor", "texto": "Escribe algo", "ahora": True}, "24681357")
    time.sleep(2.5)
    s, b, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b)["estado"]
    red = next(a for a in e["agentes"] if a["nombre"] == "Redactor")
    check(any(t["texto"] == "Escribe algo" and t["estado"] == "hecha" for t in red["tareas"]), "el latido de Fer Casa despierta al Redactor y hace la tarea")
    check(os.path.exists(os.path.join(datos, "edificio.json")) and "Escribe algo" in open(os.path.join(datos, "edificio.json")).read(), "el edificio se guarda en el disco")
    check(any("Redactor" in l for l in salida), "Fer Casa escribe en pantalla lo que hacen los agentes")
    # v6: chat con otro agente, JEV antes de buscar y una reunión, todo en Fer Casa
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "hablar", "agente": red["id"], "texto": "¿Qué tal?"}, "24681357")
    s2, b2, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b2)["estado"]
    red = next(a for a in e["agentes"] if a["nombre"] == "Redactor")
    check(s == 200 and json.loads(b)["respuesta"] == "Trabajo hecho en casa." and len(red["chat"]) == 2, "chat con el Redactor (no con el jefe) a través de Fer Casa")
    pedir("/api/accion", "POST", {"tipo": "editarAgente", "id": red["id"], "cambios": {"capacidades": ["escribir", "buscar"]}}, "24681357")
    pedir("/api/accion", "POST", {"tipo": "asignarTarea", "id": red["id"], "texto": "Busca imprentas", "ahora": True}, "24681357")
    time.sleep(2.5)
    check(any(m == "POST" and p == "/api/alpha/decisions" and a == "Bearer sk-or-casa" for (m, p, a) in recibido), "antes de buscar, Fer Casa consulta a JEV (con la clave de Fer Casa)")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "reunion.convocar", "titulo": "Prueba", "ordenDelDia": "Probar la sala.", "participantes": [red["id"]], "rondas": 1}, "24681357")
    rid = json.loads(b)["id"]
    pedir("/api/accion", "POST", {"tipo": "reunion.empezar", "reunion": rid}, "24681357")
    time.sleep(2.5)
    s, b, _ = pedir("/api/estado", pin="24681357"); r = next(x for x in json.loads(b)["estado"]["reuniones"] if x["id"] == rid)
    check(r["estado"] == "terminada" and len(r["intervenciones"]) == 2 and r["acta"], "una reunión en la sala de Fer Casa: el jefe modera, habla el Redactor y queda el acta")
    for ruta in ("/textos.js", "/landing.js", "/textos/es.js"):
        s, b, h = pedir(ruta); check(s == 200 and "javascript" in h.get("Content-Type", ""), f"Fer Casa sirve {ruta} (portada y textos para traducir)")
    # imágenes del edificio: se sirven; lo demás de la carpeta, no
    s, b, h = pedir("/img/piso.webp"); check(s == 200 and h.get("Content-Type") == "image/webp" and len(b) > 1000, "Fer Casa sirve las imágenes del edificio")
    s, b, h = pedir("/img/pj-abuela-zonas.png"); check(s == 200 and h.get("Content-Type") == "image/png", "y los mapas de colores de los personajes")
    check(all(pedir(r)[0] == 404 for r in ("/fer-casa.mjs", "/datos/config.json", "/img/../datos/config.json", "/LEEME.txt")), "pero no sirve ningún otro archivo (ni la configuración con la clave)")
    # pasarela de voz
    req = urllib.request.Request(f"http://localhost:{P_CASA}/api/or/audio/speech", method="POST", data=b'{"model":"x","input":"hola"}', headers={"Content-Type": "application/json", "X-Fer-Pin": "24681357"})
    with urllib.request.urlopen(req) as r: audio = r.read(); gid = r.headers.get("X-Generation-Id")
    check(len(audio) > 1000 and gid == "gen-casa", "pasarela de voz: el audio pasa por Fer Casa con su identificador de coste")
    s, b, _ = pedir("/api/or/chat/completions", "POST", {}, "24681357"); check(s == 403, "la pasarela solo deja pasar voz y oído")
    # web conectada a Fer Casa
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1300, "height": 860}, locale="es-ES")
        ctx.route("https://fonts.**/**", lambda r: r.abort())
        ctx.route("https://openrouter.ai/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(MODELOS if "/models" in r.request.url and "modalities" not in r.request.url else {"data": []})))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda x: errores.append(str(x)))
        page.goto(f"http://localhost:{P_CASA}/")
        page.click("#landing .boton-grande >> nth=0")
        page.wait_for_selector("text=PIN de Fer Casa")
        check(True, "la web abierta desde Fer Casa pide el PIN (no la clave)")
        page.fill("#cajonCuerpo input[type=password]", "24681357"); page.click("#cajonCuerpo >> text=Entrar")
        page.wait_for_selector(".tramo .pj[data-id]")
        check(page.eval_on_selector_all(".tramo .pj", "p => p.length") == 10 and page.eval_on_selector_all(".fila-ag", "f => f.length") == 0, "la web dibuja el edificio de Fer Casa con sus agentes (v8: el directorio, solo en «Franjas»)")
        check("Conectado a Fer Casa" in page.inner_text("#modo"), "la web dice que está conectada a Fer Casa (trabaja 24 h)")
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.fill("#texto", "Hola"); page.keyboard.press("Enter")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].filter(b => b.textContent.includes('Hola desde Fer Casa')).length >= 2", timeout=15000)
        check(True, "chat desde la web a través de Fer Casa (se ve también la conversación anterior)")
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SALIDA, "fer-casa.png"))
        check(not errores, f"web en Fer Casa sin errores: {errores}")
        br.close()
finally:
    casa.terminate(); casa.wait(timeout=5); srv.shutdown()
print("RESULTADO:", "OK" if ok else "FALLOS"); sys.exit(0 if ok else 1)
