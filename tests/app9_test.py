"""Test of the desktop app (version 9) from the inside: Fer Home in app mode (FER_APP=1),
with a simulated OpenRouter and the website in a real Chromium. It checks that it can only be reached from this computer,
that the PIN goes on its own, that the key (and the other APIs' keys) are pasted in Settings and saved in data/config.json,
that the agents' Chrome can be opened to sign in to a website, and that everything comes out in English.
Usage: xvfb-run -a python3 tests/app9_test.py   (without a screen, the part that opens Chrome is skipped)"""
import json, os, re, sys, socket, subprocess, time, threading, tempfile, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.environ.get("OUTPUT", os.path.join(ROOT, "tests", "screenshots"))
os.makedirs(OUTPUT, exist_ok=True)
P_OR, P_APP = 9931, 8793
MODELS = {"data": [
  {"id": "anthropic/claude-sonnet-5.5", "name": "Claude Sonnet 5.5", "pricing": {"prompt": "0.000002", "completion": "0.00001"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 200000}]}
received = []

class OR(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        received.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELS)
        if self.path.startswith("/api/v1/generation"): return self._resp(200, {"data": {"total_cost": 0.0007}})
        if self.path == "/web": return self._resp(200, b"<html><title>Una web</title><body>Hola</body></html>", "text/html")
        self._resp(404, {"error": {"message": "no"}})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        received.append(("POST", self.path, self.headers.get("Authorization")))
        if self.path == "/api/v1/chat/completions":
            b = json.loads(raw)
            return self._resp(200, {"model": b["model"], "choices": [{"message": {"content": "Hello from the app."}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.0005}})
        if self.path == "/api/alpha/decisions":
            return self._resp(200, {"answers": {"decision": {"choice": "go_ahead", "probabilities": {"go_ahead": 0.9}}}, "usage": {"cost": 0.00002}})
        self._resp(404, {"error": {"message": "no"}})

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def ask(rel_path, method="GET", body=None, pin=None, host="127.0.0.1"):
    req = urllib.request.Request(f"http://{host}:{P_APP}{rel_path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-Fer-Pin": pin} if pin else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)
def outside_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(("10.255.255.255", 1)); return s.getsockname()[0]
    except Exception: return ""
    finally: s.close()
SPANISH = re.compile(r"[áéíóúñ¿¡]|\b(el|la|los|las|del|que|para|por|con|una|tus|está|clave|guardar|ajustes|edificio|agentes|este|esta|aplicación|ordenador)\b", re.I)

srv = ThreadingHTTPServer(("127.0.0.1", P_OR), OR); threading.Thread(target=srv.serve_forever, daemon=True).start()
data = tempfile.mkdtemp(prefix="feragent-app-")
env = dict(os.environ, FER_APP="1", OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", FER_PORT=str(P_APP), FER_DATA=data, FER_HEARTBEAT_SEC="1",
           FER_LANGUAGE="en", FER_CHROME_CHANNEL="chromium")
for k in ("OPENROUTER_API_KEY", "FER_PIN"): env.pop(k, None)
app = subprocess.Popen(["node", os.path.join(ROOT, "fer-home.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
output = []
threading.Thread(target=lambda: [output.append(l) for l in app.stdout], daemon=True).start()
try:
    for _ in range(100):
        try:
            if ask("/api/hello")[0] == 200: break
        except Exception: pass
        time.sleep(0.2)
    # ---------- the app's server ----------
    st, body, _ = ask("/api/hello")
    hello = json.loads(body)
    check(st == 200 and hello.get("app") is True and hello.get("ferHome") is True, f"it starts without asking anything and says it's the app: {hello}")
    conf = json.load(open(os.path.join(data, "config.json")))
    check(len(conf.get("pin", "")) >= 24 and not conf.get("key"), f"it creates the PIN itself (length: {len(conf.get('pin', ''))}) and there's no key yet")
    check(oct(os.stat(os.path.join(data, "config.json")).st_mode & 0o777) == "0o600", "config.json, only this user can read it (600)")
    ip = outside_ip()
    if ip and not ip.startswith("127."):
        try: ask("/api/hello", host=ip); outside = True
        except Exception: outside = False
        check(not outside, f"it can only be reached from this computer: from {ip} it doesn't answer")
    else: print("(no network address to test from outside)")
    PIN = conf["pin"]
    check(ask("/app/signin?t=otro")[0] == 403 and ask("/api/state")[0] == 401, "with another PIN, nothing: /app/signin 403 and the API 401")
    st, _, _ = ask("/api/conf/key", "POST", {"key": "sk-or-v1-zzzzzzzzzzzzzzzz"})
    check(st == 401, "saving the key without the PIN: no")
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
        page = ctx.new_page(); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{P_APP}/app/signin?t={PIN}")
        page.wait_for_selector("#landing .hero-txt")
        check(page.evaluate("localStorage.getItem('ferAgent.pin')") == PIN and page.url.rstrip("/").endswith(str(P_APP)), "the window goes in with its PIN on its own and stays on the home page")
        page.wait_for_timeout(1500)
        page.click("#landing .button-big >> nth=0")
        page.wait_for_selector("#drawer:not([hidden]) #drawerBody h4", timeout=15000)
        check(page.inner_text("#mode") == "In this app · works while it's open", f"arriba: «{page.inner_text('#mode')}»")
        aj = page.inner_text("#drawerBody")
        check("In this app" in aj and page.is_visible("#drawerBody .where .here:has-text('In this app')") and data in aj, "Settings → where it lives: “In this app”, marked, with the data folder")
        check("Your OpenRouter key" in aj and "No key yet?" in aj and "Fer Home PIN" not in aj and "PIN" not in page.inner_text("#drawerBody h4 >> nth=1"), "without a key, Settings opens with “Your OpenRouter key” and the steps; no PIN is asked for")
        check("Your websites, in the agents' Chrome" in aj, "and the block to sign in to your websites with the agents' Chrome")
        bad = [l for l in aj.split("\n") if SPANISH.search(re.sub(r"Fer Agent|Fer Home|fer-home\.mjs|ES · Español|Español|Biblioteca|Memoria larga|edificio\.json|Fernando Villar Peláez|" + re.escape(data), "", l))]
        check(not bad, f"Settings, in English: {bad[:3]}")
        page.screenshot(path=os.path.join(OUTPUT, "app9-settings.png"))
        # a key that isn't one
        key = page.locator("#drawerBody .block:has(h4:text-is('Your OpenRouter key')) input[type=password]")
        key.fill("hola"); page.click("#drawerBody .block:has(h4:text-is('Your OpenRouter key')) button:text-is('Save')"); page.wait_for_timeout(500)
        check("That doesn't look like an OpenRouter key" in page.inner_text("#toast"), f"a key that isn't one: “{page.inner_text('#toast')[:70]}”")
        # the good one
        key.fill("sk-or-v1-abcdefghijklmnop"); page.click("#drawerBody .block:has(h4:text-is('Your OpenRouter key')) button:text-is('Save')"); page.wait_for_timeout(800)
        conf = json.load(open(os.path.join(data, "config.json")))
        check(conf.get("key") == "sk-or-v1-abcdefghijklmnop" and conf.get("pin") == PIN, "the key is saved in data/config.json (and the PIN stays the same)")
        check("Key saved on this computer." in page.inner_text("#toast") and page.is_hidden("#drawer"), "“Key saved on this computer.” and Settings closes")
        check("sk-or-v1-abcdefghijklmnop" not in page.evaluate("JSON.stringify(localStorage)"), "the key doesn't stay in the website (only in config.json)")
        # talking to the boss
        page.click("#talkToBoss"); page.wait_for_selector("#chatView:not([hidden])")
        page.fill("#messageInput", "Hello"); page.keyboard.press("Enter")
        page.wait_for_selector("#messages .msg.bot:not(.greeting) .meta", timeout=20000)
        check("Hello from the app." in page.inner_text("#messages"), "the boss answers with the key set")
        check(any(m == "POST" and r == "/api/v1/chat/completions" and a == "Bearer sk-or-v1-abcdefghijklmnop" for m, r, a in received), "the key pasted in Settings reaches OpenRouter")
        page.click("#closeChat")
        # another API: Claude, with its key
        page.click("#openSettings"); page.wait_for_selector("#drawerBody h4")
        page.click("#drawerBody button:text-is('+ Claude (Anthropic)')"); page.wait_for_timeout(600)
        row = page.locator("#drawerBody .api-row:has-text('Claude (Anthropic)')")
        row.locator("input[type=password]").fill("sk-ant-prueba-123"); row.locator("button:text-is('Save')").click(); page.wait_for_timeout(800)
        conf = json.load(open(os.path.join(data, "config.json")))
        check((conf.get("keys") or {}).get("anthropic") == "sk-ant-prueba-123", "Claude's key is pasted in Settings and saved in config.json")
        check("key set" in page.inner_text("#drawerBody .api-row:has-text('Claude (Anthropic)')"), "and the row says “key set”")
        # signing in to a website with the agents' Chrome
        web = page.locator("#drawerBody .block:has(h4:text-is(\"Your websites, in the agents' Chrome\"))")
        web.locator("input").fill("mail.google.com"); web.locator("button:text-is('Open')").click(); page.wait_for_timeout(500)
        check("Write the full address" in page.inner_text("#toast"), f"without https://, it explains: “{page.inner_text('#toast')[:60]}”")
        if os.environ.get("DISPLAY"):
            web.locator("input").fill(f"http://127.0.0.1:{P_OR}/web"); web.locator("button:text-is('Open')").click(); page.wait_for_timeout(6000)
            notice = page.inner_text("#toast")
            check("The agents' Chrome is open" in notice and os.path.isdir(os.path.join(data, "agents-chrome")), f"with the full address the agents' Chrome opens (its profile, in data): “{notice[:60]}”")
        else: print("(no screen: opening the agents' Chrome is not tested)")
        # the brain: its folder (in a normal browser there's no button to choose it; in the app, there is)
        brain_text = page.inner_text("#drawerBody")
        check("In the app, the brain lives in a folder on this computer" in brain_text and os.path.join(data, "brain") in brain_text and not page.is_visible("#drawerBody button:text-is('Change the folder')"),
              "Settings → brain: the app's folder (and no button outside the app)")
        another = tempfile.mkdtemp(prefix="cerebro-")
        st1, c1, _ = ask("/api/conf/folder", "POST", {"path": "/no/existe/esto"}, pin=PIN)
        st2, c2, _ = ask("/api/conf/folder", "POST", {"path": another}, pin=PIN)
        conf = json.load(open(os.path.join(data, "config.json")))
        check(st1 == 400 and st2 == 200 and json.loads(c2).get("restart") and conf.get("brainFolder") == another, "choosing another folder: one that doesn't exist, no; the good one is saved (used when reopening)")
        # ---------- v9: the mailbox for the Email agent, in Settings → Email (in the app the password is pasted here) ----------
        mail = subprocess.Popen(["node", os.path.join(ROOT, "tests", "mail-servers.mjs")], env=dict(os.environ, FAKE_IMAP_PORT="9243", FAKE_SMTP_PORT="9625"),
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            check(json.loads(mail.stdout.readline()).get("ready"), "a fake mailbox on this computer (IMAP and SMTP)")
            em = page.locator("#drawerBody .block:has(h4:text-is('Email'))")
            em.locator("button:text-is('Connect a mailbox')").click(); page.wait_for_timeout(300)   # 9.2: as many mailboxes as you like
            em.locator("input[type=email]").fill("office@acme.example"); em.locator("input[type=email]").press("Tab")
            check(em.locator("input[placeholder='imap.yourdomain.com']").input_value() == "imap.acme.example" and em.locator("input[placeholder='smtp.yourdomain.com']").input_value() == "smtp.acme.example",
                  "the servers are guessed from the address")
            em.locator("input[type=password]").fill("app-password-1")
            em.locator("input[placeholder='imap.yourdomain.com']").fill("127.0.0.1"); em.locator("input[placeholder='993']").fill("9243")
            em.locator("input[placeholder='smtp.yourdomain.com']").fill("127.0.0.1"); em.locator("input[placeholder='465']").fill("9625")
            em.locator("button:text-is('Save')").click(); page.wait_for_timeout(1000)
            conf = json.load(open(os.path.join(data, "config.json")))
            mb = (conf.get("mailboxes") or [{}])[0]
            check(mb.get("id") == "main" and mb.get("address") == "office@acme.example" and mb.get("password") == "app-password-1" and mb.get("imapPort") == 9243 and mb.get("smtpPort") == 9625,
                  f"the mailbox is saved in config.json, only on this computer: {dict((k, v) for k, v in mb.items() if k != 'password')}")
            # a second mailbox
            em.locator("button:text-is('Add another mailbox')").click(); page.wait_for_timeout(300)
            em.locator("input[type=email]").fill("sales@acme.example"); em.locator("input[type=email]").press("Tab")
            em.locator("input[type=password]").fill("app-password-2")
            em.locator("input[placeholder='imap.yourdomain.com']").fill("127.0.0.1"); em.locator("input[placeholder='993']").fill("9243")
            em.locator("input[placeholder='smtp.yourdomain.com']").fill("127.0.0.1"); em.locator("input[placeholder='465']").fill("9625")
            em.locator("button:text-is('Save')").click(); page.wait_for_timeout(1000)
            conf = json.load(open(os.path.join(data, "config.json")))
            boxes = conf.get("mailboxes") or []
            check([m.get("address") for m in boxes] == ["office@acme.example", "sales@acme.example"] and len({m.get("id") for m in boxes}) == 2 and boxes[1].get("password") == "app-password-2" and not conf.get("email"),
                  f"9.2: a second mailbox, with its own id: {[(m.get('id'), m.get('address')) for m in boxes]}")
            check(em.locator(".mailbox").count() == 2, "and Settings lists both")
            st, body, _ = ask("/api/state", pin=PIN)
            body = body.decode() if isinstance(body, bytes) else body
            check("app-password-1" not in body and "app-password-2" not in body and [m.get("address") for m in json.loads(body)["home"].get("mailboxes") or []] == ["office@acme.example", "sales@acme.example"], "the website only sees the addresses, never the passwords")
            em.locator(".mailbox >> nth=0").locator("button:text-is('Check')").click()
            page.wait_for_function("() => [...document.querySelectorAll('#drawerBody .block small.note')].some((x) => /^(It works|The mailbox|The server|I couldn't|No mailbox)/.test(x.textContent))", timeout=20000)
            result = [t for t in em.locator("small.note").all_inner_texts() if t.startswith(("It works", "The mailbox", "The server", "I couldn't", "No mailbox"))]
            check(result == ["It works: it can read and send (1 emails in the inbox)."], f"«Check»: it signs in to read and to send: {result}")
            page.screenshot(path=os.path.join(OUTPUT, "app9-email.png"))
        finally:
            mail.stdin.close(); mail.wait(timeout=10)
        check(not errors, f"no errors on the page: {errors[:3]}")
        b.close()
    # on closing, it saves
    app.terminate(); app.wait(timeout=20)
    e = json.load(open(os.path.join(data, "building.json")))
    check(e.get("language") == "en" and e["agents"][0]["name"] == "Boss", "on quitting the building stays saved (in English: Boss)")
finally:
    if app.poll() is None: app.kill()
    srv.shutdown()
    if not ok: print("".join(output[-30:]))
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
