import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalShippedProject, formatShipReport } from "./ship-quality";

describe("evalShippedProject", () => {
  it("fails the exported beginner portfolio pattern", () => {
    const report = evalShippedProject([
      {
        path: "src/index.html",
        content: `<h1>John Doe</h1><img src="headshot.jpg" alt="Developer Headshot"><h3>Project One</h3><p>Description of the project with key features and technologies used.</p>`,
      },
      {
        path: "src/server.js",
        content: `auth: { user: 'your-email@gmail.com', pass: 'your-email-password' }`,
      },
    ]);
    assert.equal(report.passed, false);
    assert.match(formatShipReport(report), /FAIL/);
    assert.ok(report.issues.some((i) => /placeholder/i.test(i.message)));
    assert.ok(report.issues.some((i) => /headshot\.jpg/.test(i.message)));
    assert.ok(report.issues.some((i) => /secrets/i.test(i.message)));
  });

  it("passes a complete static page with inline visuals", () => {
    const report = evalShippedProject([
      {
        path: "index.html",
        content: `<!doctype html><html><body>
          <h1>Maya Cruz</h1>
          <p>Junior MERN developer — 6 months in.</p>
          <a href="#contact">Email Me</a>
          <div class="avatar" aria-hidden="true">MC</div>
          <article><h2>StudyLog</h2><p>A notes app I built with Express and Mongo.</p></article>
          <section id="contact">
            <form id="contact-form">
              <input name="email" type="email">
              <textarea name="message"></textarea>
              <button type="submit">Send</button>
            </form>
            <p id="form-status" hidden>Saved in this browser.</p>
          </section>
          <footer>
            <a href="https://github.com/mayacruz" target="_blank" rel="noopener noreferrer">GitHub</a>
          </footer>
        </body></html>`,
      },
      { path: "styles.css", content: "html{scroll-behavior:smooth}body{font-family:sans-serif}" },
      {
        path: "script.js",
        content: `
          const KEY = "messages";
          const form = document.getElementById("contact-form");
          const status = document.getElementById("form-status");
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const messages = JSON.parse(localStorage.getItem(KEY) || "[]");
            messages.push({ email: form.email.value, message: form.message.value, at: Date.now() });
            localStorage.setItem(KEY, JSON.stringify(messages));
            form.reset();
            status.hidden = false;
          });
        `,
      },
    ]);
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("fails the review's overwrite / inline-JS / hidden-form pattern", () => {
    const report = evalShippedProject([
      {
        path: "index.html",
        content: `<!doctype html><html><body>
          <h1>Maya Cruz</h1>
          <p>Portfolio with a working contact form and three named projects.</p>
          <a href="javascript:void(0);" onclick="openForm()">Email Me</a>
          <form id="contactForm">
            <input name="email" type="email">
            <textarea name="message"></textarea>
            <button type="submit">Send</button>
          </form>
          <a href="https://github.com/mayacruz">GitHub</a>
        </body></html>`,
      },
      {
        path: "script.js",
        content: `
          function openForm() {}
          document.getElementById("contactForm").addEventListener("submit", (e) => {
            e.preventDefault();
            localStorage.setItem("contactMessage", JSON.stringify({ email: "a@b.c" }));
            document.getElementById("contactForm").style.display = "none";
          });
        `,
      },
    ]);
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((i) => /dead CTA|javascript:void/i.test(i.message)));
    assert.ok(report.issues.some((i) => /inline JS/i.test(i.message)));
    assert.ok(report.issues.some((i) => /overwrites a single localStorage key/i.test(i.message)));
    assert.ok(report.issues.some((i) => /display:none/i.test(i.message)));
    assert.ok(report.issues.some((i) => /noopener/i.test(i.message)));
  });

  it("still passes the mock budget tracker", async () => {
    const { MOCK_BUDGET_TRACKER } = await import("./mock-project");
    const files = Object.entries(MOCK_BUDGET_TRACKER).map(([path, content]) => ({
      path,
      content,
    }));
    const report = evalShippedProject(files, { ceoGoal: "personal budget tracker" });
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("does not require HTML from a backend-only agent", () => {
    const report = evalShippedProject(
      [{ path: "data.js", content: "export function save(){ localStorage.setItem('x','1') }" }],
      { role: "backend_engineer" },
    );
    assert.equal(report.passed, true);
  });

  it("fails a PixelCrew portfolio when the goal was PulseBoard", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!DOCTYPE html><html><head><title>PixelCrew Projects</title></head>
            <body><h1>PixelCrew</h1><p>Welcome to PixelCrew</p>
            <section id="projects"><h3>ColorVision</h3><h3>NeuralArt</h3></section>
            <form id="contactForm"><input name="email"><textarea name="message"></textarea><button>Send</button></form>
            <div id="confirmation"></div>
            <a href="https://github.com/PixelCrew" target="_blank" rel="noopener noreferrer">GitHub</a>
            </body></html>`,
        },
        {
          path: "app.js",
          content: `document.getElementById("contactForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const messages = JSON.parse(localStorage.getItem("m") || "[]");
            messages.push({ email: "a" });
            localStorage.setItem("m", JSON.stringify(messages));
          });`,
        },
      ],
      {
        ceoGoal:
          'Build **"PulseBoard — Interactive Developer Productivity & Burnout Risk Predictor"**',
      },
    );
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((i) => /PixelCrew|ColorVision|NeuralArt|marketing portfolio/i.test(i.message)));
    assert.ok(report.issues.some((i) => /PulseBoard/i.test(i.message)));
  });

  it("fails a ColorVision/NeuralArt portfolio without PixelCrew branding when goal is PulseBoard", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!DOCTYPE html><html><head><title>My Projects</title></head>
            <body><h1>Featured work</h1>
            <section id="projects"><h3>ColorVision</h3><h3>NeuralArt</h3></section>
            <p>A polished portfolio of demo apps with contact form.</p>
            <form id="contactForm"><input name="email"><textarea name="message"></textarea><button>Send</button></form>
            </body></html>`,
        },
        {
          path: "app.js",
          content: `document.getElementById("contactForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const messages = JSON.parse(localStorage.getItem("m") || "[]");
            messages.push({ email: "a" });
            localStorage.setItem("m", JSON.stringify(messages));
          });`,
        },
      ],
      { ceoGoal: 'Build "PulseBoard" burnout predictor' },
    );
    assert.equal(report.passed, false);
    assert.ok(
      report.issues.some((i) => /ColorVision|NeuralArt|marketing portfolio|PulseBoard/i.test(i.message)),
    );
  });

  it("passes when HTML uses the goal product name", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!DOCTYPE html><html><head><title>PulseBoard</title></head>
            <body>
              <h1>PulseBoard</h1>
              <p>Burnout risk simulator for software engineers and managers.</p>
              <p>Adjust coding hours, meetings, and sleep to see live risk tiers.</p>
              <canvas id="chart" width="400" height="200"></canvas>
              <form id="week-form">
                <label>Coding hours <input name="hours" type="number"></label>
                <button type="submit">Save week snapshot</button>
              </form>
              <p id="status">Scores update as you edit the week.</p>
            </body></html>`,
        },
        {
          path: "app.js",
          content: `document.getElementById("week-form").addEventListener("submit", (e) => {
            e.preventDefault();
            const weeks = JSON.parse(localStorage.getItem("weeks") || "[]");
            weeks.push({ hours: 1 });
            localStorage.setItem("weeks", JSON.stringify(weeks));
          });`,
        },
      ],
      { ceoGoal: 'Build "PulseBoard" burnout predictor' },
    );
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("fails a renamed landing page that violates explicit product bans", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><title>Effective Velocity</title></head>
            <body><h1>Effective Velocity</h1>
            <nav><a href="#overview">Overview</a><a href="#contact">Contact</a></nav>
            <section id="overview"><h2>Features</h2>
              <p>Energy tracking, velocity analysis, and goal setting help productivity.</p>
            </section>
            <section id="contact"><h2>Contact Us</h2>
              <form id="contactForm"><input name="email"><textarea name="message"></textarea><button>Send</button></form>
              <p id="confirmation">Your message was received.</p>
            </section>
            <footer><a href="https://linkedin.com/example" target="_blank" rel="noopener noreferrer">LinkedIn</a></footer>
            </body></html>`,
        },
        {
          path: "app.js",
          content: `document.getElementById("contactForm").addEventListener("submit", (event) => {
            event.preventDefault();
            const messages = JSON.parse(localStorage.getItem("messages") || "[]");
            messages.push({ email: "demo@example.com" });
            localStorage.setItem("messages", JSON.stringify(messages));
          });`,
        },
      ],
      {
        ceoGoal:
          "Build **VibeLog**, a mood tracking SPA. Do not build a portfolio, marketing landing page, Contact / Privacy footer.",
      },
    );

    assert.equal(report.passed, false);
    // Product name may be auto-injected into title/h1; banned Contact/footer still aborts.
    assert.ok(report.issues.some((issue) => /explicit CEO bans/i.test(issue.message)));
  });

  it("fails root-absolute asset paths", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head>
            <body><h1>Calculator</h1><script src="/app.js"></script></body></html>`,
        },
        { path: "styles.css", content: "body { font-family: sans-serif; }" },
        { path: "app.js", content: "document.body.addEventListener('click', () => {});" },
      ],
      { ceoGoal: "simple calculator" },
    );
    // Augment rewrites /styles.css → styles.css before eval (Preview already did this).
    assert.equal(report.passed, false);
    // Still fails thin content (<80 visible chars), not root-absolute paths.
    assert.ok(
      report.issues.some((i) => /almost no visible content|root-absolute/i.test(i.message)),
    );
  });

  it("fails external CDN assets and ES modules", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head>
            <script src="https://cdn.tailwindcss.com"></script>
            <script type="module" src="app.js"></script>
            </head><body><h1>Taskboard with enough visible copy for the ship checker to pass content length rules easily here.</h1></body></html>`,
        },
      ],
      { ceoGoal: "taskboard app" },
    );
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((i) => /CDN/i.test(i.message)));
    assert.ok(report.issues.some((i) => /type="module"/i.test(i.message)));
  });

  it("fails truncated JavaScript that would break Preview interactivity", async () => {
    const { javascriptSyntaxError, collectJavascriptSyntaxIssues } = await import(
      "./ship-quality"
    );
    const truncated = `
      function showPopup(msg) { document.getElementById("popup").textContent = msg; }
      function complete() {
        showPopup(\`+\${reward.xp} XP, +
    `;
    assert.match(javascriptSyntaxError(truncated) ?? "", /Unexpected end of input|Unexpected/i);
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><body>
            <h1>TaskQuest adventure log with enough copy for ship content rules to pass here easily.</h1>
            <form id="quest-form"><input name="title"><button type="submit">Add</button></form>
            <script src="app.js"></script>
          </body></html>`,
        },
        { path: "app.js", content: truncated },
      ],
      { ceoGoal: "TaskQuest" },
    );
    assert.equal(report.passed, false);
    assert.ok(report.issues.some((i) => /syntax error/i.test(i.message)));
    assert.ok(collectJavascriptSyntaxIssues([{ path: "app.js", content: "const x = 1;" }]).length === 0);
  });

  it("scaffolds chrome around a bare-canvas PixelFlow emit so shell can ship", () => {
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, sidebar palette, and properties panel.";
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><title>PixelFlow</title></head><body>
            <h1>PixelFlow</h1>
            <canvas id="c" width="800" height="600"></canvas>
            <script src="app.js"></script>
          </body></html>`,
        },
        {
          path: "app.js",
          content: `const c=document.getElementById("c"); const x=c.getContext("2d"); x.fillRect(0,0,10,10);`,
        },
      ],
      { ceoGoal: goal },
    );
    // Augment scaffolds missing chrome + utilities so shell can ship; bare-canvas alone no longer aborts.
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("passes a 3-pane workspace shell for flow-editor goals", () => {
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, sidebar palette, and properties panel.";
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><title>PixelFlow</title>
            <link rel="stylesheet" href="utilities.css">
            <link rel="stylesheet" href="styles.css"></head>
            <body class="app-shell">
            <aside id="palette" class="sidebar"><h2>Node palette</h2><p>Drag tools onto the workspace.</p><button type="button" class="node-card">Number input</button></aside>
            <main id="workspace"><h1>PixelFlow canvas</h1><p>Build your visual graph here.</p><canvas id="canvas"></canvas><div class="flow-node socket">Process node</div></main>
            <aside id="properties" class="inspector"><h2>Properties</h2><p>Inspect the selected node.</p><label>Value <input id="prop-value"></label></aside>
            <script src="app.js"></script>
          </body></html>`,
        },
        {
          path: "utilities.css",
          content: `:root { --pc-bg:#0b1220; color-scheme:dark; }
.app-shell { display:grid; grid-template-columns:240px 1fr 280px; min-height:100vh; background:var(--pc-bg); }
.sidebar, .inspector { background:#111827; }
.node-card, .socket { border:1px solid #38bdf8; }`,
        },
        {
          path: "styles.css",
          content: `#canvas { width:100%; height:100%; }`,
        },
        {
          path: "app.js",
          content: `document.addEventListener("DOMContentLoaded",()=>{});`,
        },
      ],
      { ceoGoal: goal, stage: "shell" },
    );
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("auto-fills linked utilities.css / styles.css / app.js the model forgot to emit", async () => {
    const { augmentProjectFilesForShipEval } = await import("./ship-quality");
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, sidebar palette, and properties panel.";
    const htmlOnly = [
      {
        path: "index.html",
        content: `<!doctype html><html><head><title>PixelFlow</title>
            <link rel="stylesheet" href="utilities.css">
            <link rel="stylesheet" href="styles.css"></head>
            <body class="app-shell">
            <aside id="palette" class="sidebar"><h2>Node palette</h2><p>Drag tools onto the workspace.</p><button type="button" class="node-card">Number input</button></aside>
            <main id="workspace"><h1>PixelFlow canvas</h1><p>Build your visual graph here.</p><canvas id="canvas"></canvas><div class="flow-node socket">Process node</div></main>
            <aside id="properties" class="inspector"><h2>Properties</h2><p>Inspect the selected node.</p><label>Value <input id="prop-value"></label></aside>
            <script src="app.js"></script>
          </body></html>`,
      },
    ];
    const report = evalShippedProject(htmlOnly, { ceoGoal: goal, stage: "shell" });
    assert.equal(report.passed, true, formatShipReport(report));
    const augmented = augmentProjectFilesForShipEval(htmlOnly, {
      ceoGoal: goal,
      stage: "shell",
    });
    assert.ok(augmented.some((f) => f.path === "utilities.css" && f.content.length > 400));
    assert.ok(augmented.some((f) => f.path === "styles.css"));
    assert.ok(augmented.some((f) => f.path === "app.js"));
  });

  it("injects a workspace <canvas> when chrome is rich but canvas was omitted", async () => {
    const { augmentProjectFilesForShipEval, ensureWorkspaceCanvas } = await import(
      "./ship-quality"
    );
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, sidebar palette, and properties panel.";
    const chromeOnly = [
      {
        path: "index.html",
        content: `<!doctype html><html><head><title>PixelFlow</title>
            <link rel="stylesheet" href="utilities.css">
            <link rel="stylesheet" href="styles.css"></head>
            <body class="app-shell">
            <aside id="palette" class="sidebar"><h2>Node palette</h2><p>Drag tools onto the workspace.</p><button type="button" class="node-card">Number input</button></aside>
            <main id="workspace"><h1>PixelFlow workspace</h1><p>Build your visual graph here with enough copy for ship rules.</p><div class="flow-node socket">Process node</div></main>
            <aside id="properties" class="inspector"><h2>Properties</h2><p>Inspect the selected node.</p><label>Value <input id="prop-value"></label></aside>
            <script src="app.js"></script>
          </body></html>`,
      },
    ];
    assert.match(ensureWorkspaceCanvas(chromeOnly[0]!.content), /<canvas\b/i);
    const report = evalShippedProject(chromeOnly, { ceoGoal: goal, stage: "shell" });
    assert.equal(report.passed, true, formatShipReport(report));
    const augmented = augmentProjectFilesForShipEval(chromeOnly, {
      ceoGoal: goal,
      stage: "shell",
    });
    const html = augmented.find((f) => f.path === "index.html")?.content ?? "";
    assert.match(html, /<canvas\b[^>]*id=["']canvas["']/i);
  });

  it("auto-scaffolds a thin PixelFlow mock into a passable shell", () => {
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas, bezier cables, and a dark Blender-like workspace.";
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><title>PixelFlow</title></head><body>
            <h1>PixelFlow</h1>
            <button type="button">+ Add Node</button>
            <h2>Tools</h2>
            <p>Add your first node to start building a flow.</p>
            <h2>Inspector</h2>
            <p>Select a node to view its properties.</p>
            <script src="app.js"></script>
          </body></html>`,
        },
        { path: "app.js", content: `console.log("PixelFlow UI loaded");` },
      ],
      { ceoGoal: goal, stage: "shell" },
    );
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("recovers when model emits generic Editor HTML + thin utilities.css stub", () => {
    const goal =
      "Build a fully static node-based visual flow editor called PixelFlow with an infinite zoomable canvas using HTML CSS and JavaScript, sidebar palette, and properties panel.";
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><title>Editor</title>
            <link rel="stylesheet" href="utilities.css"></head>
            <body><h1>Flow editor</h1><p>Build graphs here with enough copy for content rules to pass easily.</p></body></html>`,
        },
        { path: "utilities.css", content: "body{margin:0}" },
      ],
      { ceoGoal: goal, stage: "shell" },
    );
    assert.equal(report.passed, true, formatShipReport(report));
  });

  it("rewrites root-absolute asset paths before failing the ship gate", () => {
    const report = evalShippedProject(
      [
        {
          path: "index.html",
          content: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head>
            <body><h1>Calculator with enough visible copy for the ship checker to pass content length rules easily here.</h1><script src="/app.js"></script></body></html>`,
        },
        { path: "styles.css", content: "body { font-family: sans-serif; }" },
        { path: "app.js", content: "document.body.addEventListener('click', () => {});" },
      ],
      { ceoGoal: "simple calculator" },
    );
    assert.equal(report.passed, true, formatShipReport(report));
  });
});
