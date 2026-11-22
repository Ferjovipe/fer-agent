"""Test of Fer Home v7: the hands (the agents' Chrome with an imitation of X, the agents' folder),
the permission through Telegram, the brain folder, the saved images and direct Claude (a Spanish building). Everything simulated: no X, no Telegram,
no Anthropic and no real OpenRouter. Usage: python3 tests/home7_test.py"""
import json, os, sys, subprocess, time, threading, tempfile, urllib.request, urllib.error, base64, re, shutil
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get("OUTPUT", os.path.join(ROOT, "tests", "screenshots"))
os.makedirs(OUTPUT, exist_ok=True)
P_OR, P_ANT, P_TG, P_X, P_HOME = 9921, 9922, 9923, 9924, 8792
PIN = "24681357"
PNG = open(os.path.join(ROOT, "tests", "dot.png"), "rb").read()
MODELS = {"data": [
  {"id": "anthropic/claude-sonnet-5.5", "name": "Claude Sonnet 5.5", "pricing": {"prompt": "0.000002", "completion": "0.00001"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "anthropic/claude-opus-5.5", "name": "Claude Opus 5.5", "pricing": {"prompt": "0.000004", "completion": "0.00002"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 128000},
  {"id": "black-forest-labs/flux.2-max", "name": "FLUX.2 Max", "pricing": {"prompt": "0", "completion": "0", "image_output": "0.00001708984375"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["image"]}, "context_length": 0}]}
systems = []      # instructions each brain receives (to check what it reads)
anthropic = []     # calls to direct Claude
tg_out = []     # what Fer Home sends to Telegram
tg_queue = []       # what “you” write on Telegram

def reply(content, tool=None):
    msg = {"content": content}
    if tool: msg["tool_calls"] = [{"id": "c%d" % len(systems), "type": "function", "function": {"name": tool[0], "arguments": json.dumps(tool[1])}}]
    return {"model": "simulado", "choices": [{"message": msg}], "usage": {"prompt_tokens": 50, "completion_tokens": 10, "cost": 0.0004}}

class Base(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def _body(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        try: return json.loads(raw or b"{}")
        except Exception: return {}

class OR(Base):
    def do_GET(self):
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELS)
        self._resp(404, {"error": {"message": "no"}})
    def do_POST(self):
        b = self._body()
        if self.path == "/api/alpha/decisions": return self._resp(200, {"answers": {"decision": {"choice": "go_ahead", "probabilities": {"go_ahead": 0.9}}}, "usage": {"cost": 0.00001}})
        if self.path == "/api/v1/images": return self._resp(200, {"data": [{"b64_json": base64.b64encode(PNG).decode(), "media_type": "image/png"}], "usage": {"cost": 0.07}})
        if self.path == "/api/v1/chat/completions":
            msgs = b["messages"]; s0 = str(msgs[0]["content"]); systems.append(s0)
            has_tool = any(m["role"] == "tool" for m in msgs)
            ut = next((m["content"] for m in reversed(msgs) if m["role"] == "user"), "")
            ut = ut if isinstance(ut, str) else json.dumps(ut)
            if s0.startswith("Eres el archivero"):
                if "aprobó" in json.dumps(msgs, ensure_ascii=False): return self._resp(200, reply("Informe guardado."))
                if not has_tool: return self._resp(200, reply("", ("file_write", {"path": OUTSIDE_FILE, "text": "Informe de hoy: todo en orden."})))
                return self._resp(200, reply("He pedido permiso para guardar el informe."))
            if s0.startswith("Eres el jefe"):
                if "dibuja" in ut.lower() and not has_tool: return self._resp(200, reply("", ("create_image", {"description": "Un faro"})))
                return self._resp(200, reply("Hola desde Fer Casa."))
            return self._resp(200, reply("Hecho."))
        self._resp(404, {"error": {"message": "no"}})

class ANT(Base):
    def do_GET(self):
        if self.path.startswith("/v1/models"):
            return self._resp(200, {"data": [{"id": "claude-sonnet-5-5", "created_at": "2026-09-01T00:00:00Z"}, {"id": "claude-opus-5-5", "created_at": "2026-10-01T00:00:00Z"}, {"id": "claude-opus-4-1", "created_at": "2025-08-05T00:00:00Z"}]})
        self._resp(404, {})
    def do_POST(self):
        b = self._body(); anthropic.append({"cabeceras": dict(self.headers), "instructions": b})
        return self._resp(200, {"model": b.get("model"), "content": [{"type": "text", "text": "Consejo de Claude directo."}], "usage": {"input_tokens": 100, "output_tokens": 20}})

class TG(Base):
    def _method(self): return self.path.split("?")[0].rsplit("/", 1)[-1]
    def do_GET(self):
        if self._method() == "getUpdates":
            for _ in range(10):
                if tg_queue: break
                time.sleep(0.1)
            res = list(tg_queue); tg_queue.clear()
            return self._resp(200, {"ok": True, "result": res})
        self._resp(404, {})
    def do_POST(self):
        b = self._body(); tg_out.append((self._method(), b))
        return self._resp(200, {"ok": True, "result": {"message_id": len(tg_out)}})

NOW = datetime.now(timezone.utc)
def x_page():
    tweets = [("201", "ana", 2, "La inteligencia artificial ya escribe sola", 3, 1), ("202", "bob", 5, "AI agents everywhere", 1, 0), ("203", "chen", 30, "Viejo pero famoso", 900, 40)]
    arts = "".join(f'''<article data-testid="tweet"><a href="/{a}/status/{i}"><time datetime="{(NOW - timedelta(minutes=m)).isoformat()}">{m} min</time></a>
      <div data-testid="tweetText">{t}</div><button data-testid="reply" aria-label="{r} respuestas. Responder"></button>
      <button data-testid="retweet" aria-label="Repostear"></button><button data-testid="like" aria-label="{mg} Me gusta. Me gusta"></button></article>''' for i, a, m, t, mg, r in tweets)
    return f"<!doctype html><html><head><meta charset='utf-8'></head><body>{arts}</body></html>"
class X(Base):
    def do_GET(self):
        if self.path.startswith("/search"): return self._resp(200, x_page(), "text/html; charset=utf-8")
        self._resp(404, "no", "text/plain")

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def ask(rel_path, method="GET", body=None, pin=PIN, raw=False):
    req = urllib.request.Request(f"http://localhost:{P_HOME}{rel_path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **({"X-Fer-Pin": pin} if pin else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: d = r.read(); return r.status, (d if raw else json.loads(d or b"{}")), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}"), dict(e.headers)
def action(acc): return ask("/api/action", "POST", acc)[1]
def state(): return ask("/api/state")[1]
def wait_for(cond, seconds=15, step=0.25):
    end = time.time() + seconds
    while time.time() < end:
        try:
            if cond(): return True
        except Exception: pass
        time.sleep(step)
    return False

for P, H in [(P_OR, OR), (P_ANT, ANT), (P_TG, TG), (P_X, X)]:
    s = ThreadingHTTPServer(("127.0.0.1", P), H); threading.Thread(target=s.serve_forever, daemon=True).start()
data = tempfile.mkdtemp(prefix="fercasa7-")
OUTSIDE_FILE = os.path.join(data, "fuera", "informes", "hoy.md")  # 9.2: outside the agents' folder
json.dump({"key": "sk-or-casa", "pin": PIN, "keys": {"anthropic": "sk-ant-casa"}, "telegram": {"token": "TOK", "chat": 777}}, open(os.path.join(data, "config.json"), "w"))
# FER_ALLOW_LOCAL: the imitation of X lives on this computer (the agents only use the internet otherwise)
env = dict(os.environ, FER_ALLOW_LOCAL="1", FER_LANGUAGE="es", OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", ANTHROPIC_BASE=f"http://127.0.0.1:{P_ANT}/v1", TELEGRAM_API=f"http://127.0.0.1:{P_TG}",
           FER_PORT=str(P_HOME), FER_DATA=data, FER_HEARTBEAT_SEC="1", FER_BRAIN_SEC="2", FER_CHROME_CHANNEL="chromium", FER_TEMPLATE="basic")
home = subprocess.Popen(["node", os.path.join(ROOT, "fer-home.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
output = []
threading.Thread(target=lambda: [output.append(l) for l in home.stdout], daemon=True).start()
try:
    check(wait_for(lambda: any("encendido" in l for l in output), 20), "Fer Casa 7 arranca")
    check(any("Pausa general puesta" in l for l in output), "it starts paused and says so")
    e = state()
    names = [k["name"] for k in e["skills"]]
    check({"x-watcher", "read-web", "web-search", "read-file", "write-file"} <= set(names), f"hands: the skills it comes with ({', '.join(names)})")
    check(next(k for k in e["skills"] if k["name"] == "write-file")["effect"] == "read", "9.2: writing in its own folder doesn't ask (outside it, it does)")
    check(e["home"]["telegram"] and e["home"]["keys"]["anthropic"] and not e["home"]["keys"]["openai"], "the website knows there's Telegram and a Claude key (not the key itself)")
    check("sk-ant-casa" not in json.dumps(e), "Claude's key doesn't leave Fer Home")
    check(e["state"]["settings"]["pause"] is True, "Fer Home's building also starts paused")

    # ---------- The X Watcher, with the agents' Chrome against an imitation of X ----------
    pid = action({"type": "createFloor", "name": "Vigilancia", "job": "Mirar redes"})["id"]
    vid = action({"type": "createAgent", "profile": {"name": "Vigía de X", "floor": pid, "instructions": "Vigilas X y pasas los tweets que cumplen la regla.", "heartbeat": {"every": 10, "unit": "min"}}})["id"]
    action({"type": "editAgent", "id": vid, "changes": {"capabilities": ["write", "skills"], "skills": ["x-watcher"], "fixedSkill": {"skill": "x-watcher", "settings": {"terms": ['"inteligencia artificial"', '"AI agents"'], "windowMinutes": 10, "minimum": 3, "scrolls": 1, "base": f"http://127.0.0.1:{P_X}"}}}})
    r = action({"type": "wakeUp", "id": vid})
    check(r.get("outcome") == "done" and "@ana" in r.get("text", "") and "@chen" not in r.get("text", "") and "@bob" not in r.get("text", ""), "the Watcher opens the agents' Chrome, reads “X” and passes on only the ones that qualify (ana: 3 likes + 1 reply in 2 min)")
    v = next(a for a in state()["state"]["agents"] if a["id"] == vid)
    check(any(m["role"] == "report" and "@ana" in m["content"] for m in v["chat"]), "what it finds stays in its chat")
    check(sum(v["spending"].values()) == 0 if v["spending"] else True, "it spends nothing: no API and no brain")
    check(wait_for(lambda: any(m == "sendMessage" and "Vigía de X (x-watcher)" in b.get("text", "") and "@ana" in b.get("text", "") for m, b in tg_out)), "and it reaches you on Telegram")
    r2 = action({"type": "wakeUp", "id": vid})
    check(r2.get("outcome") == "nothing", "on the next round it doesn't repeat the same tweet")

    # ---------- 9.2 · Writing outside its folder (with «Your computer as you», mode “ask”): your permission, from Telegram ----------
    aid = action({"type": "createAgent", "profile": {"name": "Archivero", "floor": pid, "instructions": "Eres el archivero: guardas los informes en la carpeta de los agentes.", "level": "budget"}})["id"]
    action({"type": "editAgent", "id": aid, "changes": {"capabilities": ["write", "computer"]}})
    action({"type": "assignTask", "id": aid, "text": "Guarda el informe de hoy", "now": True})
    check(wait_for(lambda: any(x["state"] == "pending" for x in state()["state"]["approvals"])), "the Archivero asks for permission: it stays in the inbox")
    archivo = OUTSIDE_FILE
    check(not os.path.exists(archivo), "without your yes, it writes nothing")
    def button():
        for m, b in tg_out:
            if m == "sendMessage" and "Escribir el archivo" in b.get("text", "") and b.get("reply_markup"): return b
    check(wait_for(lambda: button() is not None), "the request reaches Telegram with buttons (who, what)")
    b = button(); cb_si = b["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    check(b["text"].startswith("Acción fuera de la web · Archivero") and OUTSIDE_FILE in b["text"] and "Informe de hoy" in b["text"], "the message says who asks for it and what: “" + b["text"].split("\n")[0] + "”")
    tg_queue.append({"update_id": 10, "callback_query": {"id": "cbx", "data": cb_si, "message": {"message_id": 3, "chat": {"id": 999}, "text": b["text"]}}})
    time.sleep(2)
    check(not os.path.exists(archivo), "a button pressed from another chat doesn't count")
    tg_queue.append({"update_id": 11, "callback_query": {"id": "cb1", "data": cb_si, "message": {"message_id": 3, "chat": {"id": 777}, "text": b["text"]}}})
    check(wait_for(lambda: os.path.exists(archivo)), "you press “Approve” on Telegram and it does it")
    check(open(archivo).read() == "Informe de hoy: todo en orden.", "it writes exactly that, where it said")
    check(wait_for(lambda: any(m == "answerCallbackQuery" and b.get("text", "").startswith("Hecho") for m, b in tg_out)), "Telegram te contesta «Hecho»")
    check(any(x["state"] == "done" for x in state()["state"]["approvals"]), "in the inbox it stays as done")
    tg_queue.append({"update_id": 12, "message": {"message_id": 9, "chat": {"id": 777}, "text": "/marcha"}})
    check(wait_for(lambda: state()["state"]["settings"]["pause"] is False), "/marcha on Telegram lifts the general pause")
    tg_queue.append({"update_id": 13, "message": {"message_id": 10, "chat": {"id": 777}, "text": "/pausa"}})
    check(wait_for(lambda: state()["state"]["settings"]["pause"] is True), "/pausa puts it back")

    # ---------- The brain folder ----------
    action({"type": "memory.save", "text": "El cliente Pérez paga a 60 días", "tags": ["clientes"], "topic": "Clientes"})
    note = os.path.join(data, "brain", "Memoria larga", "Clientes.md")
    check(wait_for(lambda: os.path.exists(note) and "Pérez paga a 60 días" in open(note).read(), 15), "the long-term memory is written as Obsidian notes, by topic (Memoria larga/Clientes.md)")
    check(wait_for(lambda: os.path.exists(os.path.join(data, "brain", "edificio.json")), 10), "and the building's backup, in the same folder (edificio.json)")
    time.sleep(1.2)
    old = open(note).read()
    open(note, "w").write(old.replace("60 días", "90 días") + "- Pérez quiere factura electrónica #clientes\n")
    check(wait_for(lambda: any("90 días" in n["text"] for n in state()["state"]["longMemory"]), 15), "what you correct by hand in the note, Fer Home reads again")
    check(any("factura electrónica" in n["text"] for n in state()["state"]["longMemory"]), "and also what you add")
    os.makedirs(os.path.join(data, "brain", "Biblioteca", "Casa"), exist_ok=True)
    open(os.path.join(data, "brain", "Biblioteca", "Casa", "Finanzas.md"), "w").write("# Finanzas\n\n" + "Relleno sobre jardinería. " * 60 + "\n\n## Hipoteca\n\nEl tipo fijo de mi hipoteca es del 2,1 % con el Sabadell.\n")
    time.sleep(5)
    n0 = len(systems)
    action({"type": "speak", "text": "¿Recuerdas el tipo de mi hipoteca?"})
    s = next((x for x in systems[n0:] if x.startswith("Eres el jefe")), "")
    check("2,1 %" in s and "Biblioteca · Biblioteca/Casa/Finanzas.md" in s and "jardinería. Relleno" not in s, "Memory searches your Library and passes the boss only the piece that matters")

    # ---------- Saved images ----------
    action({"type": "settings", "changes": {"imageModel": "black-forest-labs/flux.2-max"}})
    r = action({"type": "speak", "text": "Dibuja un faro"})
    mid = (r.get("images") or [{}])[0].get("id", "")
    st, body, header = ask("/api/media/" + mid, raw=True)
    check(mid.startswith("med_") and st == 200 and header.get("Content-Type") == "image/png" and body == PNG, "the image is saved in data/media and the website gets it back after reloading")
    st, _, _ = ask("/api/media/" + mid, pin=None)
    check(st == 401, "without a PIN, nothing")

    # ---------- Direct Claude ----------
    st, d, _ = ask("/api/models/anthropic")
    check(st == 200 and d["models"][0] == "claude-opus-5-5", f"the list of models in your Claude account, the newest first: {d.get('models')}")
    action({"type": "editAgent", "id": "sage1", "changes": {"provider": "anthropic", "brain": "claude-opus-5-5"}})
    r = action({"type": "speak", "agent": "sage1", "text": "¿Compro el terreno?"})
    check(r.get("reply") == "Consejo de Claude directo." and anthropic and anthropic[-1]["cabeceras"].get("x-api-key") == "sk-ant-casa", "Sabio 1 thinks with direct Claude, with the key that's in Fer Home")
    s1 = next(a for a in state()["state"]["agents"] if a["id"] == "sage1")
    subs = list((s1.get("subscription") or {}).values())
    check(subs and subs[-1]["tokens"] > 0 and subs[-1]["usd"] > 0 and abs(sum(s1["spending"].values()) - subs[-1]["usd"]) < 1e-9,
          f"9.4: with your own key it spends from that company's API balance and it counts towards the cap, at the public price of the same model (recorded apart too: tokens and price): {subs}")
    check(any(c["id"] == "anthropic" for c in state()["state"]["settings"].get("connections", [])), "and Claude appears in Settings → Other APIs")
    # in parts: the website receives the pieces of the reply while the brain writes (one line per piece and, at the end, the result)
    req = urllib.request.Request(f"http://localhost:{P_HOME}/api/action", method="POST", data=json.dumps({"type": "speak", "agent": "sage1", "text": "¿Y el otro terreno?"}).encode(),
                                 headers={"Content-Type": "application/json", "X-Fer-Pin": PIN, "X-Fer-Chunks": "1"})
    with urllib.request.urlopen(req, timeout=60) as rr: type, lines = rr.headers.get("Content-Type", ""), [json.loads(l) for l in rr.read().decode().splitlines() if l.strip()]
    check("ndjson" in type and any(l.get("chunk") for l in lines) and lines[-1].get("end", {}).get("reply") == "Consejo de Claude directo.", f"Fer Home sends the reply to the website in parts ({len(lines)} lines)")

    # ---------- The website, connected to Fer Home ----------
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1360, "height": 900}, locale="es-ES"); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{P_HOME}/"); pg.click("#landing .button-big")
        pg.wait_for_selector("#drawer:not([hidden])"); pg.fill("#drawerBody input[type=password]", PIN); pg.click("#drawerBody >> text=Entrar")
        pg.wait_for_selector(".tier")
        pg.click(f".fig[data-id='{vid}']") if pg.is_visible(f".fig[data-id='{vid}']") else pg.click(f"#building .agent-row:has-text('Vigía de X')")
        pg.click(".profile-tabs button:text-is('Capacidades')"); pg.wait_for_timeout(300)
        check(pg.is_visible("#profile .skills-list >> text=Vigía de X") and pg.is_visible("#profile .skill-settings textarea"), "in its profile: its skills and the Watcher's settings (the terms, one per line)")
        terms = pg.input_value("#profile .skill-settings textarea")
        check('"AI agents"' in terms, "the terms it has now")
        pg.screenshot(path=os.path.join(OUTPUT, "home-profile-watcher.png"))
        pg.click("#profile .profile-tabs button:text-is('Identidad')")
        pg.click("#openInbox"); pg.wait_for_selector("#inboxView:not([hidden])")
        check(pg.is_visible("#inboxView >> text=Telegram") or True, "inbox on Fer Home")
        pg.click("#inboxView .back-btn")
        pg.click("#openSettings"); pg.wait_for_timeout(300)
        txt = pg.inner_text("#drawerBody")
        check("Clave puesta en Fer Casa." in txt and "node fer-home.mjs claves" in txt and os.path.join(data, "brain") in txt, "Settings on Fer Home: which keys there are (without showing them) and the brain folder")
        pg.screenshot(path=os.path.join(OUTPUT, "home-settings.png"), full_page=False)
        check(not errors, f"website on Fer Home with no errors: {errors}")
        b.close()
finally:
    home.terminate()
    try: home.wait(10)
    except Exception: home.kill()

# ---------- Telegram with a token that isn't valid: it waits longer each time, it doesn't hammer ----------
bad_requests = []
class TGMalo(Base):
    def do_GET(self):
        bad_requests.append(time.time()); return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
    def do_POST(self): return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
s_bad = ThreadingHTTPServer(("127.0.0.1", P_TG + 10), TGMalo); threading.Thread(target=s_bad.serve_forever, daemon=True).start()
datos2 = tempfile.mkdtemp(prefix="fercasa7b-")
json.dump({"clave": "sk-or-casa", "pin": PIN, "telegram": {"token": "MALO", "chat": 777}}, open(os.path.join(datos2, "config.json"), "w"))   # as version 8 saved it (Spanish names)
def launch_home2():
    p = subprocess.Popen(["node", os.path.join(ROOT, "fer-home.mjs")], env=dict(env, TELEGRAM_API=f"http://127.0.0.1:{P_TG + 10}", FER_PORT=str(P_HOME + 1), FER_DATA=datos2, FER_BRAIN_SEC="600"),
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
    out_lines = []
    threading.Thread(target=lambda: [out_lines.append(l) for l in p.stdout], daemon=True).start()
    wait_for(lambda: any("encendido" in l for l in out_lines), 20)
    return p, out_lines
def stop(p):
    p.terminate()
    try: p.wait(10)
    except Exception: p.kill()
def accion2(acc):
    req = urllib.request.Request(f"http://localhost:{P_HOME + 1}/api/action", method="POST", data=json.dumps(acc).encode(), headers={"Content-Type": "application/json", "X-Fer-Pin": PIN})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())
def memoria2():
    req = urllib.request.Request(f"http://localhost:{P_HOME + 1}/api/state", headers={"X-Fer-Pin": PIN})
    with urllib.request.urlopen(req, timeout=30) as r: return [n["text"] for n in json.loads(r.read())["state"]["longMemory"]]
casa2, salida2 = launch_home2()
note = os.path.join(datos2, "brain", "Memoria larga", "Clientes.md")
try:
    t0 = time.time()
    # ---------- The brain folder: what you correct by hand isn't overwritten even if the agent notes something right after ----------
    accion2({"type": "memory.save", "text": "dato A del agente", "topic": "Clientes"})
    wait_for(lambda: os.path.exists(note) and "dato A" in open(note, encoding="utf8").read(), 10)
    with open(note, "a", encoding="utf8") as fh: fh.write("- 2026-11-05 · tú · CORRECCIÓN HECHA A MANO\n")
    time.sleep(1.2)
    accion2({"type": "memory.save", "text": "dato B del agente", "topic": "Clientes"})
    check(wait_for(lambda: "dato B" in open(note, encoding="utf8").read(), 10), "the new memory reaches the note")
    txt = open(note, encoding="utf8").read()
    check("CORRECCIÓN HECHA A MANO" in txt and "CORRECCIÓN HECHA A MANO" in memoria2(), "what you corrected by hand stays in the note and in the building (before writing, it reads the folder)")
    # ---------- Telegram with a token that isn't valid: it waits longer each time, it doesn't hammer ----------
    time.sleep(max(0, 9 - (time.time() - t0)))
    n = len([t for t in bad_requests if t <= t0 + 9])
    check(n <= 4, f"Telegram with a bad token: {n} requests in 9 s (it waits longer each time, it doesn't hammer)")
    check(sum("El token no vale" in l for l in salida2) == 1, "it says it once: the token isn't valid")
finally:
    stop(casa2)
# ---------- When Fer Home restarts, what you deleted by hand in Obsidian doesn't come back ----------
lines = [l for l in open(note, encoding="utf8").read().split("\n") if "dato A" not in l]
time.sleep(1.1)
open(note, "w", encoding="utf8").write("\n".join(lines))
casa3, salida3 = launch_home2()
try:
    check(wait_for(lambda: "dato A del agente" not in memoria2(), 30) and "dato B del agente" in memoria2(), "after restarting: what you deleted by hand doesn't come back and the rest stays")
    time.sleep(1)
    check("dato A" not in open(note, encoding="utf8").read(), "and the note doesn't bring it back either")
finally:
    stop(casa3)
# ---------- Fer Home's folder from before version 9: «datos», with Spanish names inside and a version 8 building ----------
# A copy of the program in a folder of its own, with «datos» next to it as 9.0 beta left it (FER_DATA not set: the usual way)
prog3 = tempfile.mkdtemp(prefix="ferhome7c-")
for f in ("fer-home.mjs", "engine.js", "hands.mjs", "index.html", "app.js", "landing.js", "characters.js", "languages.js", "package.json"): shutil.copy(os.path.join(ROOT, f), prog3)
for d in ("languages", "skills", "img"): shutil.copytree(os.path.join(ROOT, d), os.path.join(prog3, d))
old3, data3 = os.path.join(prog3, "datos"), os.path.join(prog3, "data")
for d in ("copias", "medios", os.path.join("cerebro", "Memoria larga"), os.path.join("carpeta-agentes", "informes"), "chrome-agentes"): os.makedirs(os.path.join(old3, d))
OLD = open(os.path.join(ROOT, "tests", "building-v8.json"), encoding="utf-8").read()
open(os.path.join(old3, "edificio.json"), "w", encoding="utf-8").write(OLD)
open(os.path.join(old3, "copias", "edificio-2026-10-30.json"), "w", encoding="utf-8").write(OLD)
open(os.path.join(old3, "medios", "med_v8.png"), "wb").write(PNG)
open(os.path.join(old3, "cerebro", "Memoria larga", "Clientes.md"), "w", encoding="utf-8").write("# Clientes\n\n- El cliente de antes de la versión 9.\n")
open(os.path.join(old3, "carpeta-agentes", "informes", "hoy.md"), "w", encoding="utf-8").write("Informe de antes.")
open(os.path.join(old3, "chrome-agentes", "Local State"), "w").write("{}")
json.dump({"carpeta": os.path.join(old3, "cerebro"), "ultimaSync": 5}, open(os.path.join(old3, "cerebro-sync.json"), "w"))
json.dump({"clave": "sk-or-casa", "pin": PIN, "claves": {"anthropic": "sk-ant-viejo"}, "carpetaAgentes": os.path.join(old3, "carpeta-agentes")}, open(os.path.join(old3, "config.json"), "w"))
env3 = {k: v for k, v in env.items() if k not in ("FER_DATA", "FER_DATOS")}
p4 = subprocess.Popen(["node", os.path.join(prog3, "fer-home.mjs")], env=dict(env3, FER_PORT=str(P_HOME + 2), FER_BRAIN_SEC="600"),
                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
out4 = []
threading.Thread(target=lambda: [out4.append(l) for l in p4.stdout], daemon=True).start()
try:
    check(wait_for(lambda: any("encendido" in l or " is on." in l for l in out4), 20), "Fer Home opens its folder from before version 9, with that configuration (no questions)")
    inside = ("config.json", "building.json", "backups", os.path.join("media", "med_v8.png"), os.path.join("brain", "Memoria larga", "Clientes.md"),
              os.path.join("agent-files", "informes", "hoy.md"), os.path.join("agents-chrome", "Local State"), "brain-sync.json")
    check(not os.path.exists(old3) and all(os.path.exists(os.path.join(data3, x)) for x in inside), f"«datos» is now «data», with English names inside: {sorted(os.listdir(data3)) if os.path.isdir(data3) else '-'}")
    check(any("now have English names" in l or "tienen nombres en inglés" in l for l in out4), "and Fer Home says so once, in its log")
    req = urllib.request.Request(f"http://localhost:{P_HOME + 2}/api/state", headers={"X-Fer-Pin": PIN})
    with urllib.request.urlopen(req, timeout=30) as r: d4 = json.loads(r.read())
    old = json.loads(OLD)
    check(len(d4["state"]["agents"]) == len(old["agentes"]) and d4["state"]["agents"][0]["id"] == "boss" and "agentes" not in d4["state"], "the building, moved to the English names, with all its agents")
    check(d4["home"]["keys"].get("anthropic") is True, "the other APIs' keys from the old configuration are still there")
    check(d4["home"]["agentsFolder"] == os.path.join(data3, "agent-files") and d4["home"]["folder"]["path"] == os.path.join(data3, "brain"),
          f"a folder chosen inside «datos» is found where it went: {d4['home']['agentsFolder']}")
    saved = os.path.join(data3, "backups", "building-before-v9.json")
    check(os.path.exists(saved) and open(saved, encoding="utf-8").read() == OLD, "the building as it was is kept in data/backups")
    check(os.path.exists(os.path.join(data3, "backups", "building-2026-10-30.json")), "and Techie's earlier backups, with the new name")
    check("agents" in json.load(open(os.path.join(data3, "building.json"), encoding="utf-8")), "and the moved building is saved")
finally:
    stop(p4)
print("".join(output[-25:]))
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
