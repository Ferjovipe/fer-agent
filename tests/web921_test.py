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
          e.approvals = [{ id: 'au_test1', ts: Date.now(), agent: j.id, name: j.name, what: 'En mail.google.com: pulsar «Enviar» (enviar o publicar)', detail: d, cost: 0,
            action: { web: { action: 'click', element: 3, label: 'Enviar', url: 'https://mail.google.com/' }, effect: 'send' }, signature: 'x', state: 'pending', result: '', effect: 'send' }];
          localStorage.setItem('ferAgent.state', JSON.stringify(e)); }""", DETAIL)
        page.reload(); enter(page, team=False)
        chat_with(page, "Jefe")
        card = "#messages .msg.approval .request"
        page.wait_for_selector(card)
        txt = page.inner_text(card)
        check(DETAIL in txt, "in the agent's own chat: exactly what goes out, in full, as it is (line breaks kept, not translated)")
        buttons = page.eval_on_selector_all(card + " .p-actions button", "bs => bs.map(b => b.textContent)")
        check(buttons == ["Enviar", "Corregir", "Rechazar"], f"with «Send», «Correct» and «Reject»: {buttons}")
        page.screenshot(path=os.path.join(OUTPUT, "v921-1-chat-card.png"))
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
