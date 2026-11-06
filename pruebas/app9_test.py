"""Test of the desktop app (version 9) from the inside: Fer Home in app mode (FER_APP=1),
with a simulated OpenRouter and the website in a real Chromium. It checks that it can only be reached from this computer,
that the PIN goes on its own, that the key (and the other APIs' keys) are pasted in Settings and saved in datos/config.json,
that the agents' Chrome can be opened to sign in to a website, and that everything comes out in English.
Usage: xvfb-run -a python3 pruebas/app9_test.py   (without a screen, the part that opens Chrome is skipped)"""
import json, os, re, sys, socket, subprocess, time, threading, tempfile, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.environ.get("SALIDA", os.path.join(RAIZ, "pruebas", "capturas"))
os.makedirs(SALIDA, exist_ok=True)
P_OR, P_APP = 9931, 8793
MODELOS = {"data": [
  {"id": "anthropic/claude-sonnet-5.5", "name": "Claude Sonnet 5.5", "pricing": {"prompt": "0.000002", "completion": "0.00001"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 200000}]}
recibido = []

class OR(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        recibido.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELOS)
        if self.path.startswith("/api/v1/generation"): return self._resp(200, {"data": {"total_cost": 0.0007}})
        if self.path == "/web": return self._resp(200, b"<html><title>Una web</title><body>Hola</body></html>", "text/html")
        self._resp(404, {"error": {"message": "no"}})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        recibido.append(("POST", self.path, self.headers.get("Authorization")))
        if self.path == "/api/v1/chat/completions":
            b = json.loads(raw)
            return self._resp(200, {"model": b["model"], "choices": [{"message": {"content": "Hello from the app."}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.0005}})
        if self.path == "/api/alpha/decisions":
            return self._resp(200, {"answers": {"decision": {"choice": "seguir", "probabilities": {"seguir": 0.9}}}, "usage": {"cost": 0.00002}})
        self._resp(404, {"error": {"message": "no"}})

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def pedir(ruta, metodo="GET", cuerpo=None, pin=None, host="127.0.0.1"):
    req = urllib.request.Request(f"http://{host}:{P_APP}{ruta}", method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-Fer-Pin": pin} if pin else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)
def ip_de_fuera():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(("10.255.255.255", 1)); return s.getsockname()[0]
    except Exception: return ""
    finally: s.close()
ESPANOL = re.compile(r"[áéíóúñ¿¡]|\b(el|la|los|las|del|que|para|por|con|una|tus|está|clave|guardar|ajustes|edificio|agentes|este|esta|aplicación|ordenador)\b", re.I)

srv = ThreadingHTTPServer(("127.0.0.1", P_OR), OR); threading.Thread(target=srv.serve_forever, daemon=True).start()
datos = tempfile.mkdtemp(prefix="feragent-app-")
env = dict(os.environ, FER_APP="1", OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", FER_PUERTO=str(P_APP), FER_DATOS=datos, FER_LATIDO_SEG="1",
           FER_IDIOMA="en", FER_CHROME_CANAL="chromium")
for k in ("OPENROUTER_API_KEY", "FER_PIN"): env.pop(k, None)
app = subprocess.Popen(["node", os.path.join(RAIZ, "fer-casa.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
salida = []
threading.Thread(target=lambda: [salida.append(l) for l in app.stdout], daemon=True).start()
try:
    for _ in range(100):
        try:
            if pedir("/api/hola")[0] == 200: break
        except Exception: pass
        time.sleep(0.2)
    # ---------- the app's server ----------
    st, cuerpo, _ = pedir("/api/hola")
    hola = json.loads(cuerpo)
    check(st == 200 and hola.get("app") is True and hola.get("ferCasa") is True, f"it starts without asking anything and says it's the app: {hola}")
    conf = json.load(open(os.path.join(datos, "config.json")))
    check(len(conf.get("pin", "")) >= 24 and not conf.get("clave"), f"it creates the PIN itself (length: {len(conf.get('pin', ''))}) and there's no key yet")
    check(oct(os.stat(os.path.join(datos, "config.json")).st_mode & 0o777) == "0o600", "config.json, only this user can read it (600)")
    ip = ip_de_fuera()
    if ip and not ip.startswith("127."):
        try: pedir("/api/hola", host=ip); fuera = True
        except Exception: fuera = False
        check(not fuera, f"it can only be reached from this computer: from {ip} it doesn't answer")
    else: print("(no network address to test from outside)")
    PIN = conf["pin"]
    check(pedir("/app/entrar?t=otro")[0] == 403 and pedir("/api/estado")[0] == 401, "with another PIN, nothing: /app/entrar 403 and the API 401")
    st, _, _ = pedir("/api/conf/clave", "POST", {"clave": "sk-or-v1-zzzzzzzzzzzzzzzz"})
    check(st == 401, "saving the key without the PIN: no")
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
        page = ctx.new_page(); errores = []; page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(f"http://127.0.0.1:{P_APP}/app/entrar?t={PIN}")
        page.wait_for_selector("#landing .heroe-txt")
        check(page.evaluate("localStorage.getItem('ferEdificio.pin')") == PIN and page.url.rstrip("/").endswith(str(P_APP)), "the window goes in with its PIN on its own and stays on the home page")
        page.wait_for_timeout(1500)
        page.click("#landing .boton-grande >> nth=0")
        page.wait_for_selector("#cajon:not([hidden]) #cajonCuerpo h4", timeout=15000)
        check(page.inner_text("#modo") == "In this app · works while it's open", f"arriba: «{page.inner_text('#modo')}»")
        aj = page.inner_text("#cajonCuerpo")
        check("In this app" in aj and page.is_visible("#cajonCuerpo .donde .aqui:has-text('In this app')") and datos in aj, "Settings → where it lives: “In this app”, marked, with the data folder")
        check("Your OpenRouter key" in aj and "No key yet?" in aj and "Fer Home PIN" not in aj and "PIN" not in page.inner_text("#cajonCuerpo h4 >> nth=1"), "without a key, Settings opens with “Your OpenRouter key” and the steps; no PIN is asked for")
        check("Your websites, in the agents' Chrome" in aj, "and the block to sign in to your websites with the agents' Chrome")
        malos = [l for l in aj.split("\n") if ESPANOL.search(re.sub(r"Fer Agent|Fer Home|fer-casa\.mjs|ES · Español|Español|Biblioteca|Memoria larga|edificio\.json|" + re.escape(datos), "", l))]
        check(not malos, f"Settings, in English: {malos[:3]}")
        page.screenshot(path=os.path.join(SALIDA, "app9-ajustes.png"))
        # a key that isn't one
        clave = page.locator("#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key')) input[type=password]")
        clave.fill("hola"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key')) button:text-is('Save')"); page.wait_for_timeout(500)
        check("That doesn't look like an OpenRouter key" in page.inner_text("#avisoFlotante"), f"a key that isn't one: “{page.inner_text('#avisoFlotante')[:70]}”")
        # the good one
        clave.fill("sk-or-v1-abcdefghijklmnop"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key')) button:text-is('Save')"); page.wait_for_timeout(800)
        conf = json.load(open(os.path.join(datos, "config.json")))
        check(conf.get("clave") == "sk-or-v1-abcdefghijklmnop" and conf.get("pin") == PIN, "the key is saved in datos/config.json (and the PIN stays the same)")
        check("Key saved on this computer." in page.inner_text("#avisoFlotante") and page.is_hidden("#cajon"), "“Key saved on this computer.” and Settings closes")
        check("sk-or-v1-abcdefghijklmnop" not in page.evaluate("JSON.stringify(localStorage)"), "the key doesn't stay in the website (only in config.json)")
        # talking to the boss
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.fill("#texto", "Hello"); page.keyboard.press("Enter")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=20000)
        check("Hello from the app." in page.inner_text("#mensajes"), "the boss answers with the key set")
        check(any(m == "POST" and r == "/api/v1/chat/completions" and a == "Bearer sk-or-v1-abcdefghijklmnop" for m, r, a in recibido), "the key pasted in Settings reaches OpenRouter")
        page.click("#cerrarChat")
        # another API: Claude, with its key
        page.click("#abrirAjustes"); page.wait_for_selector("#cajonCuerpo h4")
        page.click("#cajonCuerpo button:text-is('+ Claude (Anthropic)')"); page.wait_for_timeout(600)
        fila = page.locator("#cajonCuerpo .api-fila:has-text('Claude (Anthropic)')")
        fila.locator("input[type=password]").fill("sk-ant-prueba-123"); fila.locator("button:text-is('Save')").click(); page.wait_for_timeout(800)
        conf = json.load(open(os.path.join(datos, "config.json")))
        check((conf.get("claves") or {}).get("anthropic") == "sk-ant-prueba-123", "Claude's key is pasted in Settings and saved in config.json")
        check("key set" in page.inner_text("#cajonCuerpo .api-fila:has-text('Claude (Anthropic)')"), "and the row says “key set”")
        # signing in to a website with the agents' Chrome
        web = page.locator("#cajonCuerpo .bloque:has(h4:text-is(\"Your websites, in the agents' Chrome\"))")
        web.locator("input").fill("mail.google.com"); web.locator("button:text-is('Open')").click(); page.wait_for_timeout(500)
        check("Write the full address" in page.inner_text("#avisoFlotante"), f"without https://, it explains: “{page.inner_text('#avisoFlotante')[:60]}”")
        if os.environ.get("DISPLAY"):
            web.locator("input").fill(f"http://127.0.0.1:{P_OR}/web"); web.locator("button:text-is('Open')").click(); page.wait_for_timeout(6000)
            aviso = page.inner_text("#avisoFlotante")
            check("The agents' Chrome is open" in aviso and os.path.isdir(os.path.join(datos, "chrome-agentes")), f"with the full address the agents' Chrome opens (its profile, in datos): “{aviso[:60]}”")
        else: print("(no screen: opening the agents' Chrome is not tested)")
        # the brain: its folder (in a normal browser there's no button to choose it; in the app, there is)
        cer = page.inner_text("#cajonCuerpo")
        check("In the app, the brain lives in a folder on this computer" in cer and os.path.join(datos, "cerebro") in cer and not page.is_visible("#cajonCuerpo button:text-is('Change the folder')"),
              "Settings → brain: the app's folder (and no button outside the app)")
        otra = tempfile.mkdtemp(prefix="cerebro-")
        st1, c1, _ = pedir("/api/conf/carpeta", "POST", {"ruta": "/no/existe/esto"}, pin=PIN)
        st2, c2, _ = pedir("/api/conf/carpeta", "POST", {"ruta": otra}, pin=PIN)
        conf = json.load(open(os.path.join(datos, "config.json")))
        check(st1 == 400 and st2 == 200 and json.loads(c2).get("reiniciar") and conf.get("carpetaCerebro") == otra, "choosing another folder: one that doesn't exist, no; the good one is saved (used when reopening)")
        check(not errores, f"no errors on the page: {errores[:3]}")
        b.close()
    # on closing, it saves
    app.terminate(); app.wait(timeout=20)
    e = json.load(open(os.path.join(datos, "edificio.json")))
    check(e.get("idioma") == "en" and e["agentes"][0]["nombre"] == "Boss", "on quitting the building stays saved (in English: Boss)")
finally:
    if app.poll() is None: app.kill()
    srv.shutdown()
    if not ok: print("".join(salida[-30:]))
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
