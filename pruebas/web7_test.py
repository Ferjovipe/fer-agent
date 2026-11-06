"""Pruebas de la web, versión 7 (Playwright, todo simulado: OpenRouter, Claude, Google Drive y el inicio de sesión de Google).
Comprueba lo nuevo: el freno, la bandeja, los cerebros directos, la voz frase a frase, «Parar», cortarle al hablar,
la navegación, las monedas, la personalidad, los objetivos, los precios, las copias con imágenes, la mudanza y la carpeta del cerebro.
Uso: python3 pruebas/web7_test.py   (deja capturas en pruebas/capturas/v7-*.png)"""
import json, os, sys, re, time, subprocess, base64, urllib.parse
from datetime import datetime, timezone, timedelta
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("servidor = subprocess.Popen")].replace("PUERTO = 8811", "PUERTO = 8813"))

# ---------- Modelos de verdad (datos copiados de OpenRouter, noviembre de 2026) para comprobar los precios ----------
TODOS["data"] += [
  {"id": "black-forest-labs/flux.2-max", "name": "FLUX.2 Max", "pricing": {"prompt": "0", "completion": "0", "image_output": "0.00001708984375"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["image"]}},
  {"id": "recraft/recraft-v4-pro", "name": "Recraft V4 Pro", "pricing": {"prompt": "0", "completion": "0", "image_token": "0.0000598802395209581", "image_output": "0.0000598802395209581"}, "architecture": {"input_modalities": ["text"], "output_modalities": ["image"]}},
  {"id": "microsoft/mai-transcribe-1.5", "name": "MAI-Transcribe 1.5", "pricing": {"prompt": "0.36", "completion": "0"}, "architecture": {"input_modalities": ["audio"], "output_modalities": ["transcription"]}},
  {"id": "google/lyria-3-pro-preview", "name": "Lyria 3 Pro Preview", "description": "Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music models.", "pricing": {"prompt": "0", "completion": "0"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text", "audio"]}},
  {"id": "openai/gpt-audio", "name": "OpenAI: GPT Audio", "pricing": {"prompt": "0.0000025", "completion": "0.00001", "audio": "0.000032", "audio_output": "0.000064"}, "architecture": {"input_modalities": ["text", "audio"], "output_modalities": ["text", "audio"]}},
  {"id": "anthropic/claude-opus-4.1", "name": "Claude Opus 4.1", "pricing": {"prompt": "0.000015", "completion": "0.000075"}, "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]}, "context_length": 200000}]
CORS7 = dict(CORS, **{"Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"})
anthropic_llamadas = []
GIS = """window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: (o) => {
  window.__gis = (window.__gis || []).concat([{ scope: cfg.scope, client_id: cfg.client_id, prompt: o && o.prompt }]);
  setTimeout(() => cfg.callback({ access_token: 'tok-drive', expires_in: 3600 }), 20); } }) } } };"""
# ---------- Google Drive simulado (en memoria) ----------
drive = {"n": 0, "archivos": {}}
def drive_nuevo(nombre, padre, tipo, contenido=""):
    drive["n"] += 1; i = "f%d" % drive["n"]
    drive["archivos"][i] = {"id": i, "name": nombre, "parents": [padre], "mimeType": tipo, "content": contenido, "modifiedTime": datetime.now(timezone.utc).isoformat()}
    return i
def drive_ruta(ruta):
    """id de un archivo por su ruta dentro de «Fer Agent»"""
    actual = next((f["id"] for f in drive["archivos"].values() if f["name"] == "Fer Agent" and "root" in f["parents"]), None)
    for parte in [p for p in ruta.split("/") if p]:
        actual = next((f["id"] for f in drive["archivos"].values() if f["name"] == parte and actual in f["parents"]), None)
    return actual
def drive_router(route, request):
    url = urllib.parse.urlparse(request.url); qs = urllib.parse.parse_qs(url.query)
    if os.environ.get("DEPURAR"): print("DRIVE", request.method, url.path, qs.get("q", [""])[0][:90], time.strftime("%X"))
    if request.headers.get("authorization") != "Bearer tok-drive": return route.fulfill(status=401, headers=CORS7, body="{}")
    m = re.match(r"^/(upload/)?drive/v3/files(?:/([^/]+))?$", url.path)
    if not m: return route.fulfill(status=404, headers=CORS7, body="{}")
    sube, fid = m.group(1), m.group(2)
    if request.method == "GET" and fid and qs.get("alt") == ["media"]:
        return route.fulfill(status=200, headers=CORS7, body=drive["archivos"][fid]["content"])
    if request.method == "GET":
        q = qs.get("q", [""])[0]
        padre = re.search(r"'([^']+)' in parents", q).group(1)
        nombre = re.search(r"name = '((?:[^'\\]|\\.)*)'", q)
        res = [f for f in drive["archivos"].values() if padre in f["parents"] and (not nombre or f["name"] == nombre.group(1).replace("\\'", "'"))]
        if "mimeType = 'application/vnd.google-apps.folder'" in q: res = [f for f in res if f["mimeType"] == "application/vnd.google-apps.folder"]
        if "mimeType != 'application/vnd.google-apps.folder'" in q: res = [f for f in res if f["mimeType"] != "application/vnd.google-apps.folder"]
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"files": [{k: f[k] for k in ("id", "name", "mimeType", "modifiedTime")} for f in res]}))
    if request.method == "POST" and not sube:
        b = json.loads(request.post_data); i = drive_nuevo(b["name"], b["parents"][0], b["mimeType"])
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": i}))
    if request.method == "POST" and sube:
        cuerpo = request.post_data; frontera = re.search(r"boundary=(\S+)", request.headers["content-type"]).group(1)
        partes = [p for p in cuerpo.split("--" + frontera) if p.strip() and p.strip() != "--"]
        meta = json.loads(partes[0].split("\r\n\r\n", 1)[1].strip()); contenido = partes[1].split("\r\n\r\n", 1)[1][:-2]
        i = drive_nuevo(meta["name"], meta["parents"][0], meta["mimeType"], contenido)
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": i}))
    if request.method == "PATCH":
        f = drive["archivos"][fid]; f["content"] = request.post_data; f["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"id": fid}))
    return route.fulfill(status=400, headers=CORS7, body="{}")

LARGO = ["Hoy el equipo ha avanzado mucho con los pisos turísticos de Madrid. ", "Arturito ha encontrado tres modelos nuevos que pueden servirnos más baratos. ", "Mañana te propongo revisar juntos el gasto de la semana."]
def router7(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS7)
    if url.startswith("https://accounts.google.com/gsi/client"): return route.fulfill(status=200, headers={"Content-Type": "application/javascript"}, body=GIS)
    if url.startswith("https://www.googleapis.com/"): return drive_router(route, request)
    if url.startswith("https://api.anthropic.com/v1/models"):
        if request.headers.get("x-api-key") != "sk-ant-web": return route.fulfill(status=401, headers=CORS7, body=json.dumps({"error": {"message": "invalid x-api-key"}}))
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"data": [{"id": "claude-opus-5-5", "created_at": "2026-10-01T00:00:00Z"}, {"id": "claude-sonnet-5-5", "created_at": "2026-09-01T00:00:00Z"}]}))
    if url == "https://api.anthropic.com/v1/messages":
        anthropic_llamadas.append({"h": dict(request.headers), "b": json.loads(request.post_data)})
        return route.fulfill(status=200, headers=CORS7, content_type="application/json", body=json.dumps({"model": "claude-opus-5-5", "content": [{"type": "text", "text": "Consejo meditado de Claude directo."}], "usage": {"input_tokens": 1000, "output_tokens": 50}}))
    if url == "https://openrouter.ai/api/v1/chat/completions":
        b = json.loads(request.post_data)
        u = b["messages"][-1]["content"] if isinstance(b["messages"][-1]["content"], str) else ""
        if b.get("stream") and "cuéntame" in u.lower():   # respuesta por partes: tres frases en trozos
            llamadas.append(b)
            trozos = []
            for f in LARGO: trozos += [f[:30], f[30:]]
            sse = "".join("data: " + json.dumps({"choices": [{"delta": {"content": t}}]}) + "\n\n" for t in trozos)
            sse += "data: " + json.dumps({"choices": [], "usage": {"prompt_tokens": 200, "completion_tokens": 60, "cost": 0.0011}}) + "\n\ndata: [DONE]\n\n"
            return route.fulfill(status=200, content_type="text/event-stream", headers=CORS7, body=sse)
    return router(route, request)

def lista_drive(): return sorted(drive_rutas())
def drive_rutas():
    out = []
    def rec(pid, ruta):
        for f in drive["archivos"].values():
            if pid in f["parents"]:
                r = (ruta + "/" if ruta else "") + f["name"]
                out.append(r)
                if f["mimeType"] == "application/vnd.google-apps.folder": rec(f["id"], r)
    raiz = drive_ruta("")
    if raiz: rec(raiz, "")
    return out
def foto(page, nombre, completa=False): page.screenshot(path=os.path.join(SALIDA, "v7-" + nombre + ".png"), full_page=completa)

servidor = subprocess.Popen([sys.executable, "-m", "http.server", str(PUERTO), "--directory", RAIZ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
        ctx.add_init_script(INIT); ctx.add_init_script(FAKE_VAD); ctx.route("https://**/*", router7)
        page = ctx.new_page(); errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL)
        entrar(page)
        page.wait_for_selector("#cajon:not([hidden])", timeout=8000)
        # ---------- Tu clave: dónde está y a dónde va ----------
        txt = page.inner_text("#cajonCuerpo")
        check("No pasa por ningún servidor de Fer Agent" in txt and "directamente a OpenRouter" in txt, "Ajustes explica claro dónde está la clave y a dónde viaja")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tramo"); instalar_equipo(page)   # v8: el equipo se instala desde «Agentes de serie»
        # ---------- 1. El freno ----------
        page.wait_for_selector(".tramo")
        check(page.get_attribute("#pausa", "aria-pressed") == "true" and page.inner_text("#pausaTxt") == "En pausa" and page.inner_text("#pausaSub") == "nada gasta solo", "el interruptor general, junto al contador: arranca en pausa")
        check(page.inner_text("#copiaCuando") == "última: nunca" and "vieja" in page.get_attribute("#copiaRapida", "class"), "«Guardar copia» visible arriba, avisando de que no hay ninguna")
        foto(page, "1-arriba-en-pausa")
        page.click("#medidor"); page.wait_for_selector("#cajonCuerpo .quien-gasta")
        filas = page.eval_on_selector_all("#cajonCuerpo .fila-qg", "fs => fs.map(f => f.innerText.replace(/\\s+/g, ' '))")
        art = next(f for f in filas if f.startswith("Arturito"))
        check("avanza en su objetivo" in art and "por latido" in art and "al día" in art, f"Gasto: quién gasta al despertar y cuánto (Arturito: «{art[:110]}»)")
        check(any(f.startswith("Interventor") and "no gasta" in f for f in filas), "los de reglas fijas: «no gasta»")
        foto(page, "2-gasto-quien-gasta")
        page.click("#cajonCuerpo .fila-qg:has-text('Arturito') button:text-is('Solo a petición')"); page.wait_for_timeout(300)
        check(agente(page, "Arturito")["latido"]["unidad"] == "peticion", "un toque y Arturito pasa a «solo a petición»")
        page.click("#cajonCuerpo .pausa-btn"); page.wait_for_timeout(300)
        check(estado(page)["ajustes"]["pausa"] is False and page.get_attribute("#pausa", "aria-pressed") == "false", "el interruptor también se pone en marcha desde Gasto")
        page.click("#cerrarCajon")
        page.click("#pausa"); page.wait_for_timeout(300)
        check(estado(page)["ajustes"]["pausa"] is True, "y se vuelve a pausar desde arriba")
        # ---------- 2. Navegación: logo, flecha de atrás y «Volver» ----------
        page.click("#irPortada"); page.wait_for_timeout(500)
        check(page.is_visible("#landing .heroe"), "el logo «Fer Agent» lleva a la portada")
        page.go_back(); page.wait_for_timeout(600)
        check(not page.is_visible("#landing .heroe") and page.is_visible(".tramo"), "la flecha de atrás del navegador vuelve al edificio")
        check(page.is_visible("#volverPortada"), "en el edificio, «Volver a la portada» visible")
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.go_back(); page.wait_for_timeout(400)
        check(page.is_hidden("#vistaChat"), "desde el chat, la flecha de atrás vuelve al edificio")
        page.go_forward(); page.wait_for_timeout(400)
        check(page.is_visible("#vistaChat"), "y la de adelante vuelve al chat")
        page.click("#cerrarChat"); page.wait_for_timeout(300)
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden])")
        check(page.is_visible("#vistaSalas .volver-btn"), "Reuniones: «Volver» visible")
        page.go_back(); page.wait_for_timeout(300)
        check(page.is_hidden("#vistaSalas"), "atrás desde Reuniones")
        page.click("#abrirAjustes"); page.wait_for_selector("#cajon:not([hidden])")
        check(page.inner_text("#cerrarCajon") == "← Volver", "Ajustes y los demás cajones: «← Volver»")
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        check(page.is_hidden("#cajon"), "Escape también vuelve")
        # cerrar algo desde el programa (Cancelar) no deja un paso vacío: la primera «atrás» ya cambia algo
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.click("#cerrarChat"); page.wait_for_timeout(300)
        page.click("#crearPiso"); page.wait_for_selector("#cajon:not([hidden])")
        page.click("#cajonCuerpo button:text-is('Cancelar')"); page.wait_for_timeout(300)
        n_antes = page.evaluate("history.state && history.state.n")
        page.go_back(); page.wait_for_timeout(600)
        n_despues, v_despues = page.evaluate("[history.state && history.state.n, history.state && history.state.v]")
        check(n_despues < n_antes - 1 and v_despues != "edificio", f"tras «Cancelar», la primera flecha de atrás ya cambia de pantalla: se salta los pasos que dejaban todo igual ({n_antes} → {n_despues}, {v_despues})")
        page.go_forward(); page.wait_for_timeout(600)
        check(page.is_visible(".tramo") and not page.is_visible("#landing .heroe") and page.is_hidden("#cajon"), "y la de adelante vuelve al edificio")
        # ---------- 3. Objetivos del edificio ----------
        page.click("#abrirAjustes")
        ta = "#cajonCuerpo .campo:has(> span:text-is('Objetivos del edificio (tuyos o de tu empresa)')) textarea"
        page.fill(ta, "Alquilar todos los pisos turísticos de la empresa\nAhorrar dos horas al día al equipo\nUna\nDos\nTres\nSeis: sobra")
        cuenta = page.inner_text("#cajonCuerpo .contador")
        check(cuenta.startswith("6/5 líneas") and "mal" in page.get_attribute("#cajonCuerpo .contador", "class"), f"contador de líneas: «{cuenta}»")
        page.keyboard.press("Tab"); page.wait_for_timeout(400)
        check(estado(page)["objetivos"].count("\n") == 4, "se guardan cinco líneas como máximo")
        foto(page, "3-ajustes-objetivos")
        # ---------- 4. Otras API (v8): Claude con la clave de tu suscripción, elegido en la ficha ----------
        page.click("#cajonCuerpo button:text-is('+ Claude (Anthropic)')"); page.wait_for_timeout(400)
        bloque = "#cajonCuerpo .api-fila:has(> span:text-matches('^Claude'))"
        page.fill(f"{bloque} input[type=password]", "sk-ant-web"); page.click(f"{bloque} button:text-is('Guardar')"); page.wait_for_timeout(300)
        check(page.evaluate("localStorage.getItem('ferAgent.keyAnthropic')") == "sk-ant-web", "Otras API: la clave de Claude se guarda solo en este navegador")
        check("clave-anthropic" not in json.dumps(estado(page)) and "sk-ant-web" not in json.dumps(estado(page)), "y no va dentro del edificio (ni en copias ni en la mudanza)")
        page.click(f"{bloque} button:text-is('Probar')"); page.wait_for_selector(f"{bloque} >> text=Funciona: 2 modelos", timeout=8000)
        check(True, "«Probar» habla con la API de Claude y lista tus modelos")
        foto(page, "4-ajustes-otras-api")
        page.click("#cerrarCajon")
        ficha(page, "Sabio 1", "Cerebro y gasto")
        sel_prov = "#ficha .campo:has(> span:text-is('Con qué piensa')) select"
        opts = page.eval_on_selector_all(sel_prov + " option", "os => os.map(o => o.textContent)")
        check(opts[:1] == ["OpenRouter (se paga por uso)"] and "Claude (Anthropic) · tu suscripción" in opts, f"en la ficha, «Con qué piensa»: OpenRouter o tu API ({opts})")
        page.select_option(sel_prov, "anthropic"); page.wait_for_timeout(500)
        s1 = agente(page, "Sabio 1")
        check(s1["proveedor"] == "anthropic" and s1["cerebro"].startswith("claude-"), f"Sabio 1 piensa con Claude de tu suscripción ({s1['cerebro']})")
        check(page.eval_on_selector(sel_prov, "s => s.value") == "anthropic" and page.is_visible("#ficha >> text=Sale de tu suscripción de Claude"), "su ficha lo dice: sale de tu suscripción, no cuenta para el tope")
        check(page.is_visible("#ficha >> text=Si se acaba tu cupo de Claude"), "y qué hacer si se acaba el cupo (OpenRouter o pararse)")
        foto(page, "5-ficha-otra-api")
        chat_con(page, "Sabio 1"); enviar(page, "¿Compro el terreno del norte?")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        check("Consejo meditado de Claude directo." in page.inner_text("#mensajes") and anthropic_llamadas and anthropic_llamadas[-1]["h"].get("anthropic-dangerous-direct-browser-access") == "true", "el sabio contesta con Claude, desde el navegador")
        check("tu suscripción" in page.inner_text("#mensajes .msg.bot:not(.saludo) .meta"), "debajo de la respuesta: «tu suscripción»")
        check(anthropic_llamadas[-1]["b"]["system"].startswith("Eres un sabio") and "Organigrama" not in anthropic_llamadas[-1]["b"]["system"], "al sabio no le llega el organigrama")
        page.click("#cerrarChat")
        # ---------- 5. Personalidad y lo que lee cada agente ----------
        ficha(page, "Tecno", "Trabajo")
        page.fill("#ficha .campo:has(> span:text-is('Personalidad')) textarea", "Seco, con humor negro y muy al grano."); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(agente(page, "Tecno")["personalidad"] == "Seco, con humor negro y muy al grano.", "campo «Personalidad» en la ficha")
        foto(page, "6-ficha-personalidad")
        n0 = len(llamadas)
        chat_con(page, "Tecno"); enviar(page, "¿Qué tal todo?"); page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        s = [x for x in llamadas[n0:] if "messages" in x][-1]["messages"][0]["content"]
        check("Tu personalidad: Seco, con humor negro" in s and "Objetivos del edificio:\nAlquilar todos los pisos" in s and "ME FALTA:" in s, "cada llamada lleva su personalidad, los objetivos del edificio y la regla contra inventos")
        check("Planta técnica:" in s and "latido" not in s.split("Organigrama")[1][:600], "el organigrama, solo lo que necesita y sin detalles")
        # ---------- 6. Monedas: grandes, regla redactada y en el muñeco ----------
        tam = page.eval_on_selector("#mensajes .msg.bot:not(.saludo) .meta .moneda-btn .moneda", "m => m.getBoundingClientRect().width")
        check(tam >= 19, f"monedas más grandes debajo de cada respuesta ({tam:.0f} px)")
        page.click("#mensajes .msg.bot:not(.saludo) .moneda-btn >> nth=0")
        page.fill(".motivo-fila input", "Conocía perfectamente su función"); page.click(".motivo-fila .btn.primario")
        page.wait_for_selector("text=Lección propuesta", timeout=15000)
        foto(page, "7-chat-monedas-grandes")
        page.click("#cerrarChat")
        check(page.inner_text("#globoBandeja") == "1", "la bandeja avisa: 1 cosa espera tu sí")
        tecno_pj = ".tramo .pj[data-id='tecno'] .monedas-pj"
        check(page.is_visible(tecno_pj) and page.inner_text(tecno_pj).strip() == "1", "el muñeco de Tecno lleva su contador de monedas")
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja .peticion")
        foto(page, "8-bandeja")
        page.fill("#vistaBandeja .peticion:has-text('Lección nueva') textarea", "Antes de contestar, repasa tu función y di solo lo que te toca.")
        page.click("#vistaBandeja .peticion:has-text('Lección nueva') button:text-is('Aprobar')"); page.wait_for_timeout(400)
        lec = [l for l in estado(page)["lecciones"] if l["estado"] == "aprobada"]
        check(lec and lec[-1]["texto"] == "Antes de contestar, repasa tu función y di solo lo que te toca." and lec[-1]["papel"] == "tecno", "apruebas la regla (retocada) en la bandeja y ya es lección de su papel")
        check(page.is_visible("#vistaBandeja .bandeja-vacia") and page.is_hidden("#globoBandeja"), "bandeja vacía y sin aviso")
        page.click("#vistaBandeja .volver-btn")
        # ---------- 7. La bandeja con lo que propone el jefe y lo que le falta a un agente ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        enviar(page, "Quiero un agente nuevo para la tienda"); page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        page.wait_for_timeout(500)
        check(any("en pausa" in c for c in page.eval_on_selector_all("#mensajes .chip", "cs => cs.map(c => c.textContent)")), "en pausa, la tarea que reparte el jefe espera (y lo dice)")
        page.click("#cerrarChat")
        ficha(page, "Creador de agentes", "Identidad"); page.click("#ficha >> text=Despertar ahora")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferEdificio.estado')).propuestas.some(p => p.estado === 'pendiente')", timeout=15000)
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja .peticion:has-text('Agente nuevo')")
        coste = page.inner_text("#vistaBandeja .peticion:has-text('Agente nuevo') .p-coste")
        check(coste.endswith("al día"), f"el agente que diseña el Creador llega a la bandeja con lo que gastaría: «{coste}»")
        page.click("#vistaBandeja .peticion:has-text('Agente nuevo') button:text-is('Crear')"); page.wait_for_timeout(500)
        check(any(a["nombre"] == "Tendero" for a in estado(page)["agentes"]), "«Crear» desde la bandeja")
        page.click("#vistaBandeja .volver-btn")
        page.evaluate("""() => { const e = JSON.parse(localStorage.getItem('ferEdificio.estado')); }""")
        # ---------- 8. Precios y modelos ----------
        page.click("#abrirAjustes")
        def opciones(campo): return page.eval_on_selector_all(f"#cajonCuerpo .campo:has(> span:text-is('{campo}')) option", "os => os.map(o => o.textContent)")
        img = opciones("Crear imágenes"); mus = opciones("Crear música"); oir = opciones("Oír: tu voz a texto")
        flux = next(o for o in img if o.startswith("FLUX.2 Max")); recraft = next(o for o in img if o.startswith("Recraft V4 Pro"))
        check("0,07 $ por imagen" in flux and "Gratis" not in flux, f"FLUX.2 Max ya no sale gratis: «{flux}»")
        check("$ por imagen" in recraft and "Gratis" not in recraft, f"Recraft V4 Pro: «{recraft}»")
        mai = next(o for o in oir if o.startswith("MAI-Transcribe"))
        check("0,36 $ por hora" in mai, f"MAI-Transcribe 1.5 a 0,36 $ la hora: «{mai}»")
        lyria = next(o for o in mus if o.startswith("Lyria 3 Pro"))
        check("precio no publicado" in lyria and "0,08 $ por canción" in lyria, f"Lyria: «{lyria}»")
        check(not any("GPT Audio" in o for o in mus), "GPT Audio ya no sale en «Crear música»")
        check(page.is_visible("#cajonCuerpo >> text=Dónde se activa: en la ficha de cada agente → Capacidades → «Crear música».") , "se dice dónde se activa «Crear música»")
        page.click("#cerrarCajon")
        ficha(page, "Jefe", "Cerebro y gasto")
        grupos = page.eval_on_selector_all("#ficha .campo:has(> span:text-is('Cerebro')) optgroup", "gs => gs.map(g => g.label + ': ' + [...g.children].map(o => o.value).join(','))")
        alto = next((g for g in grupos if g.startswith("Recomendados · Alto")), "")
        vang = next((g for g in grupos if g.startswith("Recomendados · Vanguardia")), "")
        check("claude-opus-5.5" in vang and "claude-opus-4.1" not in vang, f"en cada nivel de precio, la versión más nueva de cada casa: Opus 5.5, no Opus 4.1 ({vang[:90]})")
        # ---------- 9. Voz: frase a frase, «Parar» y cortarle al hablar ----------
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])")
        page.click("#altavoz")
        n0 = len(llamadas)
        enviar(page, "Cuéntame cómo va todo")
        page.wait_for_selector("#pararVoz:not([hidden])", timeout=10000)
        foto(page, "9-chat-hablando-parar")
        page.wait_for_function("document.querySelector('#pararVoz').hidden", timeout=15000)
        voces = [x["voz"]["input"] for x in llamadas[n0:] if "voz" in x]
        check(len(voces) == 3 and voces[0].startswith("Hoy el equipo") and voces[2].startswith("Mañana"), f"habla frase a frase mientras escribe: {len(voces)} trozos de voz")
        pedido = [x for x in llamadas[n0:] if "messages" in x][0]
        check(pedido.get("stream") is True and "habláis por voz: contesta corto" in pedido["messages"][0]["content"] and pedido.get("max_tokens") == 400, "con voz: respuesta por partes y corta")
        check("Hoy el equipo ha avanzado" in page.inner_text("#mensajes"), "el texto también aparece en el chat")
        enviar(page, "Cuéntame otra vez"); page.wait_for_selector("#pararVoz:not([hidden])", timeout=10000)
        page.click("#pararVoz"); page.wait_for_timeout(300)
        check(page.is_hidden("#pararVoz") and page.inner_text("#jefeEstado") == "Listo para hablar", "«Parar» lo calla al momento")
        page.wait_for_timeout(1500)
        page.click("#micro"); page.wait_for_function("window.__vadOpts && window.__vadCalls.includes('start')", timeout=8000)
        page.evaluate("window.__vadOpts.onSpeechEnd(new Float32Array(16000))")
        page.wait_for_selector("#pararVoz:not([hidden])", timeout=15000)
        page.evaluate("window.__vadOpts.onSpeechRealStart()"); page.wait_for_timeout(200)
        check(page.is_hidden("#pararVoz") and page.inner_text("#jefeEstado").startswith("Te estoy oyendo"), "si le hablas mientras habla, se calla y te escucha")
        check(window_calls := page.evaluate("window.__vadCalls").count("pause") <= 2, "el micro no se apaga mientras habla")
        page.click("#micro"); page.click("#altavoz"); page.click("#cerrarChat")
        # ---------- 10. Imágenes y música que no se pierden ----------
        page.click("#hablarJefe"); enviar(page, "Dibuja un faro"); page.wait_for_selector("#mensajes .burbuja img", timeout=15000)
        page.reload(); entrar(page); page.wait_for_selector(".tramo")
        page.click("#hablarJefe"); page.wait_for_timeout(800)
        src = page.eval_on_selector("#mensajes .burbuja img", "i => i.src") if page.is_visible("#mensajes .burbuja img") else ""
        check(src.startswith("data:image/png"), "la imagen sigue ahí al recargar la página")
        page.click("#cerrarChat")
        # ---------- 11. Copia y mudanza ----------
        with page.expect_download() as d: page.click("#copiaRapida")
        copia = json.loads(open(d.value.path()).read())
        check(copia["tipo"] == "fer-agent-copia" and len(copia["medios"]) == 1 and "sk-or" not in json.dumps(copia) and "sk-ant" not in json.dumps(copia), "«Guardar copia»: todo el edificio con sus imágenes, sin ninguna clave")
        check(page.inner_text("#copiaCuando") == "última: ahora mismo" and "vieja" not in page.get_attribute("#copiaRapida", "class"), "y avisa de cuándo fue la última")
        page.click("#abrirAjustes")
        with page.expect_download() as d: page.click("#cajonCuerpo button:text-is('Preparar la mudanza')")
        mudanza = d.value.path()
        foto(page, "10-ajustes-copias-mudanza")
        page.click("#cerrarCajon")
        ctx2 = b.new_context(viewport={"width": 1360, "height": 900}); ctx2.add_init_script(INIT); ctx2.route("https://**/*", router7)
        p2 = ctx2.new_page(); p2.goto(URL); entrar(p2); p2.wait_for_selector("#cajon:not([hidden])")
        p2.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); p2.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        p2.click("#abrirAjustes"); p2.set_input_files("#cajonCuerpo input[type=file][accept^='application/json']", mudanza); p2.wait_for_timeout(1200)
        e2 = estado(p2)
        check(any(a["nombre"] == "Tendero" for a in e2["agentes"]) and e2["objetivos"].startswith("Alquilar") and agente(p2, "Tecno")["personalidad"].startswith("Seco"), "mudanza: en la web nueva, los mismos agentes, objetivos y personalidades")
        p2.click("#hablarJefe"); p2.wait_for_timeout(800)
        check(p2.is_visible("#mensajes .burbuja img"), "y las imágenes")
        check(p2.evaluate("localStorage.getItem('ferAgent.keyAnthropic')") is None, "las claves no viajan en la mudanza")
        ctx2.close()
        # ---------- 12. La carpeta del cerebro en Google Drive ----------
        page.click("#abrirAjustes")
        page.click("#cajonCuerpo summary:text-is('Pasos para conectar Drive (una vez, unos 10 minutos)')")
        foto(page, "11-ajustes-cerebro-drive")
        page.fill("#cajonCuerpo input[placeholder^='ID de cliente']", "123-abc.apps.googleusercontent.com")
        page.click("#cajonCuerpo button:text-is('Conectar Google Drive')")
        page.wait_for_selector("#cajonCuerpo .estado-carpeta .punto.ok", timeout=15000)
        gis = page.evaluate("window.__gis")
        check(gis[0]["scope"] == "https://www.googleapis.com/auth/drive.file" and gis[0]["client_id"] == "123-abc.apps.googleusercontent.com", "pide a Google solo el permiso drive.file (solo ve lo que crea la web)")
        rutas = lista_drive()
        check({"Biblioteca", "Memoria larga", "Memoria larga/Índice.md", "edificio.json"} <= set(rutas), f"crea en tu Drive la carpeta «Fer Agent» con Biblioteca, Memoria larga y la copia: {rutas}")
        page.click("#cerrarCajon")
        page.click("#hablarJefe"); enviar(page, "Guarda que el coche es un Seat azul"); page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta >> nth=-1", timeout=15000)
        for _ in range(60):
            if drive_ruta("Memoria larga/coche.md"): break
            page.wait_for_timeout(250)
        page.wait_for_timeout(300)
        nota = drive["archivos"].get(drive_ruta("Memoria larga/coche.md"), {}).get("content", "")
        if not nota: print("DEPURAR drive:", lista_drive(), "memoria:", [(n.get("tema"), n["texto"]) for n in estado(page)["memoriaLarga"]], "conv:", [m.get("content", "")[:80] for m in estado(page)["conversacion"][-3:]])
        check("El coche de la empresa es un Seat azul #coche" in nota, "lo que guarda Memory aparece en Drive como nota de Obsidian (Memoria larga/coche.md)")
        # tú lo corriges en Obsidian (en Drive) y la web lo vuelve a leer
        f = drive["archivos"][drive_ruta("Memoria larga/coche.md")]
        f["content"] = f["content"].replace("Seat azul", "Seat rojo"); f["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        page.click("#cerrarChat"); page.click("#abrirAjustes"); page.click("#cajonCuerpo button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(any("Seat rojo" in n["texto"] for n in estado(page)["memoriaLarga"]), "lo que corriges a mano en la nota vuelve a la web")
        page.set_input_files("#cajonCuerpo input[type=file][multiple]", files=[{"name": "Hipoteca.md", "mimeType": "text/markdown", "buffer": "# Hipoteca\n\nEl tipo fijo es del 2,1 %.".encode()}]); page.wait_for_timeout(1500)
        check("Biblioteca/Hipoteca.md" in lista_drive(), "«Añadir notas a la Biblioteca» las sube a tu carpeta")
        # el móvil guarda el edificio con otro nombre: la web lo carga
        ed_json = drive["archivos"][drive_ruta("edificio.json")]
        d = json.loads(ed_json["content"]); d["aparato"] = "ap_movil"; d["ts"] = int(time.time() * 1000) + 5000; d["edificio"]["nombre"] = "Edificio desde el móvil"
        ed_json["content"] = json.dumps(d); ed_json["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        page.click("#cajonCuerpo button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(page.inner_text("#nombreEdificio") == "Edificio desde el móvil", "el edificio que guardó tu otro aparato se carga aquí (el móvil y el Mac ven el mismo)")
        # los dos aparatos cambian cosas: no se pisa nada hasta que eliges
        page.fill(ta, "Alquilar todos los pisos\nCambiado en el Mac"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        d = json.loads(ed_json["content"]); d["ts"] = int(time.time() * 1000) + 9000; d["edificio"]["objetivos"] = "Cambiado en el móvil"
        ed_json["content"] = json.dumps(d); ed_json["modifiedTime"] = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
        page.click("#cajonCuerpo button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1500)
        check(page.is_visible("#conflicto") and json.loads(drive["archivos"][drive_ruta("edificio.json")]["content"])["aparato"] == "ap_movil",
              "conflicto: te pregunta con cuáles te quedas y, mientras, no escribe encima de lo del otro aparato")
        page.click("#cajonCuerpo button:text-is('Sincronizar ahora')"); page.wait_for_timeout(1200)
        check(json.loads(drive["archivos"][drive_ruta("edificio.json")]["content"])["aparato"] == "ap_movil", "ni aunque vuelva a sincronizar")
        page.click("#conflicto button:text-is('Quedarme con los de aquí')"); page.wait_for_timeout(1200)
        dj = json.loads(drive["archivos"][drive_ruta("edificio.json")]["content"])
        check(dj["aparato"] != "ap_movil" and "Cambiado en el Mac" in dj["edificio"]["objetivos"] and page.is_hidden("#conflicto"), "eliges «los de aquí» y entonces se guardan en la carpeta")
        page.click("#cerrarCajon")
        # ---------- 12b. O una carpeta de este ordenador (el selector de Chrome se sustituye por la carpeta privada del navegador) ----------
        page.evaluate("""async () => {
          const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Fer Agent', { create: true });
          const bib = await d.getDirectoryHandle('Biblioteca', { create: true });
          const f = await bib.getFileHandle('Viajes.md', { create: true }); const w = await f.createWritable(); await w.write('# Viajes\\n\\nEn octubre fuimos a Asunción para la boda.'); await w.close();
          window.showDirectoryPicker = async () => d; }""")
        page.click("#abrirAjustes"); page.click("#cajonCuerpo button:text-is('Elegir carpeta')"); page.wait_for_timeout(2500)
        est = page.inner_text("#cajonCuerpo .estado-carpeta")
        check("Conectado: Carpeta de este ordenador «Fer Agent»" in est and "1 notas en la Biblioteca" in est, f"carpeta de este ordenador: conectada y leída ({est[:90]})")
        ed_local = page.evaluate("""async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Fer Agent'); const m = await d.getDirectoryHandle('Memoria larga'); const f = await m.getFileHandle('coche.md'); const e = await d.getFileHandle('edificio.json'); return [await (await f.getFile()).text(), JSON.parse(await (await e.getFile()).text()).tipo]; }""")
        check("Seat rojo" in ed_local[0] and ed_local[1] == "fer-agent-edificio", "escribe en esa carpeta la memoria larga y la copia del edificio")
        page.click("#cerrarCajon")
        check(not errores, f"sin errores de JavaScript: {errores}")
        # ---------- 13. Móvil ----------
        page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(400)
        foto(page, "12-movil-arriba")
        page.click("#abrirBandeja"); page.wait_for_selector("#vistaBandeja:not([hidden])")
        ancho = page.evaluate("document.documentElement.scrollWidth")
        check(ancho <= 392, f"bandeja en el móvil sin desbordar ({ancho} px)")
        foto(page, "13-movil-bandeja")
        b.close()
finally:
    servidor.terminate()
print("RESULTADO:", "OK" if ok else "FALLOS")
sys.exit(0 if ok else 1)
