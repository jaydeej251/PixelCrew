const STORAGE_KEY = "moodledger.entries";
const CIRC = 2 * Math.PI * 72;

const moodWords = {
  1: "Drained",
  2: "Low",
  3: "Rough",
  4: "Uneasy",
  5: "Mixed",
  6: "Okay",
  7: "Steady",
  8: "Good",
  9: "Sharp",
  10: "Electric",
};

const energyWords = {
  1: "Empty",
  2: "Flat",
  3: "Slow",
  4: "Soft",
  5: "Warming",
  6: "Steady",
  7: "Ready",
  8: "High",
  9: "Charged",
  10: "Wired",
};

/** risk = clamp(0,100, round( (11-mood)*4 + (11-energy)*3 + meetings*3.5 + max(0, focus-8)*2 )) */
function burnoutRisk({ mood, energy, meetings, focus }) {
  const raw =
    (11 - mood) * 4 + (11 - energy) * 3 + meetings * 3.5 + Math.max(0, focus - 8) * 2;
  return clamp(0, 100, Math.round(raw));
}

function velocity({ mood, energy, meetings }) {
  return clamp(0, 100, Math.round(mood * 5 + energy * 4 - meetings * 2));
}

function clamp(min, max, n) {
  return Math.min(max, Math.max(min, n));
}

function riskColor(risk) {
  if (risk < 35) return getComputedStyle(document.documentElement).getPropertyValue("--mint").trim() || "#34d399";
  if (risk <= 65) return getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#fbbf24";
  return getComputedStyle(document.documentElement).getPropertyValue("--coral").trim() || "#fb7185";
}

function riskBand(risk) {
  if (risk < 35) return "Low";
  if (risk <= 65) return "Watch";
  return "High";
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedIfEmpty();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedIfEmpty();
    return parsed;
  } catch {
    return seedIfEmpty();
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function seedIfEmpty() {
  const now = Date.now();
  const day = 86_400_000;
  const seeded = [
    { ts: now - day * 6, mood: 7, energy: 6, focus: 6, meetings: 2, tags: ["Deep work"], risk: 0 },
    { ts: now - day * 5, mood: 5, energy: 5, focus: 4, meetings: 5, tags: ["Meetings"], risk: 0 },
    { ts: now - day * 4, mood: 8, energy: 7, focus: 7, meetings: 1, tags: ["Shipping"], risk: 0 },
    { ts: now - day * 3, mood: 4, energy: 3, focus: 3, meetings: 6, tags: ["Meetings", "Blocked"], risk: 0 },
    { ts: now - day * 2, mood: 6, energy: 7, focus: 8, meetings: 2, tags: ["Deep work", "On-call"], risk: 0 },
  ].map((e) => ({
    ...e,
    risk: burnoutRisk(e),
  }));
  saveEntries(seeded);
  return seeded;
}

const els = {
  mood: document.getElementById("mood"),
  energy: document.getElementById("energy"),
  focus: document.getElementById("focus"),
  meetings: document.getElementById("meetings"),
  moodLabel: document.getElementById("mood-label"),
  energyLabel: document.getElementById("energy-label"),
  riskValue: document.getElementById("risk-value"),
  velocityValue: document.getElementById("velocity-value"),
  riskBand: document.getElementById("risk-band"),
  gaugeValue: document.querySelector(".gauge-value"),
  confirm: document.getElementById("confirm"),
  logBtn: document.getElementById("log-btn"),
  historyBody: document.getElementById("history-body"),
  historyEmpty: document.getElementById("history-empty"),
  filterTags: document.getElementById("filter-tags"),
  exportBtn: document.getElementById("export-btn"),
  clearBtn: document.getElementById("clear-btn"),
  clearDialog: document.getElementById("clear-dialog"),
  clearConfirm: document.getElementById("clear-confirm"),
  avgMood: document.getElementById("avg-mood"),
  avgEnergy: document.getElementById("avg-energy"),
  avgRisk: document.getElementById("avg-risk"),
  insightLine: document.getElementById("insight-line"),
  bars: document.getElementById("bars"),
  tags: document.getElementById("tags"),
};

let entries = loadEntries();
let activeFilter = null;
let selectedTags = new Set();

function currentDraft() {
  return {
    mood: Number(els.mood.value),
    energy: Number(els.energy.value),
    focus: Number(els.focus.value),
    meetings: Number(els.meetings.value),
  };
}

function updateLabels() {
  const d = currentDraft();
  els.moodLabel.textContent = `Mood · ${d.mood} — ${moodWords[d.mood]}`;
  els.energyLabel.textContent = `Energy · ${d.energy} — ${energyWords[d.energy]}`;
  const risk = burnoutRisk(d);
  const vel = velocity(d);
  els.riskValue.textContent = String(risk);
  els.velocityValue.textContent = String(vel);
  els.riskBand.textContent = riskBand(risk);
  const color = riskColor(risk);
  els.gaugeValue.style.stroke = color;
  els.gaugeValue.style.strokeDashoffset = String(CIRC * (1 - risk / 100));
  els.riskValue.style.color = color;
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const on = panel.id === `panel-${name}`;
    panel.hidden = !on;
    panel.classList.toggle("is-active", on);
  });
  if (name === "history") renderHistory();
  if (name === "insights") renderInsights();
}

function renderHistory() {
  const tags = [...new Set(entries.flatMap((e) => e.tags))].sort();
  els.filterTags.innerHTML = "";
  const all = document.createElement("button");
  all.type = "button";
  all.className = `chip${activeFilter == null ? " is-on" : ""}`;
  all.textContent = "All";
  all.addEventListener("click", () => {
    activeFilter = null;
    renderHistory();
  });
  els.filterTags.appendChild(all);
  tags.forEach((tag) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip${activeFilter === tag ? " is-on" : ""}`;
    b.textContent = tag;
    b.addEventListener("click", () => {
      activeFilter = tag;
      renderHistory();
    });
    els.filterTags.appendChild(b);
  });

  const rows = [...entries]
    .filter((e) => (activeFilter ? e.tags.includes(activeFilter) : true))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 30);

  els.historyBody.innerHTML = "";
  els.historyEmpty.hidden = rows.length > 0;
  rows.forEach((e) => {
    const tr = document.createElement("tr");
    const when = new Date(e.ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    tr.innerHTML = `
      <td>${when}</td>
      <td>${e.mood}</td>
      <td>${e.energy}</td>
      <td>${e.focus}h</td>
      <td>${e.meetings}h</td>
      <td>${e.tags.join(", ") || "—"}</td>
      <td class="risk-cell" style="color:${riskColor(e.risk)}">${e.risk}</td>`;
    els.historyBody.appendChild(tr);
  });
}

function last7Days(list) {
  const cut = Date.now() - 7 * 86_400_000;
  return list.filter((e) => e.ts >= cut);
}

function renderInsights() {
  const week = last7Days(entries);
  if (!week.length) {
    els.avgMood.textContent = "—";
    els.avgEnergy.textContent = "—";
    els.avgRisk.textContent = "—";
    els.insightLine.textContent = "Add a few check-ins to unlock a read.";
    els.bars.innerHTML = "";
    return;
  }
  const avg = (key) =>
    Math.round((week.reduce((s, e) => s + e[key], 0) / week.length) * 10) / 10;
  els.avgMood.textContent = String(avg("mood"));
  els.avgEnergy.textContent = String(avg("energy"));
  els.avgRisk.textContent = String(avg("risk"));

  const avgMeetings = week.reduce((s, e) => s + e.meetings, 0) / week.length;
  const avgEnergy = week.reduce((s, e) => s + e.energy, 0) / week.length;
  if (avgMeetings >= 4) {
    els.insightLine.textContent = "Meetings are pushing risk up — protect a deep-work block.";
  } else if (avgEnergy >= 7) {
    els.insightLine.textContent = "Energy looks strong — good window to ship hard problems.";
  } else if (avg("risk") > 65) {
    els.insightLine.textContent = "Risk is running hot — dial meetings or rest before the next sprint.";
  } else {
    els.insightLine.textContent = "Load looks balanced across the last week.";
  }

  // Aggregate max risk per day for last 7 calendar days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86_400_000;
    const dayEntries = entries.filter((e) => e.ts >= start && e.ts < end);
    const risk = dayEntries.length ? Math.max(...dayEntries.map((e) => e.risk)) : 0;
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      risk,
    });
  }

  const maxH = 120;
  const gap = 12;
  const barW = 36;
  const left = 24;
  els.bars.innerHTML = days
    .map((day, i) => {
      const h = Math.max(4, (day.risk / 100) * maxH);
      const x = left + i * (barW + gap);
      const y = 140 - h;
      const color = day.risk ? riskColor(day.risk) : "rgba(255,255,255,0.12)";
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8" fill="${color}" opacity="0.9"></rect>
        <text x="${x + barW / 2}" y="156" text-anchor="middle" fill="#8b9bb0" font-size="11" font-family="DM Sans,sans-serif">${day.label}</text>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" fill="#e8eef6" font-size="11" font-family="DM Sans,sans-serif">${day.risk || ""}</text>`;
    })
    .join("");
}

function logEntry() {
  const draft = currentDraft();
  const risk = burnoutRisk(draft);
  const entry = {
    ts: Date.now(),
    ...draft,
    tags: [...selectedTags],
    risk,
  };
  entries = [...entries, entry];
  saveEntries(entries);
  els.confirm.hidden = false;
  els.confirm.textContent = `Logged — mood ${entry.mood} · energy ${entry.energy} · risk ${risk}`;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

els.tags.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const tag = chip.dataset.tag;
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
      chip.classList.remove("is-on");
    } else {
      selectedTags.add(tag);
      chip.classList.add("is-on");
    }
  });
});

["mood", "energy", "focus", "meetings"].forEach((id) => {
  els[id].addEventListener("input", updateLabels);
});

els.logBtn.addEventListener("click", logEntry);

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "moodledger-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

els.clearBtn.addEventListener("click", () => {
  els.clearDialog.showModal();
});

els.clearDialog.addEventListener("close", () => {
  if (els.clearDialog.returnValue === "confirm") {
    entries = [];
    saveEntries(entries);
    activeFilter = null;
    renderHistory();
    renderInsights();
  }
});

updateLabels();

const bootTab = new URLSearchParams(location.search).get("tab");
if (bootTab === "history" || bootTab === "insights" || bootTab === "checkin") {
  setTab(bootTab);
}
