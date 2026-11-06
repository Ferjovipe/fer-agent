// =====================================================================
// Fer Agent · THE HOME PAGE (landing)
// Every text goes through tr() (textos.js): they're translated without touching this file.
// =====================================================================
// figura(aspecto, img): paints the character with its colours inside the image
// Downloading the app: the latest version published on GitHub (no sign-up)
const DOWNLOAD = "https://github.com/Ferjovipe/fer-agent/releases/latest";
export function renderLanding(cont, { h, enter, figure, languages, language, changeLanguage }) {
  cont.innerHTML = "";
  const BUILT_IN = [
    ["boy", null, "The boss", "Your way of talking to the building: leads the team and chairs the meetings. Give it any name you like."],
    ["grandpa", null, "The sages", "Two advisers with the most powerful brains, only for important decisions."],
    ["boy", "#2A2C36", "Techie", "The technician: onboarding, checks, backups and costs."],
    ["boy", "#E8C22C", "Artie", "Continuous improvement: follows what's new in AI and suggests improvements."],
    ["girl", "#7B3FB5", "Agent Creator", "Tell it in your own words what agent you want and it fills in the profile for you."],
    ["boy", "#8E1B2C", "JEV", "Before spending, it decides whether to go ahead, reuse what's there or stop."],
    ["girl", "#2E9E5B", "Controller", "Watches the spending and freezes the least important agents near the cap."],
    ["girl", "#1F3A93", "Memory", "Keeps the building's memory and searches it when you say “remember”."]
  ];
  cont.append(
    h("section", { class: "hero" },
      h("img", { src: "img/portada.webp", alt: "" }),
      languages ? h("div", { class: "landing-languages", role: "group", "aria-label": "Language" }, Object.entries(languages).map(([k, t]) =>
        h("button", { type: "button", lang: k, "aria-pressed": String(k === language), onclick: () => { if (k !== language) changeLanguage(k); } }, k.toUpperCase() + " · " + t))) : null,
      h("div", { class: "hero-txt" },
        h("span", { class: "landing-brand" }, "Fer Agent"),
        h("h1", {}, "You have an agentic company at your service."),
        h("p", {}, "We lay the foundations. You decide the org chart and what each agent does."),
        h("div", { class: "hero-buttons" },
          h("button", { class: "button-big", type: "button", onclick: enter }, "Enter the building"),
          // the Mac and Windows app, without asking for anything (not shown inside the app itself)
          /Electron\//.test(navigator.userAgent) ? null : h("a", { class: "button-outline", href: DOWNLOAD, target: "_blank", rel: "noopener" }, "Download the app")),
        h("span", { class: "small-print" }, "Open source · Free · Mac, Windows or in the browser · Works with your OpenRouter key or your subscription's API")),
      h("button", { class: "download", type: "button", onclick: () => cont.querySelector(".section-l").scrollIntoView({ behavior: "smooth" }) }, "How it works ↓")),
    h("section", { class: "section-l" },
      h("h2", {}, "How it works"),
      h("p", {}, "A building is your organisation. Each floor is a team with its own job; each agent, a profile with its brain, its heartbeat and its capabilities."),
      h("div", { class: "steps" },
        h("div", { class: "step" }, h("span", { class: "num" }, "1"), h("h3", {}, "Build your floors"), h("p", {}, "Create the floors you need and give each one its job. On the left, the section head's office; on the right, the offices.")),
        h("div", { class: "step" }, h("span", { class: "num" }, "2"), h("h3", {}, "Create your agents"), h("p", {}, "Fill in their profile or tell the Creator in your own words what you want. You choose their brain, how often they wake up and how they look.")),
        h("div", { class: "step" }, h("span", { class: "num" }, "3"), h("h3", {}, "Talk to each of them"), h("p", {}, "In writing or out loud, each agent with its own voice. And when needed, bring them together in the meeting room.")))),
    h("section", { class: "section-l" },
      h("h2", {}, "Built-in agents"),
      h("p", {}, "You start with just the boss: if you only want one agent, you already have it. Install these whenever you like, one by one or the whole team, from “Built-in agents”."),
      h("div", { class: "builtin" }, BUILT_IN.map(([p, clothes, name, text]) => { const im = h("img", { alt: "" }); figure({ p, clothes }, im); return h("div", {}, im, h("span", {}, h("b", {}, name), h("small", {}, text))); }))),
    h("section", { class: "section-l" },
      h("h2", {}, "Spending, under control"),
      h("p", {}, "Pay-per-use goes through your OpenRouter key, so everything is visible and everything has a brake. What comes out of your subscription is tracked separately."),
      h("div", { class: "control" },
        h("div", {}, h("b", {}, "Caps that freeze"), h("span", {}, "A daily cap and a monthly one. As they get close, the least important agents are frozen first.")),
        h("div", {}, h("b", {}, "JEV before spending"), h("span", {}, "Before searching, retrying or creating another agent, JEV decides whether it's worth it.")),
        h("div", {}, h("b", {}, "Coins and lessons"), h("span", {}, "Gold and red coins that become lessons for everyone with the same role.")),
        h("div", {}, h("b", {}, "The meter, always in sight"), h("span", {}, "What each agent, each floor and the whole building spends.")))),
    h("section", { class: "section-l" },
      h("h2", {}, "Live wherever you like"),
      h("p", {}, "The same building works in four places, and you take it from one to another with a backup."),
      h("div", { class: "places" },
        h("div", {}, h("b", {}, "On your computer"), h("span", {}, "The Mac and Windows app: it installs with a double click and the agents get hands (they browse, and read and write in their folder)."),
          /Electron\//.test(navigator.userAgent) ? null : h("a", { href: DOWNLOAD, target: "_blank", rel: "noopener" }, "Download")),
        h("div", {}, h("b", {}, "In your browser"), h("span", {}, "Nothing to install. The agents work while the website is open.")),
        h("div", {}, h("b", {}, "On a computer or phone that stays on"), h("span", {}, "Fer Home keeps it working around the clock, with everything else closed.")),
        h("div", {}, h("b", {}, "In the cloud"), h("span", {}, "The same program on a rented server.")))),
    h("section", { class: "section-l" },
      h("h2", {}, "Open source"),
      h("p", {}, "Your key, your data and your building. Nothing goes through our servers. Build it your way and create whatever you like on top."),
      h("p", { class: "landing-notice" }, "Fer Agent is free, open-source software, provided “as is”, without warranty of any kind. The agents are artificial intelligence programs and can make mistakes: you decide what they do and you use them at your own risk. Check what they propose before you say yes.")),
    h("section", { class: "section-l final-l" },
      h("h2", {}, "Your agentic company is waiting."),
      h("button", { class: "button-big", type: "button", onclick: enter }, "Enter the building")));
}
