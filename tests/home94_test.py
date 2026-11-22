"""Test of Fer Home 9.4 · The building's Telegram from Settings (before, only from the Terminal: node fer-home.mjs telegram).
You paste the bot's token in Settings → Telegram, open the bot and send it /start: that chat becomes the building's, without restarting.
The approval inbox then reaches it with buttons. It can be disconnected from the same place. Everything simulated (OpenRouter and Telegram).
Usage: python3 tests/home94_test.py   (leaves screenshots in tests/screenshots/home94-*.png)"""
import json, os, sys, subprocess, time, threading, tempfile, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get("OUTPUT", os.path.join(ROOT, "tests", "screenshots"))
os.makedirs(OUTPUT, exist_ok=True)
P_OR, P_TG, P_HOME = 9941, 9943, 8794
PIN = "24681357"
GOOD = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabc"     # the building's bot
AGENT = "987654321:ZYXWVUTSRQPONMLKJIHGFEDCBAzyx"   # an agent's bot
MODELS = {"data": [{"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 128000}]}
tg_out = []        # (token, method, body) that Fer Home sends to Telegram
tg_queue = {}      # token → updates that “you” write

class Base(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def _body(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        try: return json.loads(raw or b"{}")
        except Exception: return {}
class OR(Base):
    def do_GET(self):
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELS)
        self._resp(404, {})
    def do_POST(self):
        self._body()
        if self.path == "/api/v1/chat/completions": return self._resp(200, {"model": "x", "choices": [{"message": {"content": "Hecho."}}], "usage": {"prompt_tokens": 5, "completion_tokens": 2, "cost": 0.0001}})
        if self.path == "/api/alpha/decisions": return self._resp(200, {"answers": {"decision": {"choice": "go_ahead", "probabilities": {"go_ahead": 0.9}}}, "usage": {"cost": 0.00001}})
        self._resp(404, {})
class TG(Base):
    def _split(self):
        p = self.path.split("?")[0]; token = p.split("/bot", 1)[1].split("/", 1)[0]; return token, p.rsplit("/", 1)[-1]
    def do_GET(self):
        token, method = self._split()
        if token not in (GOOD, AGENT): return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
        if method == "getUpdates":
            for _ in range(10):
                if tg_queue.get(token): break
                time.sleep(0.1)
            res = list(tg_queue.get(token, [])); tg_queue[token] = []
            return self._resp(200, {"ok": True, "result": res})
        self._resp(404, {})
    def do_POST(self):
        token, method = self._split(); b = self._body()
        if token not in (GOOD, AGENT): return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
        tg_out.append((token, method, b))
        if method == "getMe": return self._resp(200, {"ok": True, "result": {"id": 1, "is_bot": True, "username": "edificio_bot" if token == GOOD else "agente_bot"}})
        return self._resp(200, {"ok": True, "result": {"message_id": len(tg_out)}})

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def ask(rel_path, method="GET", body=None):
    req = urllib.request.Request(f"http://localhost:{P_HOME}{rel_path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", "X-Fer-Pin": PIN})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
def state(): return ask("/api/state")[1]
def wait_for(cond, seconds=15, step=0.25):
    end = time.time() + seconds
    while time.time() < end:
        try:
            if cond(): return True
        except Exception: pass
        time.sleep(step)
    return False
def sent(method, text):
    return [b for t, m, b in tg_out if t == GOOD and m == method and text in b.get("text", "")]

for P, H in [(P_OR, OR), (P_TG, TG)]:
    s = ThreadingHTTPServer(("127.0.0.1", P), H); threading.Thread(target=s.serve_forever, daemon=True).start()
data = tempfile.mkdtemp(prefix="fercasa94-")
json.dump({"key": "sk-or-casa", "pin": PIN}, open(os.path.join(data, "config.json"), "w"))   # without Telegram
env = dict(os.environ, FER_LANGUAGE="es", OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", TELEGRAM_API=f"http://127.0.0.1:{P_TG}",
           FER_PORT=str(P_HOME), FER_DATA=data, FER_HEARTBEAT_SEC="1", FER_TEMPLATE="basic", FER_CHROME_CHANNEL="chromium")
home = subprocess.Popen(["node", os.path.join(ROOT, "fer-home.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
output = []
threading.Thread(target=lambda: [output.append(l) for l in home.stdout], daemon=True).start()
conf = lambda: json.load(open(os.path.join(data, "config.json")))
try:
    check(wait_for(lambda: any("encendido" in l for l in output), 20), "Fer Casa arranca, sin Telegram")
    check(state()["home"]["telegramBot"] is None and not state()["home"]["telegram"], "sin Telegram: la web lo sabe")
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1360, "height": 900}, locale="es-ES"); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.route("https://openrouter.ai/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(MODELS)))
        pg.goto(f"http://localhost:{P_HOME}/"); pg.click("#landing .button-big >> nth=0")
        pg.wait_for_selector("#drawer:not([hidden])"); pg.fill("#drawerBody input[type=password]", PIN); pg.click("#drawerBody >> text=Entrar")
        pg.wait_for_selector(".tier")
        pg.click("#openSettings"); pg.wait_for_selector("#drawerBody .telegram-building")
        blk = "#drawerBody .telegram-building"
        txt = pg.inner_text(blk)
        check("Telegram: la bandeja en tu móvil" in txt and "@BotFather" in txt and "envíale /newbot" in txt and "Abre tu bot nuevo y envíale /start." in txt,
              "Ajustes → Telegram: los tres pasos, sin Terminal")
        pg.screenshot(path=os.path.join(OUTPUT, "home94-1-pasos.png"))
        # a token that isn't one, and one Telegram doesn't accept
        pg.fill(blk + " input[type=password]", "hola"); pg.click(blk + " button:text-is('Conectar')")
        pg.wait_for_selector("#toast:has-text('token')", timeout=8000)
        check("no parece el token de un bot" in pg.inner_text("#toast").lower() or "token" in pg.inner_text("#toast"), "un texto que no es un token: lo dice")
        st, r = ask("/api/conf/telegram", "POST", {"token": "111111111:NOVALENOVALENOVALENOVALE"})
        check(st == 400 and "no ha aceptado" in r.get("error", ""), f"un token que Telegram no acepta: lo dice ({r})")
        # an agent's bot can't be the building's too
        jefe = next(a for a in state()["state"]["agents"] if a["role"] == "boss")
        st, r = ask("/api/conf/telegram-agent", "POST", {"agent": jefe["id"], "token": AGENT})
        st2, r2 = ask("/api/conf/telegram", "POST", {"token": AGENT})
        check(st == 200 and st2 == 400 and "agente" in r2.get("error", ""), f"el bot de un agente no puede ser también el del edificio ({r2})")
        # the right one
        pg.fill(blk + " input[type=password]", GOOD); pg.click(blk + " button:text-is('Conectar')")
        pg.wait_for_selector(blk + " .telegram-wait")
        check("Último paso: abre @edificio_bot en Telegram y envíale /start." in pg.inner_text(blk) and pg.get_attribute(blk + " a:has-text('Abrir @edificio_bot')", "href") == "https://t.me/edificio_bot",
              "conectado el token: el último paso, con el enlace a tu bot")
        check(conf()["telegram"] == {"token": GOOD, "chat": None, "username": "edificio_bot"} and state()["home"]["telegramBot"] == {"username": "edificio_bot", "linked": False},
              "guardado en Fer Casa (config.json), a la espera de tu /start")
        pg.screenshot(path=os.path.join(OUTPUT, "home94-2-espera.png"))
        check(wait_for(lambda: any("esperando tu /start a @edificio_bot" in l for l in output), 10), "Fer Casa lo dice en su registro")
        # a group doesn't link it; your private chat does
        tg_queue[GOOD] = [{"update_id": 1, "message": {"message_id": 1, "chat": {"id": -100, "type": "group"}, "text": "/start"}}]
        time.sleep(1.5)
        check(conf()["telegram"]["chat"] is None, "un grupo no se queda con él")
        tg_queue[GOOD] = [{"update_id": 2, "message": {"message_id": 2, "chat": {"id": 555, "type": "private"}, "text": "/start"}}]
        check(wait_for(lambda: conf()["telegram"]["chat"] == 555), "tu /start: ese chat queda como el del edificio, sin reiniciar")
        check(wait_for(lambda: sent("sendMessage", "Fer Casa conectado") and sent("sendMessage", "La bandeja está vacía")), "te da la bienvenida y te dice cómo está la bandeja")
        pg.wait_for_selector(blk + " .telegram-ok", timeout=15000)
        check("Conectado: @edificio_bot. Solo escucha tu chat." in pg.inner_text(blk), "la web se entera sola: «Conectado»")
        pg.screenshot(path=os.path.join(OUTPUT, "home94-3-conectado.png"))
        # someone else writing to it: ignored (the building starts on general pause)
        check(state()["state"]["settings"].get("pause") is True, "(el edificio arranca en pausa general)")
        n = len(tg_out)
        tg_queue[GOOD] = [{"update_id": 3, "message": {"message_id": 3, "chat": {"id": 999, "type": "private"}, "text": "/marcha"}}]
        time.sleep(2)
        check(not any(t == GOOD and b.get("chat_id") == 999 for t, m, b in tg_out[n:]) and state()["state"]["settings"].get("pause") is True, "otro chat que le escribe: no le hace caso")
        # yours: it obeys
        tg_queue[GOOD] = [{"update_id": 4, "message": {"message_id": 4, "chat": {"id": 555, "type": "private"}, "text": "/marcha"}}]
        check(wait_for(lambda: state()["state"]["settings"].get("pause") is False and sent("sendMessage", "Automático en marcha")), "y obedece tus órdenes (/marcha)")
        # disconnect
        pg.click(blk + " button:text-is('Desconectar')"); pg.click(blk + " button:has-text('Pulsa otra vez')")
        pg.wait_for_selector(blk + " input[type=password]", timeout=8000)
        check(conf().get("telegram") is None and state()["home"]["telegramBot"] is None, "«Desconectar»: borrado de Fer Casa y la web vuelve a los pasos")
        tg_queue[GOOD] = [{"update_id": 5, "message": {"message_id": 5, "chat": {"id": 555, "type": "private"}, "text": "/pausa"}}]
        time.sleep(2.5)
        check(not sent("sendMessage", "Pausa general puesta") and state()["state"]["settings"].get("pause") is False, "desconectado: ya no escucha")
        check(not errors, f"sin errores en la página: {errors[:3]}")
        b.close()
finally:
    home.terminate()
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
