"""9.2.1 · Before anything goes out, the agent shows you exactly what goes out, in its own chat and in the inbox, with «Send», «Correct» and «Reject».
Usage: python3 tests/web921_test.py   (leaves screenshots in tests/screenshots/v921-*.png)"""
import json, os, sys, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8829"))
server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
DETAIL = "To: info@fernandovillarpelaez.com\nSubject: Hola Coco, soy Jefe\n\nHOLA, SOY JEFE, el encargado del enjambre FerAgent de Fer.\nCuéntale un chiste a Fer y léeselo."
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900})
        ctx.add_init_script(INIT)
        ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        enter(page, team=False)
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test")
        page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.evaluate("""(d) => { const e = JSON.parse(localStorage.getItem('ferAgent.state')); const j = e.agents.find(a => a.role === 'boss');
          const t0 = Date.now();
          e.conversation = [{ role: 'user', content: 'Mensaje de antes', ts: t0 - 60000 }, { role: 'assistant', content: 'Respuesta de antes', ts: t0 - 50000 },
                    { role: 'user', content: 'Mensaje de después', ts: t0 - 30000 }, { role: 'assistant', content: 'Respuesta de después', ts: t0 - 20000 }];
          e.approvals = [{ id: 'au_test1', ts: t0 - 40000, agent: j.id, name: j.name, what: 'En mail.google.com: pulsar «Enviar» (enviar o publicar)', detail: d, cost: 0,
            action: { web: { action: 'click', element: 3, label: 'Enviar', url: 'https://mail.google.com/' }, effect: 'send' }, signature: 'x', state: 'pending', result: '', effect: 'send',
            mail: { to: 'info@fernandovillarpelaez.com', subject: 'Hola Coco, soy Jefe', text: 'HOLA, SOY JEFE, el encargado del enjambre FerAgent de Fer.\\nCuéntale un chiste a Fer y léeselo.', from: 'mail.google.com', fromPage: true } }];
          localStorage.setItem('ferAgent.state', JSON.stringify(e)); }""", DETAIL)
        page.reload(); enter(page, team=False)
        chat_with(page, "Jefe")
        card = "#messages .msg.approval .request"
        page.wait_for_selector(card)
        check(page.inner_text(card + " .mc-head b") == "Jefe quiere enviar este correo", "9.2.2: like an email waiting to go out: «Jefe quiere enviar este correo»")
        rows = page.eval_on_selector_all(card + " .mc-row", "rs => rs.map(r => r.innerText.replace(/\\s+/g, ' '))")
        check(rows == ["Para info@fernandovillarpelaez.com", "Asunto Hola Coco, soy Jefe"], f"To and Subject: {rows}")
        check(page.inner_text(card + " .mc-body") == "HOLA, SOY JEFE, el encargado del enjambre FerAgent de Fer.\nCuéntale un chiste a Fer y léeselo.", "and the text, whole, as it is")
        check(not page.is_visible(card + " .mc-tech pre"), "nothing technical in sight (page, address, step: in «Details», closed)")
        buttons = page.eval_on_selector_all(card + " .p-actions button", "bs => bs.map(b => b.textContent)")
        check(buttons == ["Enviar", "Corregir", "Rechazar"], f"with «Send», «Correct» and «Reject»: {buttons}")
        order = page.eval_on_selector_all("#messages > .msg", "ms => ms.map(m => m.classList.contains('approval') ? 'CARD' : m.innerText.split('\\n')[0])")
        idx = lambda t: next((i for i, x in enumerate(order) if x.startswith(t)), -1)
        check(idx("CARD") < idx("Mensaje de después") and idx("Respuesta de antes") < idx("CARD"),
              f"the card goes in its place, by time: your later messages come after it, in sight (before, it stayed stuck at the end): {order}")
        page.screenshot(path=os.path.join(OUTPUT, "v921-1-chat-card.png"))
        # the same card in the inbox, and on a phone
        page.click("#closeChat"); page.click("#openInbox"); page.wait_for_selector("#inboxView:not([hidden]) .request.mailcard")
        check(page.inner_text("#inboxView .request.mailcard .mc-head b") == "Jefe quiere enviar este correo", "in the inbox, the same email card")
        page.screenshot(path=os.path.join(OUTPUT, "v921-3-inbox.png"))
        page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(400)
        check(page.evaluate("document.documentElement.scrollWidth") <= 392, "on a phone it fits (no sideways scroll)")
        page.screenshot(path=os.path.join(OUTPUT, "v921-4-phone.png"))
        page.set_viewport_size({"width": 1360, "height": 900})
        page.click("#closeInbox") if page.is_visible("#closeInbox") else page.keyboard.press("Escape")
        chat_with(page, "Jefe"); page.wait_for_selector(card)
        page.click(card + " button:text-is('Corregir')")
        check(page.is_visible(card + " .p-fix textarea"), "«Correct» opens a box to write what to change")
        page.fill(card + " .p-fix textarea", "Más corto y con un saludo a Leti")
        page.screenshot(path=os.path.join(OUTPUT, "v921-2-correct.png"))
        page.click(card + " button:text-is('Enviar la corrección')")
        page.wait_for_function("JSON.parse(localStorage.getItem('ferAgent.state')).approvals[0].state === 'corrected'", timeout=10000)
        e = state(page); j = next(a for a in e["agents"] if a["role"] == "boss")
        check(any("Más corto y con un saludo a Leti" in t["text"] for t in j["tasks"]), "the correction reaches the agent as a task (it changes it and asks again)")
        check(not page.is_visible(card), "and the card goes away: nothing went out")
        check(not errors, f"no errors on the page: {errors[:3]}")
        b.close()
finally:
    server.terminate()
print("RESULT:", "ALL OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
