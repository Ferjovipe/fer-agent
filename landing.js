// =====================================================================
// Fer Agent · THE HOME PAGE (landing)
// Every text goes through tr() (languages.js): they're translated without touching this file.
// =====================================================================
// figura(aspecto, img): paints the character with its colours inside the image
// Downloading the app: the latest version published on GitHub (no sign-up)
const DOWNLOAD = "https://github.com/Ferjovipe/fer-agent/releases/latest";
// the installers of the latest version, straight away (their names don't change from one version to the next)
const DOWNLOAD_MAC = DOWNLOAD + "/download/Fer-Agent-mac.dmg", DOWNLOAD_WINDOWS = DOWNLOAD + "/download/Fer-Agent-windows.exe";
// the video lives on the website; anywhere else (the desktop app, Fer Home, a copy on your computer) it plays from there
const VIDEO_HOME = location.hostname === "feragent.netlify.app" ? "" : "https://feragent.netlify.app/";
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
      h("img", { src: "img/landing.webp", alt: "" }),
      languages ? h("div", { class: "landing-languages", role: "group", "aria-label": "Language" }, Object.entries(languages).map(([k, t]) =>
        h("button", { type: "button", lang: k, "aria-pressed": String(k === language), onclick: () => { if (k !== language) changeLanguage(k); } }, k.toUpperCase() + " · " + t))) : null,
      h("div", { class: "hero-txt" },
        h("img", { class: "landing-logo", src: "img/logo.webp", alt: "Fer Agent", width: "1200", height: "324" }),
        h("h1", {}, "Your team of AI agents, working for you."),
        h("p", {}, "Create agents that read your email, search the internet, prepare documents and meet with each other. You decide what each one does, and they ask your permission before sending, paying or spending."),
        h("div", { class: "hero-buttons" },
          h("button", { class: "button-big", type: "button", onclick: enter }, "Enter the building"),
          // the Mac and Windows app, without asking for anything (not shown inside the app itself)
          ...(/Electron\//.test(navigator.userAgent) ? [] : [h("a", { class: "button-outline", href: DOWNLOAD_MAC, rel: "noopener" }, "Download for Mac"),
            h("a", { class: "button-outline", href: DOWNLOAD_WINDOWS, rel: "noopener" }, "Download for Windows")])),
        h("span", { class: "small-print" }, "Free and open source · Mac, Windows or the browser · With the AI you choose")),
      h("button", { class: "download", type: "button", onclick: () => cont.querySelector(".section-l").scrollIntoView({ behavior: "smooth" }) }, "How it works ↓")),
    // the launch video, in the website's language. The desktop app and Fer Home don't carry the video files: they play it from the website
    h("section", { class: "section-l video-l" },
      h("h2", {}, "Fer Agent in under a minute"),
      h("video", { class: "promo", controls: true, playsinline: true, preload: "none", poster: `${VIDEO_HOME}video/poster-${language === "es" ? "es" : "en"}.jpg`, src: `${VIDEO_HOME}video/feragent-${language === "es" ? "es" : "en"}.mp4` })),
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
      h("p", {}, "Everything you spend is visible and has a brake: your OpenRouter key and your own keys from other companies, all in the same counter and the same cap."),
      h("div", { class: "control" },
        h("div", {}, h("b", {}, "Caps that freeze"), h("span", {}, "A daily cap and a monthly one. As they get close, the least important agents are frozen first.")),
        h("div", {}, h("b", {}, "JEV before spending"), h("span", {}, "Before searching, retrying or creating another agent, JEV decides whether it's worth it.")),
        h("div", {}, h("b", {}, "Coins and lessons"), h("span", {}, "Gold and red coins that become lessons: you decide who learns them, one agent or the whole team.")),
        h("div", {}, h("b", {}, "The meter, always in sight"), h("span", {}, "What each agent, each floor and the whole building spends.")))),
    h("section", { class: "section-l" },
      h("h2", {}, "Live wherever you like"),
      h("p", {}, "The same building works in four places, and you take it from one to another with a backup."),
      h("div", { class: "places" },
        h("div", {}, h("b", {}, "On your computer"), h("span", {}, "The Mac and Windows app: it installs with a double click and the agents use the internet and your computer as you do."),
          /Electron\//.test(navigator.userAgent) ? null : h("a", { href: DOWNLOAD, target: "_blank", rel: "noopener" }, "Download")),
        h("div", {}, h("b", {}, "In your browser"), h("span", {}, "Nothing to install. The agents work while the website is open.")),
        h("div", {}, h("b", {}, "On a computer or phone that stays on"), h("span", {}, "Fer Home keeps it working around the clock, with everything else closed.")),
        h("div", {}, h("b", {}, "In the cloud"), h("span", {}, "The same program on a rented server.")))),
    // 9.2 · What an agent is and what you risk: in sight, before entering
    h("section", { class: "section-l landing-risks" },
      h("h2", {}, "What an agent is, and what you risk"),
      h("p", {}, "An agent is an artificial intelligence program that acts on its own. Today's agents make mistakes: they misunderstand orders, make things up and can be fooled by a website or an email with hidden instructions."),
      h("p", {}, "With «Internet as you» and «Your computer as you» an agent uses your sessions and your computer as if it were you: it can send, publish, buy, pay, delete or change things in your name."),
      h("p", {}, "You decide, agent by agent, what it does without asking you. Whatever it does happens under your responsibility. Give each one only what it needs, set a spending cap and, for money, use accounts and cards with low limits.")),
    h("section", { class: "section-l" },
      h("h2", {}, "Open source"),
      h("p", {}, "Your key, your data and your building. Nothing goes through our servers. Build it your way and create whatever you like on top."),
      h("p", { class: "landing-notice" }, "Fer Agent is free, open-source software, provided “as is”, without warranty of any kind. The agents are artificial intelligence programs and can make mistakes: you decide what they do and you use them at your own risk. Check what they propose before you say yes.")),
    h("section", { class: "section-l final-l" },
      h("h2", {}, "Your agentic company is waiting."),
      h("button", { class: "button-big", type: "button", onclick: enter }, "Enter the building"),
      // the credit: who made it and for whom
      h("div", { class: "landing-credit" },
        h("a", { href: "https://aithehive.com", target: "_blank", rel: "noopener" }, h("img", { src: "img/thehive.webp", alt: "AI The Hive" })),
        h("span", {}, "A product by Fernando Villar Peláez (Ferjovipe) for AI The Hive"),
        h("span", {}, h("a", { href: "https://aithehive.com", target: "_blank", rel: "noopener" }, "aithehive.com"), " · ",
          h("a", { href: "https://fernandovillarpelaez.com", target: "_blank", rel: "noopener" }, "fernandovillarpelaez.com")))));
}
