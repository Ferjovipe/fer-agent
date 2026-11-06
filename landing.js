// =====================================================================
// Fer Agent · LA PORTADA (landing)
// Todos los textos pasan por tr() (textos.js): se traducen sin tocar este archivo.
// =====================================================================
// figura(aspecto, img): pinta el personaje con sus colores dentro de la imagen
// La descarga de la aplicación: la última versión publicada en GitHub (sin registro)
const DESCARGA = "https://github.com/Ferjovipe/fer-agent/releases/latest";
export function pintarLanding(cont, { h, entrar, figura, idiomas, idioma, cambiarIdioma }) {
  cont.innerHTML = "";
  const SERIE = [
    ["chico", null, "El jefe", "Tu forma de hablar con el edificio: dirige el equipo y modera las reuniones. Ponle el nombre que quieras."],
    ["abuelo", null, "Los sabios", "Dos consejeros con los cerebros más potentes, solo para decisiones importantes."],
    ["chico", "#2A2C36", "Tecno", "El técnico: altas, control, copias de seguridad y costes."],
    ["chico", "#E8C22C", "Arturito", "Mejora continua: sigue las novedades de la IA y propone mejoras."],
    ["chica", "#7B3FB5", "Creador de agentes", "Le cuentas con tus palabras qué agente quieres y te rellena su ficha."],
    ["chico", "#8E1B2C", "JEV", "Antes de gastar, decide si seguir, aprovechar lo que hay o parar."],
    ["chica", "#2E9E5B", "Interventor", "Vigila el gasto y congela a los menos importantes cerca del tope."],
    ["chica", "#1F3A93", "Memory", "Guarda la memoria del edificio y la busca cuando dices «recuerdas»."]
  ];
  cont.append(
    h("section", { class: "heroe" },
      h("img", { src: "img/portada.webp", alt: "" }),
      idiomas ? h("div", { class: "idiomas-landing", role: "group", "aria-label": "Idioma" }, Object.entries(idiomas).map(([k, t]) =>
        h("button", { type: "button", lang: k, "aria-pressed": String(k === idioma), onclick: () => { if (k !== idioma) cambiarIdioma(k); } }, k.toUpperCase() + " · " + t))) : null,
      h("div", { class: "heroe-txt" },
        h("span", { class: "marca-landing" }, "Fer Agent"),
        h("h1", {}, "Tienes una empresa agéntica a tu servicio."),
        h("p", {}, "Nosotros ponemos la base. Tú decides el organigrama y qué hace cada agente."),
        h("div", { class: "botones-heroe" },
          h("button", { class: "boton-grande", type: "button", onclick: entrar }, "Entrar en el edificio"),
          // la aplicación de Mac y Windows, sin pedir nada (no se enseña dentro de la propia aplicación)
          /Electron\//.test(navigator.userAgent) ? null : h("a", { class: "boton-borde", href: DESCARGA, target: "_blank", rel: "noopener" }, "Descargar la aplicación")),
        h("span", { class: "letra-pequena" }, "Código abierto · Gratis · Mac, Windows o en el navegador · Funciona con tu clave de OpenRouter o con la API de tu suscripción")),
      h("button", { class: "bajar", type: "button", onclick: () => cont.querySelector(".seccion-l").scrollIntoView({ behavior: "smooth" }) }, "Cómo funciona ↓")),
    h("section", { class: "seccion-l" },
      h("h2", {}, "Cómo funciona"),
      h("p", {}, "Un edificio es tu organización. Cada piso, un equipo con su función; cada agente, una ficha con su cerebro, su latido y sus capacidades."),
      h("div", { class: "pasos" },
        h("div", { class: "paso" }, h("span", { class: "num" }, "1"), h("h3", {}, "Levanta tus pisos"), h("p", {}, "Crea los pisos que necesites y ponle a cada uno su función. A la izquierda, el despacho del jefe de sección; a la derecha, las oficinas.")),
        h("div", { class: "paso" }, h("span", { class: "num" }, "2"), h("h3", {}, "Crea tus agentes"), h("p", {}, "Rellena su ficha o cuéntale al Creador con tus palabras qué quieres. Eliges su cerebro, cada cuánto se despierta y su aspecto.")),
        h("div", { class: "paso" }, h("span", { class: "num" }, "3"), h("h3", {}, "Habla con cada uno"), h("p", {}, "Por escrito o de viva voz, cada agente con su propia voz. Y cuando haga falta, reúnelos en la sala de reuniones.")))),
    h("section", { class: "seccion-l" },
      h("h2", {}, "Agentes de serie"),
      h("p", {}, "Empiezas solo con el jefe: si quieres un solo agente, ya lo tienes. Estos los instalas cuando quieras, uno a uno o el equipo entero, desde «Agentes de serie»."),
      h("div", { class: "serie" }, SERIE.map(([p, ropa, nombre, texto]) => { const im = h("img", { alt: "" }); figura({ p, ropa }, im); return h("div", {}, im, h("span", {}, h("b", {}, nombre), h("small", {}, texto))); }))),
    h("section", { class: "seccion-l" },
      h("h2", {}, "El gasto, bajo control"),
      h("p", {}, "Lo que se paga por uso va por tu clave de OpenRouter, así que todo se ve y todo tiene freno. Lo que sale de tu suscripción se apunta aparte."),
      h("div", { class: "control" },
        h("div", {}, h("b", {}, "Topes que congelan"), h("span", {}, "Un tope diario y otro mensual. Al acercarse, se congelan primero los menos importantes.")),
        h("div", {}, h("b", {}, "JEV antes de gastar"), h("span", {}, "Antes de buscar, reintentar o crear otro agente, JEV decide si merece la pena.")),
        h("div", {}, h("b", {}, "Monedas y lecciones"), h("span", {}, "Monedas doradas y rojas que se convierten en lecciones para los de su mismo papel.")),
        h("div", {}, h("b", {}, "El contador, siempre a la vista"), h("span", {}, "Lo que gasta cada agente, cada planta y el edificio entero.")))),
    h("section", { class: "seccion-l" },
      h("h2", {}, "Vive donde quieras"),
      h("p", {}, "El mismo edificio funciona en cuatro sitios, y te lo llevas de uno a otro con una copia."),
      h("div", { class: "lugares" },
        h("div", {}, h("b", {}, "En tu ordenador"), h("span", {}, "La aplicación de Mac y Windows: se instala con doble clic y los agentes tienen manos (navegan, leen y escriben en su carpeta)."),
          /Electron\//.test(navigator.userAgent) ? null : h("a", { href: DESCARGA, target: "_blank", rel: "noopener" }, "Descargar")),
        h("div", {}, h("b", {}, "En tu navegador"), h("span", {}, "Sin instalar nada. Los agentes trabajan mientras la web esté abierta.")),
        h("div", {}, h("b", {}, "En un ordenador o un móvil encendidos"), h("span", {}, "Fer Casa lo mantiene trabajando las 24 horas, con todo lo demás cerrado.")),
        h("div", {}, h("b", {}, "En la nube"), h("span", {}, "El mismo programa en un servidor alquilado.")))),
    h("section", { class: "seccion-l" },
      h("h2", {}, "Código abierto"),
      h("p", {}, "Tu clave, tus datos y tu edificio. Nada pasa por nuestros servidores. Constrúyelo a tu manera y crea encima lo que quieras."),
      h("p", { class: "aviso-l" }, "Fer Agent es software libre y gratuito, y se ofrece tal cual, sin garantías de ningún tipo. Los agentes son programas de inteligencia artificial y pueden equivocarse: tú decides qué hacen y los usas bajo tu propia responsabilidad. Revisa lo que proponen antes de darles tu sí.")),
    h("section", { class: "seccion-l final-l" },
      h("h2", {}, "Tu empresa agéntica te espera."),
      h("button", { class: "boton-grande", type: "button", onclick: entrar }, "Entrar en el edificio")));
}
