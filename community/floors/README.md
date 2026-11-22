# Plantas de la comunidad · Community floors

**Español**

Aquí están las plantas que la gente comparte: un equipo entero (la planta, su función y sus agentes) listo para cargar en Fer Agent con un toque, desde **Crear piso → Plantas de la comunidad**.

Para compartir una tuya:

1. En Fer Agent, entra en la planta y pulsa **Guardar en un archivo**. El archivo lleva su nombre, su función y sus agentes (instrucciones, objetivo, cerebro, latido y capacidades). No lleva memoria, tareas, gasto, documentos, buzones, Telegram ni claves.
2. Ábrelo con un editor de texto y revísalo: que no haya datos personales ni de clientes en las instrucciones. Si quieres que salga tu nombre, añade `"author": "Tu nombre"`.
3. Manda el archivo al proyecto: un *pull request* que lo añada a esta carpeta, o un *issue* con el archivo adjunto.
4. Antes de aceptarlo se comprueba con `node community/check-floors.mjs`, que revisa cada archivo (la misma comprobación que hace la app al cargarlo) y rehace `index.json`, la lista que lee la app.

Quién lleva el proyecto decide qué plantas entran.

Al cargar una planta, sus agentes entran con **«Pregúntame antes»**: antes de cualquier cosa con efecto fuera (enviar, publicar, comprar, borrar…) te preguntan en la bandeja. Lee sus instrucciones antes de añadirla, porque lo que hacen depende de ellas.

---

**English**

Floors shared by people: a whole team (the floor, its job and its agents) ready to load into Fer Agent with one tap, from **Create floor → Community floors**.

To share one of yours:

1. In Fer Agent, open the floor and press **Save to a file**. The file has its name, its job and its agents (instructions, objective, brain, heartbeat and capabilities). It doesn't have memory, tasks, spending, documents, mailboxes, Telegram or keys.
2. Open it in a text editor and check it: no personal or customer data in the instructions. If you want your name shown, add `"author": "Your name"`.
3. Send the file to the project: a pull request adding it to this folder, or an issue with the file attached.
4. Before it's accepted, it's checked with `node community/check-floors.mjs`. That script checks each file (the same check the app does when loading one) and rebuilds `index.json`, the list the app reads.

Whoever runs the project decides which floors go in.

When a floor is loaded, its agents come in with **"Ask me first"**: before anything with an effect outside (sending, publishing, buying, deleting…) they ask you in the inbox. Read their instructions before adding it, because what they do depends on them.
