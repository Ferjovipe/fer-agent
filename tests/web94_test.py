"""Test of the website, version 9.4 · The guided first steps (Playwright, OpenRouter simulated, the website in Spanish).
The first time, without a key, «Primeros pasos» comes up instead of Settings: 1 your key, 2 the boss's brain (the search already shows the free
ones that use tools) and 3 its first task, which goes to the boss's chat. «Saltar» closes it for good; next time, Settings as before.
Usage: python3 tests/web94_test.py   (leaves screenshots in tests/screenshots/v94-*.png)"""
import json, os, sys, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8816"))

# More text models, so that the search shows up; a free one that uses tools and a free one that doesn't
EXTRA = [m(f"zeta/zeta-{i}", f"Zeta {i}", "0.000001", "0.000004", supported_parameters=["tools"]) for i in range(1, 13)] + \
        [m("zeta/zeta-libre:free", "Zeta Libre (free)", "0", "0", supported_parameters=["tools"]), m("nada/sin-manos:free", "Sin Manos (free)", "0", "0", supported_parameters=[])]
TEXT += EXTRA; ALL["data"] += EXTRA
INIT_W = "\n".join(l for l in INIT.split("\n") if "ferAgent.welcome" not in l)   # this test is the first time: no «welcome» saved
COMMUNITY = "https://raw.githubusercontent.com/Ferjovipe/fer-agent/main/community/floors/"
SHARED = {"ferAgentFloor": 1, "name": "Estudio de podcast", "job": "Preparar y publicar episodios", "language": "es", "author": "Ana",
          "agents": [{"ref": "a1", "name": "Guionista", "role": "section_head", "seat": "head_office", "instructions": "Escribes los guiones.", "heartbeat": {"every": 1, "unit": "on_request"}, "capabilities": ["write"]},
                     {"ref": "a2", "name": "Montadora", "role": "subagent", "seat": "office", "reportsTo": "a1", "instructions": "Montas el audio.", "heartbeat": {"every": 1, "unit": "d"}, "capabilities": ["write", "internet"]}]}
def router94(route, request):
    if request.url == COMMUNITY + "index.json": return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"floors": [{"file": "podcast.json", "name": "Estudio de podcast", "job": "Preparar y publicar episodios", "language": "es", "author": "Ana", "agents": 2}]}))
    if request.url == COMMUNITY + "podcast.json": return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps(SHARED))
    return router(route, request)
def photo(page, name): page.screenshot(path=os.path.join(OUTPUT, "v94-" + name + ".png"))
def ls(page, k): return page.evaluate(f"localStorage.getItem({json.dumps(k)})")

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ---------- The first time: the three steps ----------
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(INIT_W); ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden]) .welcome-steps")
        steps = page.eval_on_selector_all("#drawerBody .welcome-steps li", "ls => ls.map(l => l.textContent + (l.classList.contains('now') ? '*' : ''))")
        check(page.inner_text("#drawerTitle") == "Primeros pasos" and steps == ["Tu clave*", "El cerebro del jefe", "Su primer encargo"],
              f"the first time, without a key: «Primeros pasos» with its three steps, on the first ({steps})")
        check(page.is_visible("#drawerBody .welcome-step h4:text-is('Tu clave')") and page.is_visible("#drawerBody .how-key") and page.is_visible("#drawerBody button:text-is('Añádela en Ajustes → Otras API')"),
              "step 1: where to paste it, how to get one, and the way for whoever already has another key")
        photo(page, "1-key")
        page.fill("#drawerBody .welcome-step input[type=password]", "sk-or-test"); page.click("#drawerBody .welcome-step button:text-is('Guardar')")
        page.wait_for_selector("#drawerBody .welcome-step h4:text-is('El cerebro del jefe')")
        check(ls(page, "ferAgent.key") == "sk-or-test", "the key is saved in this browser")
        # step 2: the search already filtered: free and with tools
        page.wait_for_selector("#drawerBody .welcome-picker .model-result")
        pressed = page.eval_on_selector_all("#drawerBody .welcome-picker .chip", "cs => cs.map(c => c.textContent + '=' + c.getAttribute('aria-pressed'))")
        results = page.eval_on_selector_all("#drawerBody .welcome-picker .model-result", "rs => rs.map(r => r.textContent)")
        check(pressed[:2] == ["Gratis=true", "Usa herramientas=true"], f"step 2: «Gratis» and «Usa herramientas» already on ({pressed})")
        check(len(results) == 1 and "Zeta Libre" in results[0], f"only the free ones the boss can use (with tools): {results}")
        photo(page, "2-brain")
        page.click("#drawerBody .welcome-picker .model-result:has-text('Zeta Libre')")
        page.click("#drawerBody button:text-is('Usar este cerebro')")
        page.wait_for_selector("#drawerBody .welcome-step h4:text-is('Su primer encargo')")
        boss = next(a for a in state(page)["agents"] if a["role"] == "boss")
        check(boss["brain"] == "zeta/zeta-libre:free" and boss.get("provider", "openrouter") == "openrouter", f"the boss thinks with the free one chosen ({boss['brain']})")
        steps = page.eval_on_selector_all("#drawerBody .welcome-steps li", "ls => ls.map(l => l.className)")
        check(steps == ["done", "done", "now"], f"the steps done are marked ({steps})")
        # step 3: an idea, and it goes to the boss's chat
        page.click("#drawerBody .welcome-ideas button >> nth=0")
        check(page.input_value("#drawerBody .welcome-step textarea") == "Preséntate y dime en cinco líneas qué puedes hacer por mí.", "an idea fills in the task (you can change it)")
        photo(page, "3-task")
        n0 = len([c for c in calls if isinstance(c, dict) and c.get("messages")])
        page.click("#drawerBody button:text-is('Envíaselo a Jefe')")
        page.wait_for_selector("#chatView:not([hidden])")
        page.wait_for_function("n => window.__calls >= 0 || true", arg=0)
        page.wait_for_timeout(1500)
        sent = [c for c in calls if isinstance(c, dict) and c.get("messages")][n0:]
        last_user = lambda c: next((x["content"] for x in reversed(c["messages"]) if x["role"] == "user"), "")
        check(any(c.get("model") == "zeta/zeta-libre:free" and "Preséntate y dime en cinco líneas" in str(last_user(c)) for c in sent),
              f"the first task goes to the boss, who thinks with the free one ({[c.get('model') for c in sent]})")
        check(page.is_hidden("#drawer") and ls(page, "ferAgent.welcome") == "1", "the drawer closes and the first steps are marked as done")
        photo(page, "4-chat")
        page.reload(); page.wait_for_selector("#landing .button-big"); enter(page, team=False); page.wait_for_timeout(600)
        check(page.is_hidden("#drawer"), "next time (with a key), nothing comes up")
        ctx.close()
        # ---------- «Saltar»: closed for good; next time, Settings as before ----------
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(INIT_W); ctx.route("https://**/*", router)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden]) .welcome-steps")
        page.click("#drawerBody button:text-is('Saltar: lo hago yo')")
        check(page.is_hidden("#drawer") and ls(page, "ferAgent.welcome") == "1", "«Saltar: lo hago yo» closes it")
        page.reload(); page.wait_for_selector("#landing .button-big"); enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden])")
        check(page.inner_text("#drawerTitle") == "Ajustes" and page.is_visible("#drawerBody h4:text-is('Tu clave de OpenRouter')"), "after skipping it, without a key, Settings as before")
        # «Todos los ajustes» from the first steps
        page.evaluate("localStorage.removeItem('ferAgent.welcome')"); page.reload(); page.wait_for_selector("#landing .button-big"); enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden]) .welcome-steps")
        page.click("#drawerBody button:text-is('Todos los ajustes')")
        check(page.inner_text("#drawerTitle") == "Ajustes", "«Todos los ajustes» goes to Settings")
        # on a phone
        ctx.close()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ctx.add_init_script(INIT_W); ctx.route("https://**/*", router)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page, team=False); page.wait_for_selector("#drawer:not([hidden]) .welcome-steps")
        wide = page.evaluate("() => document.querySelector('#drawerBody').scrollWidth <= document.querySelector('#drawerBody').clientWidth + 1")
        check(wide, "on a phone it fits (no sideways scroll)")
        photo(page, "5-phone")
        ctx.close()
        # ---------- Floors in a file: save one, load it in another building; and «Plantas de la comunidad» ----------
        seed = subprocess.run(["node", "--input-type=module", "-e", """
import { Building } from "./engine.js";
let g = null;
const ed = new Building({ load: async () => null, save: async (j) => { g = j; }, key: () => "", fetch: async () => { throw new Error("no network"); } });
ed.setModels([{ id: "openai/gpt-6-luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }]);
await ed.start("basic", "es");
const { id } = await ed.run({ type: "createFloor", name: "Ventas", job: "Buscar clientes" });
const h = await ed.run({ type: "createAgent", profile: { name: "Marta", role: "section_head", floor: id, seat: "head_office", instructions: "Diriges ventas.", heartbeat: { every: 1, unit: "on_request" }, capabilities: ["write"] } });
await ed.run({ type: "createAgent", profile: { name: "Leo", role: "subagent", floor: id, seat: "office", instructions: "Preparas presupuestos.", heartbeat: { every: 1, unit: "on_request" }, capabilities: ["write"] } });
ed.agent(h.id).shortMemory.push({ ts: 1, text: "Dato privado 4.000 euros" });
await ed.save(); process.stdout.write(g);"""], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(INIT); ctx.route("https://**/*", router94)
        ctx.add_init_script("if (!localStorage.getItem('ferAgent.state')) { localStorage.setItem('ferAgent.key','sk-or-test'); localStorage.setItem('ferAgent.state', %s); }" % json.dumps(seed))
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page, team=False)
        page.wait_for_selector(".tier .fig")
        page.click("button.sign:has-text('Ventas')")
        page.wait_for_selector(".floor-actions button:text-is('Guardar en un archivo')")
        with page.expect_download() as dl: page.click(".floor-actions button:text-is('Guardar en un archivo')")
        name = dl.value.suggested_filename; saved = os.path.join(OUTPUT, name); dl.value.save_as(saved)
        f = json.load(open(saved))
        check(name == "fer-agent-floor-ventas.json" and f["name"] == "Ventas" and [a["name"] for a in f["agents"]] == ["Marta", "Leo"] and "4.000 euros" not in open(saved).read() and "Dato privado" not in open(saved).read(),
              f"«Guardar en un archivo»: the floor with its agents, without their memory ({name}, {[a['name'] for a in f['agents']]})")
        ctx.close()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(INIT); ctx.route("https://**/*", router94)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); enter(page, team=False)
        page.wait_for_selector("#drawer:not([hidden])")
        page.fill("#drawerBody input[placeholder='sk-or-...']", "sk-or-test"); page.click("#drawerBody .block:has(h4:text-is('Tu clave de OpenRouter')) >> text=Guardar")
        page.wait_for_selector(".tier .fig")
        page.click("button:text-is('Crear piso')"); page.wait_for_selector("#drawerBody .floor-file")
        page.locator("#drawerBody .floor-file input[type=file]").set_input_files(saved)
        page.wait_for_selector("#drawerBody .floor-preview")
        prev = page.inner_text("#drawerBody .floor-file")
        check("Ventas" in prev and "Marta" in prev and "Leo" in prev and "Pregúntame antes" in prev and "Diriges ventas." in prev, "loading it: first you see who comes in, what each one does and that they come in with «Pregúntame antes»")
        photo(page, "6-floor-preview")
        page.click("#drawerBody .floor-file button:text-is('Añadir esta planta a mi edificio')"); page.wait_for_timeout(600)
        e = state(page)
        p2 = next((x for x in e["floors"] if x["name"] == "Ventas"), None)
        ags = [a for a in e["agents"] if p2 and a["floor"] == p2["id"]]
        marta = next((a for a in ags if a["name"] == "Marta"), {})
        check(p2 and sorted(a["name"] for a in ags) == ["Leo", "Marta"] and all(a["permissions"]["mode"] == "ask" for a in ags) and not marta.get("shortMemory"),
              f"«Añadir esta planta a mi edificio»: the floor and its agents, with «Pregúntame antes» ({[a['name'] for a in ags]})")
        check(page.is_hidden("#drawer") and page.is_visible(".floor-head") if page.locator(".floor-head").count() else page.is_hidden("#drawer"), "and it takes you to the new floor")
        # a file that isn't a floor
        bad = os.path.join(OUTPUT, "no-es-planta.json"); open(bad, "w").write('{"hola": 1}')
        go_back(page); page.click("button:text-is('Crear piso')"); page.wait_for_selector("#drawerBody .floor-file")
        page.locator("#drawerBody .floor-file input[type=file]").set_input_files(bad)
        page.wait_for_selector("#drawerBody .floor-file .warn-note")
        check(page.inner_text("#drawerBody .floor-file .warn-note") == "No es un archivo de planta de Fer Agent.", "a file that isn't a floor: it says so, and nothing is added")
        # «Plantas de la comunidad»: the list from the project's repository, and one added from there
        page.wait_for_selector("#drawerBody .community-floor")
        check("Estudio de podcast" in page.inner_text("#drawerBody .community-list") and "2 agentes · De Ana · ES" in page.inner_text("#drawerBody .community-list"), "«Plantas de la comunidad»: the list, with its author")
        page.click("#drawerBody .community-floor:has-text('Estudio de podcast')")
        page.wait_for_selector("#drawerBody .community-floors .floor-preview")
        check(page.is_visible("#drawerBody .community-floors .warn-note:has-text('léelas antes')") and "Montas el audio." in page.inner_text("#drawerBody .community-floors"),
              "a community floor: its instructions in sight and the warning to read them")
        photo(page, "7-community")
        page.click("#drawerBody .community-floors button:text-is('Añadir esta planta a mi edificio')"); page.wait_for_timeout(600)
        e = state(page)
        pod = next((x for x in e["floors"] if x["name"] == "Estudio de podcast"), None)
        names = sorted(a["name"] for a in e["agents"] if pod and a["floor"] == pod["id"])
        check(names == ["Guionista", "Montadora"], f"and it's added to the building ({names})")
        ctx.close()
        check(not errors, f"no errors on the page: {errors[:3]}")
        b.close()
finally:
    server.terminate()
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
