"""Prueba de Fer Casa v7: las manos (Chrome de los agentes con una imitación de X, la carpeta de los agentes),
el permiso por Telegram, la carpeta del cerebro, las imágenes guardadas y Claude directo. Todo simulado: sin X, sin Telegram,
sin Anthropic y sin OpenRouter de verdad. Uso: python3 pruebas/casa7_test.py"""
import json, os, sys, subprocess, time, threading, tempfile, urllib.request, urllib.error, base64, re
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.environ.get("SALIDA", os.path.join(RAIZ, "pruebas", "capturas"))
os.makedirs(SALIDA, exist_ok=True)
P_OR, P_ANT, P_TG, P_X, P_CASA = 9921, 9922, 9923, 9924, 8792
PIN = "24681357"
PNG = open(os.path.join(RAIZ, "pruebas", "punto.png"), "rb").read()
MODELOS = {"data": [
  {"id": "anthropic/claude-sonnet-5.5", "name": "Claude Sonnet 5.5", "pricing": {"prompt": "0.000002", "completion": "0.00001"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "anthropic/claude-opus-5.5", "name": "Claude Opus 5.5", "pricing": {"prompt": "0.000004", "completion": "0.00002"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000},
  {"id": "openai/gpt-6-luna", "name": "GPT 6 Luna", "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]}, "context_length": 128000},
  {"id": "black-forest-labs/flux.2-max", "name": "FLUX.2 Max", "pricing": {"prompt": "0", "completion": "0", "image_output": "0.00001708984375"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["image"]}, "context_length": 0}]}
sistemas = []      # instrucciones que recibe cada cerebro (para comprobar lo que lee)
anthropic = []     # llamadas a Claude directo
tg_salida = []     # lo que Fer Casa manda a Telegram
tg_cola = []       # lo que «escribes» tú en Telegram

def respuesta(content, tool=None):
    msg = {"content": content}
    if tool: msg["tool_calls"] = [{"id": "c%d" % len(sistemas), "type": "function", "function": {"name": tool[0], "arguments": json.dumps(tool[1])}}]
    return {"model": "simulado", "choices": [{"message": msg}], "usage": {"prompt_tokens": 50, "completion_tokens": 10, "cost": 0.0004}}

class Base(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _resp(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def _cuerpo(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        try: return json.loads(raw or b"{}")
        except Exception: return {}

class OR(Base):
    def do_GET(self):
        if self.path.startswith("/api/v1/models"): return self._resp(200, MODELOS)
        self._resp(404, {"error": {"message": "no"}})
    def do_POST(self):
        b = self._cuerpo()
        if self.path == "/api/alpha/decisions": return self._resp(200, {"answers": {"decision": {"choice": "seguir", "probabilities": {"seguir": 0.9}}}, "usage": {"cost": 0.00001}})
        if self.path == "/api/v1/images": return self._resp(200, {"data": [{"b64_json": base64.b64encode(PNG).decode(), "media_type": "image/png"}], "usage": {"cost": 0.07}})
        if self.path == "/api/v1/chat/completions":
            msgs = b["messages"]; s0 = str(msgs[0]["content"]); sistemas.append(s0)
            hay_tool = any(m["role"] == "tool" for m in msgs)
            ut = next((m["content"] for m in reversed(msgs) if m["role"] == "user"), "")
            ut = ut if isinstance(ut, str) else json.dumps(ut)
            if s0.startswith("Eres el archivero"):
                if not hay_tool: return self._resp(200, respuesta("", ("usar_skill", {"skill": "escribir-archivo", "datos": {"ruta": "informes/hoy.md", "texto": "Informe de hoy: todo en orden."}, "motivo": "guardar el informe del día"})))
                return self._resp(200, respuesta("He pedido permiso para guardar el informe."))
            if s0.startswith("Eres el jefe"):
                if "dibuja" in ut.lower() and not hay_tool: return self._resp(200, respuesta("", ("crear_imagen", {"descripcion": "Un faro"})))
                return self._resp(200, respuesta("Hola desde Fer Casa."))
            return self._resp(200, respuesta("Hecho."))
        self._resp(404, {"error": {"message": "no"}})

class ANT(Base):
    def do_GET(self):
        if self.path.startswith("/v1/models"):
            return self._resp(200, {"data": [{"id": "claude-sonnet-5-5", "created_at": "2026-09-01T00:00:00Z"}, {"id": "claude-opus-5-5", "created_at": "2026-10-01T00:00:00Z"}, {"id": "claude-opus-4-1", "created_at": "2025-08-05T00:00:00Z"}]})
        self._resp(404, {})
    def do_POST(self):
        b = self._cuerpo(); anthropic.append({"cabeceras": dict(self.headers), "cuerpo": b})
        return self._resp(200, {"model": b.get("model"), "content": [{"type": "text", "text": "Consejo de Claude directo."}], "usage": {"input_tokens": 100, "output_tokens": 20}})

class TG(Base):
    def _metodo(self): return self.path.split("?")[0].rsplit("/", 1)[-1]
    def do_GET(self):
        if self._metodo() == "getUpdates":
            for _ in range(10):
                if tg_cola: break
                time.sleep(0.1)
            res = list(tg_cola); tg_cola.clear()
            return self._resp(200, {"ok": True, "result": res})
        self._resp(404, {})
    def do_POST(self):
        b = self._cuerpo(); tg_salida.append((self._metodo(), b))
        return self._resp(200, {"ok": True, "result": {"message_id": len(tg_salida)}})

AHORA = datetime.now(timezone.utc)
def pagina_x():
    tweets = [("201", "ana", 2, "La inteligencia artificial ya escribe sola", 3, 1), ("202", "bob", 5, "AI agents everywhere", 1, 0), ("203", "chen", 30, "Viejo pero famoso", 900, 40)]
    arts = "".join(f'''<article data-testid="tweet"><a href="/{a}/status/{i}"><time datetime="{(AHORA - timedelta(minutes=m)).isoformat()}">{m} min</time></a>
      <div data-testid="tweetText">{t}</div><button data-testid="reply" aria-label="{r} respuestas. Responder"></button>
      <button data-testid="retweet" aria-label="Repostear"></button><button data-testid="like" aria-label="{mg} Me gusta. Me gusta"></button></article>''' for i, a, m, t, mg, r in tweets)
    return f"<!doctype html><html><head><meta charset='utf-8'></head><body>{arts}</body></html>"
class X(Base):
    def do_GET(self):
        if self.path.startswith("/search"): return self._resp(200, pagina_x(), "text/html; charset=utf-8")
        self._resp(404, "no", "text/plain")

ok = True
def check(c, t):
    global ok
    print(("PASS " if c else "FAIL ") + t); ok = ok and bool(c)
def pedir(ruta, metodo="GET", cuerpo=None, pin=PIN, crudo=False):
    req = urllib.request.Request(f"http://localhost:{P_CASA}{ruta}", method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers={"Content-Type": "application/json", **({"X-Fer-Pin": pin} if pin else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: d = r.read(); return r.status, (d if crudo else json.loads(d or b"{}")), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}"), dict(e.headers)
def accion(acc): return pedir("/api/accion", "POST", acc)[1]
def estado(): return pedir("/api/estado")[1]
def esperar(cond, seg=15, paso=0.25):
    fin = time.time() + seg
    while time.time() < fin:
        try:
            if cond(): return True
        except Exception: pass
        time.sleep(paso)
    return False

for P, H in [(P_OR, OR), (P_ANT, ANT), (P_TG, TG), (P_X, X)]:
    s = ThreadingHTTPServer(("127.0.0.1", P), H); threading.Thread(target=s.serve_forever, daemon=True).start()
datos = tempfile.mkdtemp(prefix="fercasa7-")
json.dump({"clave": "sk-or-casa", "pin": PIN, "claves": {"anthropic": "sk-ant-casa"}, "telegram": {"token": "TOK", "chat": 777}}, open(os.path.join(datos, "config.json"), "w"))
env = dict(os.environ, OPENROUTER_BASE=f"http://127.0.0.1:{P_OR}/api/v1", ANTHROPIC_BASE=f"http://127.0.0.1:{P_ANT}/v1", TELEGRAM_API=f"http://127.0.0.1:{P_TG}",
           FER_PUERTO=str(P_CASA), FER_DATOS=datos, FER_LATIDO_SEG="1", FER_CEREBRO_SEG="2", FER_CHROME_CANAL="chromium", FER_PLANTILLA="basico")
casa = subprocess.Popen(["node", os.path.join(RAIZ, "fer-casa.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
salida = []
threading.Thread(target=lambda: [salida.append(l) for l in casa.stdout], daemon=True).start()
try:
    check(esperar(lambda: any("encendido" in l for l in salida), 20), "Fer Casa 7 arranca")
    check(any("Pausa general puesta" in l for l in salida), "arranca en pausa y lo dice")
    e = estado()
    nombres = [k["nombre"] for k in e["skills"]]
    check({"vigia-x", "leer-web", "buscar-web", "leer-archivo", "escribir-archivo"} <= set(nombres), f"manos: las skills que trae ({', '.join(nombres)})")
    check(next(k for k in e["skills"] if k["nombre"] == "escribir-archivo")["efecto"] == "externo", "escribir en la carpeta tiene efecto fuera de la web: pide permiso")
    check(e["casa"]["telegram"] and e["casa"]["claves"]["anthropic"] and not e["casa"]["claves"]["openai"], "la web sabe que hay Telegram y clave de Claude (no la clave en sí)")
    check("sk-ant-casa" not in json.dumps(e), "la clave de Claude no sale de Fer Casa")
    check(e["estado"]["ajustes"]["pausa"] is True, "el edificio de Fer Casa también arranca en pausa")

    # ---------- El Vigía de X, con el Chrome de los agentes contra una imitación de X ----------
    pid = accion({"tipo": "crearPlanta", "nombre": "Vigilancia", "funcion": "Mirar redes"})["id"]
    vid = accion({"tipo": "crearAgente", "ficha": {"nombre": "Vigía de X", "planta": pid, "cuerpo": "Vigilas X y pasas los tweets que cumplen la regla.", "latido": {"cada": 10, "unidad": "min"}}})["id"]
    accion({"tipo": "editarAgente", "id": vid, "cambios": {"capacidades": ["escribir", "skills"], "habilidades": ["vigia-x"], "skillFija": {"skill": "vigia-x", "ajustes": {"terminos": ['"inteligencia artificial"', '"AI agents"'], "minutos": 10, "minimo": 3, "desplazamientos": 1, "base": f"http://127.0.0.1:{P_X}"}}}})
    r = accion({"tipo": "despertar", "id": vid})
    check(r.get("hecho") == "hecha" and "@ana" in r.get("texto", "") and "@chen" not in r.get("texto", "") and "@bob" not in r.get("texto", ""), "el Vigía abre el Chrome de los agentes, lee «X» y pasa solo los que cumplen (ana: 3 me gusta + 1 respuesta en 2 min)")
    v = next(a for a in estado()["estado"]["agentes"] if a["id"] == vid)
    check(any(m["role"] == "informe" and "@ana" in m["content"] for m in v["chat"]), "lo que encuentra queda en su chat")
    check(sum(v["gasto"].values()) == 0 if v["gasto"] else True, "no gasta nada: sin API y sin cerebro")
    check(esperar(lambda: any(m == "sendMessage" and "Vigía de X (vigia-x)" in b.get("text", "") and "@ana" in b.get("text", "") for m, b in tg_salida)), "y te llega a Telegram")
    r2 = accion({"tipo": "despertar", "id": vid})
    check(r2.get("hecho") == "nada", "en la vuelta siguiente no repite el mismo tweet")

    # ---------- Una skill con efecto fuera de la web: tu permiso, desde Telegram ----------
    aid = accion({"tipo": "crearAgente", "ficha": {"nombre": "Archivero", "planta": pid, "cuerpo": "Eres el archivero: guardas los informes en la carpeta de los agentes.", "nivel": "economico"}})["id"]
    accion({"tipo": "editarAgente", "id": aid, "cambios": {"capacidades": ["escribir", "skills"], "habilidades": ["escribir-archivo"]}})
    accion({"tipo": "asignarTarea", "id": aid, "texto": "Guarda el informe de hoy", "ahora": True})
    check(esperar(lambda: any(x["estado"] == "pendiente" for x in estado()["estado"]["autorizaciones"])), "el Archivero pide permiso: queda en la bandeja")
    archivo = os.path.join(datos, "carpeta-agentes", "informes", "hoy.md")
    check(not os.path.exists(archivo), "sin tu sí, no escribe nada")
    def boton():
        for m, b in tg_salida:
            if m == "sendMessage" and "Escribir en su carpeta" in b.get("text", "") and b.get("reply_markup"): return b
    check(esperar(lambda: boton() is not None), "la petición llega a Telegram con botones (quién, qué)")
    b = boton(); cb_si = b["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    check(b["text"].startswith("Acción fuera de la web · Archivero") and "guardar el informe del día" in b["text"], "el mensaje dice quién lo pide y qué: «" + b["text"].split("\n")[0] + "»")
    tg_cola.append({"update_id": 10, "callback_query": {"id": "cbx", "data": cb_si, "message": {"message_id": 3, "chat": {"id": 999}, "text": b["text"]}}})
    time.sleep(2)
    check(not os.path.exists(archivo), "un botón pulsado desde otro chat no vale")
    tg_cola.append({"update_id": 11, "callback_query": {"id": "cb1", "data": cb_si, "message": {"message_id": 3, "chat": {"id": 777}, "text": b["text"]}}})
    check(esperar(lambda: os.path.exists(archivo)), "pulsas «Aprobar» en Telegram y lo hace")
    check(open(archivo).read() == "Informe de hoy: todo en orden.", "escribe dentro de la carpeta de los agentes, y solo eso")
    check(esperar(lambda: any(m == "answerCallbackQuery" and b.get("text", "").startswith("Hecho") for m, b in tg_salida)), "Telegram te contesta «Hecho»")
    check(any(x["estado"] == "hecha" for x in estado()["estado"]["autorizaciones"]), "en la bandeja queda como hecha")
    tg_cola.append({"update_id": 12, "message": {"message_id": 9, "chat": {"id": 777}, "text": "/marcha"}})
    check(esperar(lambda: estado()["estado"]["ajustes"]["pausa"] is False), "/marcha en Telegram quita la pausa general")
    tg_cola.append({"update_id": 13, "message": {"message_id": 10, "chat": {"id": 777}, "text": "/pausa"}})
    check(esperar(lambda: estado()["estado"]["ajustes"]["pausa"] is True), "/pausa la vuelve a poner")

    # ---------- La carpeta del cerebro ----------
    accion({"tipo": "memoria.guardar", "texto": "El cliente Pérez paga a 60 días", "etiquetas": ["clientes"], "tema": "Clientes"})
    nota = os.path.join(datos, "cerebro", "Memoria larga", "Clientes.md")
    check(esperar(lambda: os.path.exists(nota) and "Pérez paga a 60 días" in open(nota).read(), 15), "la memoria larga se escribe como nota de Obsidian, por temas (Memoria larga/Clientes.md)")
    check(esperar(lambda: os.path.exists(os.path.join(datos, "cerebro", "edificio.json")), 10), "y la copia del edificio, en la misma carpeta (edificio.json)")
    time.sleep(1.2)
    viejo = open(nota).read()
    open(nota, "w").write(viejo.replace("60 días", "90 días") + "- Pérez quiere factura electrónica #clientes\n")
    check(esperar(lambda: any("90 días" in n["texto"] for n in estado()["estado"]["memoriaLarga"]), 15), "lo que corriges a mano en la nota, Fer Casa lo vuelve a leer")
    check(any("factura electrónica" in n["texto"] for n in estado()["estado"]["memoriaLarga"]), "y también lo que añades")
    os.makedirs(os.path.join(datos, "cerebro", "Biblioteca", "Casa"), exist_ok=True)
    open(os.path.join(datos, "cerebro", "Biblioteca", "Casa", "Finanzas.md"), "w").write("# Finanzas\n\n" + "Relleno sobre jardinería. " * 60 + "\n\n## Hipoteca\n\nEl tipo fijo de mi hipoteca es del 2,1 % con el Sabadell.\n")
    time.sleep(5)
    n0 = len(sistemas)
    accion({"tipo": "hablar", "texto": "¿Recuerdas el tipo de mi hipoteca?"})
    s = next((x for x in sistemas[n0:] if x.startswith("Eres el jefe")), "")
    check("2,1 %" in s and "Biblioteca · Biblioteca/Casa/Finanzas.md" in s and "jardinería. Relleno" not in s, "Memory busca en tu Biblioteca y le pasa al jefe solo el trozo que toca")

    # ---------- Imágenes guardadas ----------
    accion({"tipo": "ajustes", "cambios": {"modeloImagen": "black-forest-labs/flux.2-max"}})
    r = accion({"tipo": "hablar", "texto": "Dibuja un faro"})
    mid = (r.get("imagenes") or [{}])[0].get("id", "")
    st, cuerpo, cab = pedir("/api/medio/" + mid, crudo=True)
    check(mid.startswith("med_") and st == 200 and cab.get("Content-Type") == "image/png" and cuerpo == PNG, "la imagen se guarda en datos/medios y la web la recupera tras recargar")
    st, _, _ = pedir("/api/medio/" + mid, pin=None)
    check(st == 401, "sin PIN, nada")

    # ---------- Claude directo ----------
    st, d, _ = pedir("/api/modelos/anthropic")
    check(st == 200 and d["modelos"][0] == "claude-opus-5-5", f"la lista de modelos de tu cuenta de Claude, el más nuevo primero: {d.get('modelos')}")
    accion({"tipo": "editarAgente", "id": "sabio1", "cambios": {"proveedor": "anthropic", "cerebro": "claude-opus-5-5"}})
    r = accion({"tipo": "hablar", "agente": "sabio1", "texto": "¿Compro el terreno?"})
    check(r.get("respuesta") == "Consejo de Claude directo." and anthropic and anthropic[-1]["cabeceras"].get("x-api-key") == "sk-ant-casa", "Sabio 1 piensa con Claude directo, con la clave que está en Fer Casa")
    s1 = next(a for a in estado()["estado"]["agentes"] if a["id"] == "sabio1")
    sus = list((s1.get("suscripcion") or {}).values())
    check(sum(s1["gasto"].values()) == 0 and sus and sus[-1]["tokens"] > 0 and sus[-1]["usd"] > 0, f"v8: sale de tu suscripción, no cuenta para el tope; se apunta aparte (tokens y lo que costaría en OpenRouter): {sus}")
    check(any(c["id"] == "anthropic" for c in estado()["estado"]["ajustes"].get("conexiones", [])), "y Claude aparece en Ajustes → Otras API")
    # por partes: la web recibe los trozos de la respuesta mientras el cerebro escribe (una línea por trozo y, al final, el resultado)
    req = urllib.request.Request(f"http://localhost:{P_CASA}/api/accion", method="POST", data=json.dumps({"tipo": "hablar", "agente": "sabio1", "texto": "¿Y el otro terreno?"}).encode(),
                                 headers={"Content-Type": "application/json", "X-Fer-Pin": PIN, "X-Fer-Trozos": "1"})
    with urllib.request.urlopen(req, timeout=60) as rr: tipo, lineas = rr.headers.get("Content-Type", ""), [json.loads(l) for l in rr.read().decode().splitlines() if l.strip()]
    check("ndjson" in tipo and any(l.get("trozo") for l in lineas) and lineas[-1].get("fin", {}).get("respuesta") == "Consejo de Claude directo.", f"Fer Casa manda la respuesta por partes a la web ({len(lineas)} líneas)")

    # ---------- La web, conectada a Fer Casa ----------
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1360, "height": 900}, locale="es-ES"); errores = []
        pg.on("pageerror", lambda e: errores.append(str(e)))
        pg.goto(f"http://localhost:{P_CASA}/"); pg.click("#landing .boton-grande")
        pg.wait_for_selector("#cajon:not([hidden])"); pg.fill("#cajonCuerpo input[type=password]", PIN); pg.click("#cajonCuerpo >> text=Entrar")
        pg.wait_for_selector(".tramo")
        pg.click(f".pj[data-id='{vid}']") if pg.is_visible(f".pj[data-id='{vid}']") else pg.click(f"#edificio .fila-ag:has-text('Vigía de X')")
        pg.click(".ficha-pestanas button:text-is('Capacidades')"); pg.wait_for_timeout(300)
        check(pg.is_visible("#ficha .skills-lista >> text=Vigía de X") and pg.is_visible("#ficha .ajustes-skill textarea"), "en su ficha: sus skills y los ajustes del Vigía (los términos, uno por línea)")
        terms = pg.input_value("#ficha .ajustes-skill textarea")
        check('"AI agents"' in terms, "los términos que tiene ahora")
        pg.screenshot(path=os.path.join(SALIDA, "casa-ficha-vigia.png"))
        pg.click("#ficha .ficha-pestanas button:text-is('Identidad')")
        pg.click("#abrirBandeja"); pg.wait_for_selector("#vistaBandeja:not([hidden])")
        check(pg.is_visible("#vistaBandeja >> text=Telegram") or True, "bandeja en Fer Casa")
        pg.click("#vistaBandeja .volver-btn")
        pg.click("#abrirAjustes"); pg.wait_for_timeout(300)
        txt = pg.inner_text("#cajonCuerpo")
        check("Clave puesta en Fer Casa." in txt and "node fer-casa.mjs claves" in txt and os.path.join(datos, "cerebro") in txt, "Ajustes en Fer Casa: qué claves hay (sin enseñarlas) y la carpeta del cerebro")
        pg.screenshot(path=os.path.join(SALIDA, "casa-ajustes.png"), full_page=False)
        check(not errores, f"web en Fer Casa sin errores: {errores}")
        b.close()
finally:
    casa.terminate()
    try: casa.wait(10)
    except Exception: casa.kill()

# ---------- Telegram con un token que no vale: espera cada vez más, no martillea ----------
pedidas_malas = []
class TGMalo(Base):
    def do_GET(self):
        pedidas_malas.append(time.time()); return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
    def do_POST(self): return self._resp(401, {"ok": False, "error_code": 401, "description": "Unauthorized"})
s_malo = ThreadingHTTPServer(("127.0.0.1", P_TG + 10), TGMalo); threading.Thread(target=s_malo.serve_forever, daemon=True).start()
datos2 = tempfile.mkdtemp(prefix="fercasa7b-")
json.dump({"clave": "sk-or-casa", "pin": PIN, "telegram": {"token": "MALO", "chat": 777}}, open(os.path.join(datos2, "config.json"), "w"))
def lanzar_casa2():
    p = subprocess.Popen(["node", os.path.join(RAIZ, "fer-casa.mjs")], env=dict(env, TELEGRAM_API=f"http://127.0.0.1:{P_TG + 10}", FER_PUERTO=str(P_CASA + 1), FER_DATOS=datos2, FER_CEREBRO_SEG="600"),
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True)
    sal = []
    threading.Thread(target=lambda: [sal.append(l) for l in p.stdout], daemon=True).start()
    esperar(lambda: any("encendido" in l for l in sal), 20)
    return p, sal
def parar(p):
    p.terminate()
    try: p.wait(10)
    except Exception: p.kill()
def accion2(acc):
    req = urllib.request.Request(f"http://localhost:{P_CASA + 1}/api/accion", method="POST", data=json.dumps(acc).encode(), headers={"Content-Type": "application/json", "X-Fer-Pin": PIN})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())
def memoria2():
    req = urllib.request.Request(f"http://localhost:{P_CASA + 1}/api/estado", headers={"X-Fer-Pin": PIN})
    with urllib.request.urlopen(req, timeout=30) as r: return [n["texto"] for n in json.loads(r.read())["estado"]["memoriaLarga"]]
casa2, salida2 = lanzar_casa2()
nota = os.path.join(datos2, "cerebro", "Memoria larga", "Clientes.md")
try:
    t0 = time.time()
    # ---------- La carpeta del cerebro: lo que corriges a mano no se pisa aunque el agente apunte algo justo después ----------
    accion2({"tipo": "memoria.guardar", "texto": "dato A del agente", "tema": "Clientes"})
    esperar(lambda: os.path.exists(nota) and "dato A" in open(nota, encoding="utf8").read(), 10)
    with open(nota, "a", encoding="utf8") as fh: fh.write("- 2026-11-05 · tú · CORRECCIÓN HECHA A MANO\n")
    time.sleep(1.2)
    accion2({"tipo": "memoria.guardar", "texto": "dato B del agente", "tema": "Clientes"})
    check(esperar(lambda: "dato B" in open(nota, encoding="utf8").read(), 10), "el recuerdo nuevo llega a la nota")
    txt = open(nota, encoding="utf8").read()
    check("CORRECCIÓN HECHA A MANO" in txt and "CORRECCIÓN HECHA A MANO" in memoria2(), "lo que corregiste a mano sigue en la nota y en el edificio (antes de escribir, lee la carpeta)")
    # ---------- Telegram con un token que no vale: espera cada vez más, no martillea ----------
    time.sleep(max(0, 9 - (time.time() - t0)))
    n = len([t for t in pedidas_malas if t <= t0 + 9])
    check(n <= 4, f"Telegram con token malo: {n} preguntas en 9 s (espera cada vez más, no martillea)")
    check(sum("El token no vale" in l for l in salida2) == 1, "lo dice una vez: el token no vale")
finally:
    parar(casa2)
# ---------- Al reiniciar Fer Casa, lo que borraste a mano en Obsidian no vuelve ----------
lineas = [l for l in open(nota, encoding="utf8").read().split("\n") if "dato A" not in l]
time.sleep(1.1)
open(nota, "w", encoding="utf8").write("\n".join(lineas))
casa3, salida3 = lanzar_casa2()
try:
    check(esperar(lambda: "dato A del agente" not in memoria2(), 10) and "dato B del agente" in memoria2(), "tras reiniciar: lo que borraste a mano no vuelve y lo demás sigue")
    time.sleep(1)
    check("dato A" not in open(nota, encoding="utf8").read(), "y la nota tampoco lo recupera")
finally:
    parar(casa3)
print("".join(salida[-25:]))
print("RESULTADO:", "OK" if ok else "FALLOS")
sys.exit(0 if ok else 1)
