"""Version 9: a browser that used an earlier version keeps everything.
Before version 9 the browser kept the building under «ferEdificio.estado» (Spanish field names), the images in the
«medios» store, the Library in «biblio» and other names in Spanish. Opening version 9 must move all of it, once:
- the building moves to the English names, and the building as it was is kept apart (Settings → backups: «Download it»);
- the images, the Library and the brain folder's sync keep working;
- the language chosen, the key and the PIN are kept.
Usage: python3 pruebas/web9_storage_test.py"""
import json, os, sys, re, time, subprocess
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_test.py")).read()
exec(src[:src.index("server = subprocess.Popen")].replace("PORT = 8811", "PORT = 8818"))

OLD = open(os.path.join(ROOT, "pruebas", "edificio-v8.json"), encoding="utf-8").read()
old = json.loads(OLD)
PNG_URL = "data:image/png;base64," + PNG
# a message of the boss's chat with an image saved in the browser (as version 8 saved them)
old["conversacion"].append({"role": "informe", "agente": "jefe", "nombre": "Jefe", "content": "Aquí va la imagen.", "ts": 1793948700000, "medios": [{"id": "med_v8", "tipo": "imagen", "texto": "un gato"}]})
OLD = json.dumps(old, ensure_ascii=False)
SEED = """async (old) => {
  localStorage.clear();
  localStorage.setItem('ferEdificio.estado', old);
  localStorage.setItem('ferAgent.key', 'sk-or-test');
  localStorage.setItem('ferAgent.idioma', 'es');
  localStorage.setItem('ferAgent.ultimaCopia', '1793948000000');
  localStorage.setItem('ferAgent.aparato', 'ap_viejo1');
  localStorage.setItem('ferEdificio.altavoz', '1');
  localStorage.setItem('ferEdificio.vista', 'franjas');
  await new Promise((res, rej) => { const d = indexedDB.deleteDatabase('fer-agent'); d.onsuccess = res; d.onerror = rej; d.onblocked = res; });
  const db = await new Promise((res, rej) => { const r = indexedDB.open('fer-agent', 1);
    r.onupgradeneeded = () => { for (const n of ['medios', 'kv', 'biblio']) r.result.createObjectStore(n); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = (store, key, value) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = res; tx.onerror = rej; });
  await put('medios', 'med_v8', { id: 'med_v8', url: '""" + PNG_URL + """', tipo: 'imagen', texto: 'un gato', ts: 1 });
  await put('biblio', 'navegador:Biblioteca/receta.md', { modificado: 5, texto: 'Receta secreta: tortilla con cebolla.' });
  await put('kv', 'cerebroSync', { tipo: 'local', ultimaSync: 7, miEdificio: 3, vistoEdificio: 4 });
  db.close();
}"""
READ_IDB = """async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('fer-agent'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const stores = [...db.objectStoreNames].sort();
  const get = (s, k) => new Promise((res) => { const q = db.transaction(s).objectStore(s).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  const keys = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
  const out = { version: db.version, stores, media: stores.includes('media') ? await get('media', 'med_v8') : null, library: stores.includes('library') ? await keys('library') : [],
    sync: await get('kv', 'brainSync'), oldSync: await get('kv', 'cerebroSync'), beforeV9: await get('kv', 'beforeV9') };
  db.close(); return out;
}"""

server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900})
        ctx.route("https://**/*", router)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # what version 8 left in this browser (on the same address, before opening the website)
        page.goto(f"http://localhost:{PORT}/pruebas/punto.png")
        page.evaluate(SEED, OLD)
        page.goto(URL); enter(page, team=False); page.wait_for_selector(".tramo")
        page.wait_for_timeout(800)
        e = state(page)
        check(e and isinstance(e.get("agents"), list) and len(e["agents"]) == len(old["agentes"]) and not any(k in e for k in ("agentes", "plantas", "ajustes")),
              "the building moved to the English names with all its agents")
        check([a["id"] for a in e["agents"][:4]] == ["boss", "sage1", "sage2", "techie"] and e["floors"][0]["id"] == "dome", "the built-in agents and floors, with their new ids")
        ls = page.evaluate("() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))")
        check(not any(k.startswith("ferEdificio.") or k in ("ferAgent.idioma", "ferAgent.ultimaCopia", "ferAgent.aparato") for k in ls),
              f"nothing is left under the old names in this browser: {sorted(ls)}")
        check(ls.get("ferAgent.key") == "sk-or-test" and ls.get("ferAgent.language") == "es" and ls.get("ferAgent.device") == "ap_viejo1"
              and ls.get("ferAgent.lastBackup") == "1793948000000" and ls.get("ferAgent.speaker") == "1", "the key, the language, the device, the last backup and the speaker stay")
        check(page.evaluate("document.documentElement.lang") == "es" and page.is_visible("#abrirAjustes"), "the website still opens in Spanish")
        idb = page.evaluate(READ_IDB)
        check(idb["version"] == 2 and idb["stores"] == ["kv", "library", "media"], f"the browser's stores, with the new names: {idb['stores']} (version {idb['version']})")
        check(idb["media"] and idb["media"]["url"] == PNG_URL and idb["media"]["type"] == "image" and idb["media"]["text"] == "un gato", "the images saved before version 9 are still there")
        check(idb["library"] == ["browser:Biblioteca/receta.md"], f"the Library saved in this browser is still there: {idb['library']}")
        check(idb["sync"] == {"type": "local", "lastSync": 7, "myBuilding": 3, "seenBuilding": 4} and idb["oldSync"] is None, "the brain folder's sync, with the new names")
        check(idb["beforeV9"] == OLD, "the building as it was before version 9 is kept apart, exactly")
        # the image in the boss's chat
        page.click("#hablarJefe"); page.wait_for_selector("#vistaChat:not([hidden])"); page.wait_for_timeout(600)
        srcs = page.eval_on_selector_all("#mensajes .burbuja img", "is => is.map((i) => i.src)")
        check(any(s.startswith("data:image/png") for s in srcs), "the image of the earlier chat is shown")
        page.click("#cerrarChat")
        # Settings → the building from before version 9, to download
        page.click("#abrirAjustes"); page.wait_for_selector("#cajon:not([hidden])")
        check(page.is_visible("#cajonCuerpo >> text=Tu edificio de antes de la versión 9, tal como estaba."), "Settings offers the building from before version 9")
        with page.expect_download() as d: page.click("#cajonCuerpo .fila-c:has-text('antes de la versión 9') button")
        check(open(d.value.path(), encoding="utf-8").read() == OLD and d.value.suggested_filename == "fer-agent-before-version-9.json", "and it downloads exactly as it was")
        # opening again: nothing moves twice
        page.reload(); page.wait_for_selector("#landing .boton-grande, .tramo", timeout=15000); page.wait_for_timeout(600)
        check(state(page)["agents"] == e["agents"] or len(state(page)["agents"]) == len(e["agents"]), "opening it again changes nothing")
        check(not errors, f"no errors on the page: {errors}")
        b.close()
finally:
    server.terminate()
print("RESULT:", "OK" if ok else "FAILURES")
sys.exit(0 if ok else 1)
