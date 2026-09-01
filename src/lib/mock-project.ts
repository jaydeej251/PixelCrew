/** A complete static budget tracker used by the mock provider so Phase 6 lite is testable without an LLM. */

export const MOCK_BUDGET_TRACKER: Record<string, string> = {
  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Budget Tracker</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="app">
    <header class="hero">
      <p class="eyebrow">PixelCrew export</p>
      <h1>Budget Tracker</h1>
      <p class="lede">Log spend, watch the month vs your budget. Everything stays in this browser.</p>
    </header>

    <section class="summary" aria-live="polite">
      <div>
        <p class="label">Spent</p>
        <p id="spent" class="figure">$0.00</p>
      </div>
      <div>
        <p class="label">Budget</p>
        <p id="budget-label" class="figure">$500.00</p>
      </div>
      <div>
        <p class="label">Left</p>
        <p id="left" class="figure">$500.00</p>
      </div>
    </section>

    <form id="budget-form" class="budget-row">
      <label>
        Monthly budget
        <input id="budget-input" type="number" min="0" step="1" value="500" />
      </label>
      <button type="submit">Save budget</button>
    </form>

    <form id="expense-form" class="card">
      <h2>Add expense</h2>
      <label>
        Amount
        <input id="amount" type="number" min="0.01" step="0.01" required placeholder="4.50" />
      </label>
      <label>
        Category
        <select id="category">
          <option>Coffee</option>
          <option>Groceries</option>
          <option>Rent</option>
          <option>Transport</option>
          <option>Other</option>
        </select>
      </label>
      <label>
        Note
        <input id="note" type="text" maxlength="80" placeholder="Optional" />
      </label>
      <button type="submit">Add expense</button>
    </form>

    <section class="card">
      <h2>This month</h2>
      <ul id="list" class="list"></ul>
      <p id="empty" class="empty">No expenses yet — add coffee or rent to see the month.</p>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
  "styles.css": `:root {
  color-scheme: dark;
  --bg: #09090b;
  --card: #18181b;
  --line: #27272a;
  --text: #fafafa;
  --muted: #a1a1aa;
  --accent: #818cf8;
  --danger: #fb7185;
  --ok: #34d399;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.app { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.7rem; color: var(--accent); margin: 0; }
h1 { margin: 0.35rem 0 0.5rem; font-size: 1.75rem; }
.lede, .label, .empty { color: var(--muted); }
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 1.5rem 0;
}
.summary > div, .card, .budget-row {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 1rem;
  padding: 1rem;
}
.figure { font-size: 1.25rem; font-weight: 650; margin: 0.25rem 0 0; }
.figure.over { color: var(--danger); }
.figure.ok { color: var(--ok); }
.budget-row { display: flex; gap: 0.75rem; align-items: end; margin-bottom: 1rem; }
label { display: grid; gap: 0.35rem; font-size: 0.8rem; color: var(--muted); }
input, select, button {
  font: inherit;
  border-radius: 0.6rem;
  border: 1px solid var(--line);
  background: #09090b;
  color: var(--text);
  padding: 0.55rem 0.7rem;
}
button {
  background: var(--accent);
  color: #111;
  border: 0;
  font-weight: 650;
  cursor: pointer;
}
.card h2 { margin: 0 0 0.75rem; font-size: 1rem; }
.card { display: grid; gap: 0.65rem; margin-bottom: 1rem; }
.list { list-style: none; margin: 0; padding: 0; }
.list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--line);
}
.muted { color: var(--muted); font-size: 0.8rem; }
.empty { display: none; margin: 0; }
.empty.show { display: block; }
`,
  "app.js": `const KEY = "pixelcrew-budget-tracker-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { budget: 500, items: [] };
  } catch {
    return { budget: 500, items: [] };
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function render() {
  const state = load();
  const spent = state.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const left = state.budget - spent;
  document.getElementById("spent").textContent = money(spent);
  document.getElementById("budget-label").textContent = money(state.budget);
  const leftEl = document.getElementById("left");
  leftEl.textContent = money(left);
  leftEl.className = "figure " + (left < 0 ? "over" : "ok");
  document.getElementById("budget-input").value = String(state.budget);

  const list = document.getElementById("list");
  list.innerHTML = "";
  const empty = document.getElementById("empty");
  empty.classList.toggle("show", state.items.length === 0);
  for (const item of [...state.items].reverse()) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = money(Number(item.amount));
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = " " + item.category + (item.note ? " · " + item.note : "");
    left.append(strong, meta);
    const when = document.createElement("span");
    when.className = "muted";
    when.textContent = item.when.slice(0, 10);
    li.append(left, when);
    list.appendChild(li);
  }
}

document.getElementById("budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const state = load();
  state.budget = Number(document.getElementById("budget-input").value) || 0;
  save(state);
  render();
});

document.getElementById("expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const state = load();
  state.items.push({
    amount: Number(document.getElementById("amount").value),
    category: document.getElementById("category").value,
    note: document.getElementById("note").value.trim(),
    when: new Date().toISOString(),
  });
  save(state);
  event.target.reset();
  render();
});

render();
`,
  "package.json": `{
  "name": "budget-tracker",
  "private": true,
  "version": "0.1.0",
  "description": "Personal budget tracker from a PixelCrew run",
  "scripts": {
    "start": "npx --yes serve .",
    "dev": "npx --yes serve ."
  }
}
`,
  "README.md": `# Budget Tracker

A static app from PixelCrew. Data is stored in \`localStorage\`.

## Run

\`\`\`bash
npx --yes serve .
\`\`\`

Then open the printed URL, or open \`index.html\` directly.
`,
};

export const MOCK_FRONTEND_FILES: Record<string, string> = {
  "index.html": MOCK_BUDGET_TRACKER["index.html"]!,
  "styles.css": MOCK_BUDGET_TRACKER["styles.css"]!,
  "app.js": MOCK_BUDGET_TRACKER["app.js"]!,
};

export const MOCK_BACKEND_FILES: Record<string, string> = {
  "data.js": `/** In-browser data layer. Swap for a real API later. */
export const STORAGE_KEY = "pixelcrew-budget-tracker-v1";

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { budget: 500, items: [] };
  } catch {
    return { budget: 500, items: [] };
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
`,
  "server/README.md": `# API sketch

v1 runs entirely in the browser via \`data.js\` / localStorage.

Suggested later endpoints:

- \`GET /expenses\`
- \`POST /expenses\`
- \`PUT /budget\`
`,
};
