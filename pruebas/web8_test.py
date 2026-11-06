"""Pruebas de la web, versión 8 (Playwright, todo simulado: OpenRouter y una API cualquiera «de tu suscripción»).
Comprueba lo nuevo de la v8: el edificio a pantalla completa (la ficha solo al tocar un agente o entrar en una planta),
un edificio nuevo solo con el jefe, la página «Agentes de serie», los letreros arriba, la barra de arriba en una línea,
el directorio solo en «Franjas», el cerebro (recomendados, todos los de OpenRouter y «Buscar entre todos»), «Otras API» (cualquier dirección) y el selector
en la ficha, «Informa a» con buscador y sin círculos, el nombre en «Foto y nombre», los 6 personajes nuevos, sin referencias
personales y «Orden del día» una sola vez.
Uso: python3 pruebas/web8_test.py   (deja capturas en pruebas/capturas/v8-*.png)"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("servidor = subprocess.Popen")].replace("PUERTO = 8811", "PUERTO = 8814"))

# ---------- Más modelos de texto, para que haga falta «Buscar entre todos» ----------
EXTRA = [m(f"zeta/zeta-{i}", f"Zeta {i}", "0.000001", "0.000004") for i in range(1, 13)]
TEXTO += EXTRA; TODOS["data"] += EXTRA
# ---------- Una API cualquiera, de las que añade el usuario («O cualquier otra») ----------
MIAPI = "https://api.miapi.test/v1"
miapi_llamadas = []
def router8(route, request):
    url = request.url
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if url == MIAPI + "/models":
        if request.headers.get("authorization") != "Bearer sk-mia": return route.fulfill(status=401, headers=CORS, body=json.dumps({"error": {"message": "clave mala"}}))
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"data": [{"id": "mia-grande", "created": 1790000000}, {"id": "mia-pequena", "created": 1780000000}, {"id": "mia-embed-1", "created": 1795000000}]}))
    if url == MIAPI + "/chat/completions":
        miapi_llamadas.append({"h": dict(request.headers), "b": json.loads(request.post_data)})
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"model": "mia-grande", "choices": [{"message": {"content": "Respuesta desde Mi API."}}], "usage": {"prompt_tokens": 800, "completion_tokens": 40}}))
    return router(route, request)

def foto(page, nombre, completa=False): page.screenshot(path=os.path.join(SALIDA, "v8-" + nombre + ".png"), full_page=completa)
def caja(page, sel): return page.eval_on_selector(sel, "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
def filas_barra(page):
    """cuántas filas ocupa la barra de arriba (por el centro de cada cosa visible)"""
    return page.evaluate("""() => { const t = document.querySelector('header.top');
      const ys = [...t.children].filter(c => c.getClientRects().length && getComputedStyle(c).visibility !== 'hidden').map(c => { const r = c.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
      return { filas: new Set(ys.map(y => Math.round(y / 8))).size, salto: Math.max(...ys) - Math.min(...ys), alto: Math.round(t.getBoundingClientRect().height) }; }""")
PERSONAL = re.compile(r"Realkimia|\bFer\b(?!\s+(Agent|Casa))")
def personal(texto): return sorted(set(m.group(0) for m in PERSONAL.finditer(texto)))

servidor = subprocess.Popen([sys.executable, "-m", "http.server", str(PUERTO), "--directory", RAIZ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1470, "height": 900})
        ctx.add_init_script(INIT); ctx.route("https://**/*", router8)
        page = ctx.new_page(); errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.goto(URL); page.wait_for_selector("#landing .heroe-txt")
        # ---------- Portada: sin referencias personales y el texto sin pisar el edificio ----------
        check(personal(page.inner_text("#landing")) == [], f"portada sin referencias personales: {personal(page.inner_text('#landing'))}")
        txt = caja(page, "#landing .heroe-txt")
        check(txt[2] <= 1470 * 0.56, f"portada: el texto se queda en la parte oscura, a la izquierda (acaba en {txt[2]:.0f} px de 1470)")
        foto(page, "1-portada")
        # ---------- Un edificio nuevo: solo el jefe, que se llama «Jefe» ----------
        entrar(page, equipo=False)
        page.wait_for_selector("#cajon:not([hidden])")
        page.fill("#cajonCuerpo input[placeholder='sk-or-...']", "sk-or-test"); page.click("#cajonCuerpo .bloque:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tramo .pj")
        e = estado(page)
        check(len(e["agentes"]) == 1 and e["agentes"][0]["nombre"] == "Jefe" and e["agentes"][0]["rol"] == "jefe", f"un edificio nuevo empieza solo con el jefe, «Jefe» ({[a['nombre'] for a in e['agentes']]})")
        check(len(page.eval_on_selector_all(".tramo .pj", "p => p")) == 1, "en el dibujo, un solo muñeco")
        check(page.inner_text("#hablarJefe") == "Hablar con Jefe", "arriba: «Hablar con Jefe»")
        # ---------- Pantalla completa: sin ficha al lado hasta tocar a alguien ----------
        check("con-panel" not in (page.get_attribute("body", "class") or "") and not page.is_visible("#ficha"), "el edificio entero, sin la ficha al lado")
        ancho = caja(page, ".edificio")
        check(ancho[2] - ancho[0] >= 1300, f"el edificio ocupa la pantalla ({ancho[2] - ancho[0]:.0f} px de 1470)")
        foto(page, "2-solo-el-jefe")
        page.click(".tramo .pj[data-id='jefe']"); page.wait_for_selector("#ficha .ficha-pestanas")
        check("con-panel" in page.get_attribute("body", "class") and page.is_visible("#cerrarPanel"), "tocas al jefe: sale su ficha, con su ✕")
        page.click("#cerrarPanel"); page.wait_for_timeout(300)
        check("con-panel" not in page.get_attribute("body", "class") and not page.is_visible("#ficha"), "con el ✕, otra vez el edificio entero")
        # ---------- Agentes de serie ----------
        page.click("#abrirSerie"); page.wait_for_selector("#vistaSerie .serie-ag")
        tarjetas = page.eval_on_selector_all("#vistaSerie .serie-ag .serie-nombre", "bs => bs.map(b => b.textContent)")
        check(len(tarjetas) == 9 and "Sabio 2" in tarjetas and "Jefe" in tarjetas and not any("Consejera" in t for t in tarjetas), f"«Agentes de serie»: los 9 de la casa, con «Sabio 2» ({tarjetas})")
        check(page.is_visible("#vistaSerie .serie-ag:has-text('Jefe') >> text=Siempre está") and page.is_visible("#vistaSerie button:text-is('Instalar el equipo recomendado (faltan 8)')"), "el jefe ya está; botón «Instalar el equipo recomendado (faltan 8)»")
        check(personal(page.inner_text("#vistaSerie")) == [], f"la página de serie, sin referencias personales: {personal(page.inner_text('#vistaSerie'))}")
        foto(page, "3-agentes-de-serie")
        page.click("#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) button:text-is('Instalar')"); page.wait_for_timeout(500)
        e = estado(page)
        art = next((a for a in e["agentes"] if a["id"] == "arturito"), None)
        check(len(e["agentes"]) == 2 and art and art["planta"] in [p["id"] for p in e["plantas"]], "se puede instalar uno solo (Arturito), con su planta")
        check(page.is_visible("#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) button:text-is('Quitar del edificio')"), "y su tarjeta pasa a «En tu edificio · Quitar del edificio»")
        page.click("#vistaSerie button:has-text('Instalar el equipo recomendado')"); page.wait_for_timeout(600)
        e = estado(page)
        check(len(e["agentes"]) == 9 and page.is_visible("#vistaSerie >> text=Tienes instalado todo el equipo recomendado."), "«Instalar el equipo recomendado» pone a los que faltan (9 en total)")
        quitar = "#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) button:text-is('Quitar del edificio')"
        page.click(quitar); page.click("#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) .peligro"); page.wait_for_timeout(500)
        check(len(estado(page)["agentes"]) == 8 and page.is_visible("#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) button:text-is('Instalar')"), "quitar uno (dos toques): se va del edificio y vuelve a estar para instalar")
        page.click("#vistaSerie .serie-ag:has(.serie-nombre:text-is('Arturito')) button:text-is('Instalar')"); page.wait_for_timeout(500)
        page.click("#vistaSerie .volver-btn"); page.wait_for_selector("#vistaSerie", state="hidden")
        # ---------- Letreros arriba, barra en una línea, directorio solo en «Franjas» ----------
        page.wait_for_selector(".tramo.piso .placa")
        tramo, placa = caja(page, ".tramo.piso"), caja(page, ".tramo.piso .placa")
        check((placa[1] - tramo[1]) / (tramo[3] - tramo[1]) < 0.1, f"el letrero de cada planta, arriba ({(placa[1] - tramo[1]) / (tramo[3] - tramo[1]):.2f} del alto)")
        tops = page.eval_on_selector_all(".tramo .placa", "ps => ps.map(p => { const t = p.closest('.tramo').getBoundingClientRect(), r = p.getBoundingClientRect(); return (r.top - t.top) / t.height; })")
        check(all(t < 0.6 for t in tops), f"cúpula, plantas y vestíbulo: el letrero en la parte de arriba ({[round(t, 2) for t in tops]})")
        nombres = page.eval_on_selector_all(".tramo .pj .etiqueta", "es => es.map(e => e.textContent)")
        check(len(nombres) == 9 and "Sabio 2" in nombres, "cada muñeco lleva su nombre (se ve al pasar por encima)")
        page.hover(".tramo .pj[data-id='tecno']"); page.wait_for_timeout(250)
        check(page.eval_on_selector(".tramo .pj[data-id='tecno'] .etiqueta", "e => getComputedStyle(e).opacity") == "1", "al pasar por encima de Tecno, su nombre")
        alto_pj = page.eval_on_selector(".tramo.piso .pj img", "i => i.getBoundingClientRect().height")
        check(alto_pj >= 48, f"muñecos más grandes con el edificio a toda la pantalla ({alto_pj:.0f} px)")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 0, "en «Dibujo» no se repite la lista de agentes")
        page.click("#verFranjas"); page.wait_for_selector(".fila-ag")
        check(len(page.eval_on_selector_all(".fila-ag", "f => f")) == 9, "en «Franjas», el directorio (los 9)")
        page.click("#verDibujo"); page.wait_for_selector(".tramo.piso:not(.franja)")
        foto(page, "4-edificio-completo")
        for w in (1470, 1084):
            page.set_viewport_size({"width": w, "height": 900}); page.wait_for_timeout(300)
            fb = filas_barra(page)
            check(fb["filas"] == 1 and fb["alto"] <= 72, f"barra de arriba en una sola línea a {w} px ({fb})")
        foto(page, "5-barra-1084")
        page.set_viewport_size({"width": 1470, "height": 900}); page.wait_for_timeout(300)
        # entrar en una planta abre la ficha de su jefe; «Volver» la cierra
        idx = [p["id"] for p in estado(page)["plantas"]].index(estado(page)["agentes"][[a["id"] for a in estado(page)["agentes"]].index("tecno")]["planta"])
        page.click(f".tramo >> nth={idx} >> .entrar"); page.wait_for_selector(".volver")
        check("con-panel" in page.get_attribute("body", "class") and page.is_visible("#ficha .ficha-pestanas"), "al entrar en una planta, la ficha al lado")
        foto(page, "6-dentro-de-planta")
        page.click(".volver"); page.wait_for_selector(".tramo.piso"); page.wait_for_timeout(300)
        check("con-panel" not in page.get_attribute("body", "class"), "al volver al edificio, se cierra")
        # ---------- Cerebro: arriba hasta 15 recomendados, debajo TODOS los de OpenRouter, y además «Buscar entre todos» ----------
        ficha(page, "Tecno", "Cerebro y gasto")
        sel = "#ficha .campo:has(> span:text-is('Cerebro')) select"
        grupos = page.eval_on_selector_all(sel + " optgroup", "gs => gs.map(g => [g.label, g.children.length])")
        n_rec = sum(n for g, n in grupos if g.startswith("Recomendados"))
        todos_g = [(g, n) for g, n in grupos if g.startswith("Todos")]
        check(grupos[0][0].startswith("Recomendados") and 1 <= n_rec <= 15, f"en el desplegable, arriba los recomendados por nivel (≤15): {n_rec}")
        check(todos_g == [(f"Todos · Texto ({len(TEXTO)})", len(TEXTO))] and any(g.startswith("Otros") for g, _ in grupos), f"y debajo, en el mismo desplegable, TODOS los de texto de OpenRouter (y «Otros»): {[g for g, _ in grupos]}")
        page.select_option(sel, "zeta/zeta-7"); page.wait_for_timeout(400)
        check(agente(page, "Tecno")["cerebro"] == "zeta/zeta-7", "se elige cualquiera directamente en el desplegable")
        boton = "#ficha .campo:has(> span:text-is('Cerebro')) .buscar-modelo"
        check(page.is_visible(boton) and page.inner_text(boton) == f"Buscar entre todos ({len(TEXTO) + len(OTROS)})", f"y además, «Buscar entre todos (N)» para escribir el nombre: «{page.inner_text(boton) if page.is_visible(boton) else ''}»")
        page.click(boton); page.fill("#ficha input[aria-label='Buscar modelo']", "zeta 1"); page.wait_for_timeout(200)
        res = page.eval_on_selector_all("#ficha .busca-modelos .modelo-res", "bs => bs.map(b => b.textContent)")
        check(res and all("Zeta 1" in r for r in res), f"escribes «zeta 1» y salen los que lo llevan ({len(res)})")
        foto(page, "7-buscar-modelo")
        page.click("#ficha .busca-modelos .modelo-res:has-text('Zeta 12')"); page.wait_for_timeout(400)
        check(agente(page, "Tecno")["cerebro"] == "zeta/zeta-12", "eliges uno de la búsqueda y ya es su cerebro")
        # ---------- Otras API: una cualquiera, con su dirección ----------
        page.click("#abrirAjustes"); page.wait_for_selector("#cajonCuerpo h4:text-is('Otras API (tus suscripciones)')")
        check(personal(page.inner_text("#cajonCuerpo")) == [], f"Ajustes sin referencias personales: {personal(page.inner_text('#cajonCuerpo'))}")
        cual = "#cajonCuerpo .campo:has(> span:text-is('O cualquier otra'))"
        page.fill(f"{cual} input >> nth=0", "Mi API"); page.fill(f"{cual} input >> nth=1", "ftp://mal"); page.click(f"{cual} button:text-is('Añadir')")
        check(page.is_visible(f"{cual} >> text=La dirección tiene que empezar por https://"), "una dirección mala no se añade (y lo dice)")
        page.fill(f"{cual} input >> nth=1", MIAPI); page.click(f"{cual} button:text-is('Añadir')"); page.wait_for_timeout(400)
        fila = "#cajonCuerpo .api-fila:has(> span:text-matches('^Mi API'))"
        check(page.is_visible(fila) and any(c["id"] == "api-mi-api" and c["api"] == MIAPI for c in estado(page)["ajustes"]["conexiones"]), "«Mi API» añadida con su dirección")
        page.fill(f"{fila} input[type=password]", "sk-mia"); page.click(f"{fila} button:text-is('Guardar')"); page.wait_for_timeout(300)
        check(page.evaluate("localStorage.getItem('ferAgent.keyApi.api-mi-api')") == "sk-mia" and "sk-mia" not in json.dumps(estado(page)), "su clave, solo en este navegador (no dentro del edificio)")
        page.click(f"{fila} button:text-is('Probar')"); page.wait_for_selector(f"{fila} >> text=Funciona: 2 modelos", timeout=8000)
        check(True, "«Probar»: lista sus modelos de conversar (sin los de embeddings)")
        foto(page, "8-otras-api")
        page.click("#cerrarCajon")
        ficha(page, "Tecno", "Cerebro y gasto")
        sel_prov = "#ficha .campo:has(> span:text-is('Con qué piensa')) select"
        opts = page.eval_on_selector_all(sel_prov + " option", "os => os.map(o => o.textContent)")
        check(opts == ["OpenRouter (se paga por uso)", "Mi API · tu suscripción"], f"en su ficha, «Con qué piensa»: {opts}")
        page.select_option(sel_prov, "api-mi-api"); page.wait_for_timeout(500)
        t = agente(page, "Tecno")
        check(t["proveedor"] == "api-mi-api" and t["cerebro"] == "mia-grande", f"Tecno piensa con Mi API ({t['proveedor']} · {t['cerebro']})")
        check(page.is_visible("#ficha >> text=Sale de tu suscripción de Mi API"), "la ficha lo dice: sale de tu suscripción, no cuenta para el tope")
        foto(page, "9-ficha-otra-api")
        chat_con(page, "Tecno"); enviar(page, "¿Qué tal todo?")
        page.wait_for_selector("#mensajes .msg.bot:not(.saludo) .meta", timeout=15000)
        check("Respuesta desde Mi API." in page.inner_text("#mensajes") and miapi_llamadas and miapi_llamadas[-1]["h"].get("authorization") == "Bearer sk-mia" and miapi_llamadas[-1]["b"]["model"] == "mia-grande", "contesta desde Mi API, con su clave y su modelo")
        check("Mi API: tu suscripción" in page.inner_text("#mensajes .msg.bot:not(.saludo) .meta"), "debajo: «Mi API: tu suscripción»")
        t = agente(page, "Tecno")
        check(sum(t["gasto"].values()) == 0 and sum(x["tokens"] for x in t["suscripcion"].values()) == 840, f"no suma al gasto; se apunta aparte ({t['suscripcion']})")
        page.click("#cerrarChat")
        # ---------- «Informa a»: cualquiera, con buscador; sin círculos ----------
        ficha(page, "Tecno", "Identidad")
        inf = "#ficha .campo:has(> span:text-is('Informa a'))"
        n_ops = len(page.eval_on_selector_all(f"{inf} select option", "o => o"))
        check(page.is_visible(f"{inf} input[type=search]") and n_ops == 9, f"«Informa a»: Nadie y los otros 8, con buscador ({n_ops} opciones)")
        page.fill(f"{inf} input[type=search]", "artu"); page.wait_for_timeout(200)
        ops = page.eval_on_selector_all(f"{inf} select option", "os => os.map(o => o.textContent)")
        check(any(o.startswith("Arturito") for o in ops) and len(ops) <= 3, f"escribes «artu» y queda Arturito ({ops})")
        page.select_option(f"{inf} select", "arturito"); page.wait_for_timeout(400)
        check(agente(page, "Tecno")["reportaA"] == "arturito", "Tecno informa a Arturito")
        ficha(page, "Arturito", "Identidad")
        antes = agente(page, "Arturito")["reportaA"]
        page.select_option(f"{inf} select", "tecno"); page.wait_for_timeout(500)
        aviso = page.inner_text("#avisoFlotante") if page.is_visible("#avisoFlotante") else ""
        check(agente(page, "Arturito")["reportaA"] == antes and "no puede informar a" in aviso, f"y Arturito ya no puede informar a Tecno (sería un círculo): «{aviso[:90]}»")
        foto(page, "10-informa-a")
        # ---------- Foto y nombre: el nombre aquí y los 6 personajes nuevos ----------
        ficha(page, "Tecno", "Identidad")
        page.click("#ficha button:text-is('Cambiar su foto y su nombre')"); page.wait_for_selector("#cajonCuerpo .pick4")
        check(page.inner_text("#cajonTitulo") == "Foto y nombre de Tecno", "«Foto y nombre de Tecno»")
        pjs = page.eval_on_selector_all("#cajonCuerpo .pick4 button img", "is => is.map(i => i.getAttribute('src'))")
        nuevos = ["morado", "verde", "coral", "azul", "turquesa", "camisa"]
        check(len(pjs) == 10 and all(f"img/pj-{n}.webp" in pjs for n in nuevos), f"10 personajes: los 4 de antes y los 6 nuevos ({len(pjs)})")
        page.fill("#cajonCuerpo input[aria-label='Nombre']", "Técnica"); page.keyboard.press("Tab"); page.wait_for_timeout(400)
        check(any(a["id"] == "tecno" and a["nombre"] == "Técnica" for a in estado(page)["agentes"]) and page.inner_text("#cajonTitulo") == "Foto y nombre de Técnica", "le cambias el nombre ahí mismo")
        page.click("#cajonCuerpo .pick4 button:has(img[src='img/pj-morado.webp'])"); page.wait_for_timeout(500)
        tec = next(a for a in estado(page)["agentes"] if a["id"] == "tecno")
        check(tec["aspecto"]["p"] == "morado" and page.is_visible("#cajonCuerpo >> text=Este personaje va con sus colores tal cual."), "eliges un personaje nuevo (va con sus colores)")
        foto(page, "11-foto-y-nombre")
        page.click("#cerrarCajon"); volver(page); page.wait_for_timeout(300)
        check("pj-morado" in page.get_attribute(".tramo .pj[data-id='tecno'] img", "src") and page.inner_text(".tramo .pj[data-id='tecno'] .etiqueta") == "Técnica", "en el edificio, con su foto y su nombre nuevos")
        # ---------- «Orden del día», una sola vez ----------
        page.click("#abrirSalas"); page.wait_for_selector("#vistaSalas:not([hidden]) .form-osc")
        page.fill(".form-osc input >> nth=0", "Plan de la semana"); page.fill(".form-osc textarea", "Orden del día: qué publicamos y con qué presupuesto.")
        page.click(".elegir-asistentes label:has-text('Sabio 1') input"); page.fill(".form-osc input[type=number]", "1")
        page.click(".form-osc .btn.primario:text-is('Convocar')"); page.wait_for_selector(".mesa .asiento")
        orden = page.inner_text("#vistaSalas .orden")
        check(orden.lower().count("orden del día") == 1 and "qué publicamos" in orden, f"«Orden del día» sale una sola vez: «{orden[:70]}»")
        foto(page, "12-sala")
        page.click("#vistaSalas .volver-btn")
        # ---------- El saludo del jefe y el edificio, sin referencias personales ----------
        page.click("#hablarJefe"); page.wait_for_selector("#mensajes .msg.saludo")
        sal = page.inner_text("#mensajes .msg.saludo")
        check(personal(sal) == [] and "jefe" in sal.lower(), f"el jefe saluda sin nombres de nadie: «{sal[:80]}»")
        page.click("#cerrarChat")
        check(personal(page.inner_text("body")) == [], f"en toda la pantalla, sin referencias personales: {personal(page.inner_text('body'))}")
        # ---------- Empezar de cero: «Solo el jefe» ----------
        page.click("#abrirAjustes"); b_cero = "#cajonCuerpo button:text-is('Solo el jefe')"
        page.click(b_cero); page.click("#cajonCuerpo .fila-c:has(button:text-is('Con el equipo recomendado')) button >> nth=0"); page.wait_for_timeout(700)
        e = estado(page)
        check(len(e["agentes"]) == 1 and e["agentes"][0]["nombre"] == "Jefe" and any(c["id"] == "api-mi-api" for c in e["ajustes"]["conexiones"]), "empezar de cero «Solo el jefe»: queda el jefe (y se conservan los ajustes, como Mi API)")
        page.click("#cerrarCajon") if page.is_visible("#cerrarCajon") else None
        # ---------- Teléfono: el letrero no tapa cabezas ----------
        mov = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mov.add_init_script(INIT); mov.add_init_script("localStorage.setItem('ferAgent.key','sk-or-test');"); mov.route("https://**/*", router8)
        pm = mov.new_page(); pm.on("pageerror", lambda e: errores.append(str(e)))
        pm.goto(URL); entrar(pm); pm.wait_for_selector(".tramo .pj[data-id='tecno']")
        check(not choca(pm, ".tramo.piso .placa", ".tramo .pj[data-id='tecno'] img"), "teléfono: el letrero de la planta no tapa a nadie")
        foto(pm, "13-movil")
        mov.close()
        check(not errores, f"sin errores en la página: {errores[:3]}")
        b.close()
finally:
    servidor.terminate()
print("RESULTADO:", "OK" if ok else "FALLOS")
sys.exit(0 if ok else 1)
