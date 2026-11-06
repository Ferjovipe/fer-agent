"""Test of Fer Home: it starts a simulated OpenRouter and the real program, and checks the API, the PIN,
the voice gateway, the heartbeat and the connected website (a Spanish building). Usage: python3 pruebas/casa_test.py"""
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
env = dict(os.environ, FER_IDIOMA="es", OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", OPENROUTER_API_KEY="sk-or-casa", FER_PIN="24681357", FER_PUERTO=str(P_CASA), FER_DATOS=datos, FER_LATIDO_SEG="1", FER_PLANTILLA="basico")   # v8: without this, Fer Home is born with only the boss
casa = subprocess.Popen(["node", os.path.join(RAIZ, "fer-casa.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
salida = []
threading.Thread(target=lambda: [salida.append(l) for l in casa.stdout], daemon=True).start()
try:
    for _ in range(50):
        if any("encendido" in l for l in salida): break
        time.sleep(0.2)
    check(any("encendido" in l for l in salida), "Fer Home starts and shows its addresses")
    s, b, _ = pedir("/api/hola"); check(s == 200 and json.loads(b)["ferCasa"], "the website can recognise Fer Home")
    s, b, _ = pedir("/api/estado"); check(s == 401, "without a PIN nothing can be seen")
    s, b, _ = pedir("/api/estado", pin="0000"); check(s == 401, "with a wrong PIN neither")
    for _ in range(6): pedir("/api/estado")
    s, b, _ = pedir("/api/estado", pin="24681357"); check(s == 200, "requests without a PIN don't lock the owner out")
    s, b, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b)["estado"]
    check(s == 200 and len(e["agentes"]) == 9 and [p["tipo"] for p in e["plantas"]] == ["cupula", "piso", "vestibulo"], f"with the PIN: the built-in building with {len(e['agentes'])} agents")
    check(next(a for a in e["agentes"] if a["rol"] == "jefe")["cerebro"] == "anthropic/claude-sonnet-5.5", "Fer Home chooses brains with OpenRouter's list")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "hablar", "texto": "Hola"}, "24681357")
    check(s == 200 and json.loads(b)["respuesta"] == "Hola desde Fer Casa.", "talking to the boss through Fer Home")
    check(all(a == "Bearer sk-or-casa" for (m, p, a) in recibido if m == "POST"), "Fer Home puts the key in; it never travels to the browser")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "crearPlanta", "nombre": "Contenidos", "funcion": "Escribir"}, "24681357")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "crearAgente", "ficha": {"nombre": "Redactor", "rol": "subagente", "planta": json.loads(b)["id"], "cuerpo": "Escribes textos claros y cortos."}}, "24681357")
    check(s == 200, "creating a floor and an agent through Fer Home")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "asignarTarea", "id": "Redactor", "texto": "Escribe algo", "ahora": True}, "24681357")
    time.sleep(2.5)
    s, b, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b)["estado"]
    red = next(a for a in e["agentes"] if a["nombre"] == "Redactor")
    check(any(t["texto"] == "Escribe algo" and t["estado"] == "hecha" for t in red["tareas"]), "Fer Home's heartbeat wakes up the Redactor and it does the task")
    check(os.path.exists(os.path.join(datos, "edificio.json")) and "Escribe algo" in open(os.path.join(datos, "edificio.json")).read(), "the building is saved on disk")
    check(any("Redactor" in l for l in salida), "Fer Home writes on screen what the agents do")
    # v6: chat with another agent, JEV before searching and a meeting, all in Fer Home
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "hablar", "agente": red["id"], "texto": "¿Qué tal?"}, "24681357")
    s2, b2, _ = pedir("/api/estado", pin="24681357"); e = json.loads(b2)["estado"]
    red = next(a for a in e["agentes"] if a["nombre"] == "Redactor")
    check(s == 200 and json.loads(b)["respuesta"] == "Trabajo hecho en casa." and len(red["chat"]) == 2, "chat with the Redactor (not the boss) through Fer Home")
    pedir("/api/accion", "POST", {"tipo": "editarAgente", "id": red["id"], "cambios": {"capacidades": ["escribir", "buscar"]}}, "24681357")
    pedir("/api/accion", "POST", {"tipo": "asignarTarea", "id": red["id"], "texto": "Busca imprentas", "ahora": True}, "24681357")
    time.sleep(2.5)
    check(any(m == "POST" and p == "/api/alpha/decisions" and a == "Bearer sk-or-casa" for (m, p, a) in recibido), "before searching, Fer Home asks JEV (with Fer Home's key)")
    s, b, _ = pedir("/api/accion", "POST", {"tipo": "reunion.convocar", "titulo": "Prueba", "ordenDelDia": "Probar la sala.", "participantes": [red["id"]], "rondas": 1}, "24681357")
    rid = json.loads(b)["id"]
    pedir("/api/accion", "POST", {"tipo": "reunion.empezar", "reunion": rid}, "24681357")
    time.sleep(2.5)
    s, b, _ = pedir("/api/estado", pin="24681357"); r = next(x for x in json.loads(b)["estado"]["reuniones"] if x["id"] == rid)
    check(r["estado"] == "terminada" and len(r["intervenciones"]) == 2 and r["acta"], "a meeting in Fer Home's room: the boss chairs, the Redactor speaks and the minutes remain")
    for ruta in ("/textos.js", "/landing.js", "/textos/es.js"):
        s, b, h = pedir(ruta); check(s == 200 and "javascript" in h.get("Content-Type", ""), f"Fer Home serves {ruta} (home page and texts to translate)")
    # the building's images: served; nothing else in the folder
    s, b, h = pedir("/img/piso.webp"); check(s == 200 and h.get("Content-Type") == "image/webp" and len(b) > 1000, "Fer Home serves the building's images")
    s, b, h = pedir("/img/pj-abuela-zonas.png"); check(s == 200 and h.get("Content-Type") == "image/png", "and the characters' colour maps")
    check(all(pedir(r)[0] == 404 for r in ("/fer-casa.mjs", "/datos/config.json", "/img/../datos/config.json", "/LEEME.txt")), "but it doesn't serve any other file (nor the configuration with the key)")
    # voice gateway
    req = urllib.request.Request(f"http://localhost:{P_CASA}/api/or/audio/speech", method="POST", data=b'{"model":"x","input":"hola"}', headers={"Content-Type": "application/json", "X-Fer-Pin": "24681357"})
    with urllib.request.urlopen(req) as r: audio = r.read(); gid = r.headers.get("X-Generation-Id")
    check(len(audio) > 1000 and gid == "gen-casa", "voice gateway: the audio goes through Fer Home with its cost identifier")
    s, b, _ = pedir("/api/or/chat/completions", "POST", {}, "24681357"); check(s == 403, "the gateway only lets voice and hearing through")
    # web conectada a Fer Casa
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1300, "height": 860}, locale="es-ES")
        ctx.route("https://fonts.**/**", lambda r: r.abort())
        ctx.route("https://openrouter.ai/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(MODELOS if "/models" in r.request.url and "modalities" not in r.request.url else {"data": []})))
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda x: errores.append(str(x)))
        page.goto(f"http://localhost:{P_CASA}/")
        page.click("#landing .boton-grande >> nth=0")
        page.wait_for_selector("text=PIN de Fer Casa")
        check(True, "the website opened from Fer Home asks for the PIN (not the key)")
        page.fill("#cajonCuerpo input[type=password]", "24681357"); page.click("#cajonCuerpo >> text=Entrar")
        page.wait_for_selector(".tramo .pj[data-id]")
        check(page.eval_on_selector_all(".tramo .pj", "p => p.length") == 10 and page.eval_on_selector_all(".fila-ag", "f => f.length") == 0, "the website draws Fer Home's building with its agents (v8: the directory, only in “Franjas”)")
        check("Conectado a Fer Casa" in page.inner_text("#modo"), "the website says it's connected to Fer Home (works 24 h)")
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.fill("#texto", "Hola"); page.keyboard.press("Enter")
        page.wait_for_function("[...document.querySelectorAll('.msg.bot .burbuja')].filter(b => b.textContent.includes('Hola desde Fer Casa')).length >= 2", timeout=15000)
        check(True, "chat from the website through Fer Home (the earlier conversation shows too)")
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SALIDA, "fer-casa.png"))
        check(not errores, f"website on Fer Home with no errors: {errores}")
        br.close()
finally:
    casa.terminate(); casa.wait(timeout=5); srv.shutdown()
print("RESULT:", "OK" if ok else "FAILURES"); sys.exit(0 if ok else 1)
