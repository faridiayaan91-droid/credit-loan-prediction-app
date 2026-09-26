const form = document.getElementById("riskForm");
const assessBtn = document.getElementById("assessBtn");
const errorLine = document.getElementById("errorLine");
const needleGroup = document.getElementById("needleGroup");
const gaugeFill = document.getElementById("gaugeFill");
const thresholdTick = document.getElementById("thresholdTick");
const probabilityText = document.getElementById("probabilityText");
const thresholdText = document.getElementById("thresholdText");
const statusText = document.getElementById("statusText");
const verdict = document.getElementById("verdict");
const apiUrlInput = document.getElementById("apiUrl");
const themeToggle = document.getElementById("themeToggle");
const importanceList = document.getElementById("importanceList");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const GAUGE_LENGTH = 283;
const HISTORY_KEY = "creditLedgerHistory";
const THEME_KEY = "creditLedgerTheme";
const MAX_HISTORY = 8;

const FIELD_LABELS = {
  person_age: "Age",
  person_income: "Income",
  person_home_ownership: "Home ownership",
  person_emp_length: "Employment length",
  loan_intent: "Loan purpose",
  loan_grade: "Loan grade",
  loan_amnt: "Loan amount",
  loan_int_rate: "Interest rate",
  loan_percent_income: "Loan / income ratio",
  cb_person_default_on_file: "Prior default",
  cb_person_cred_hist_length: "Credit history length",
};

/* ---------------- Theme ---------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, theme);
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
})();

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

/* ---------------- Gauge ---------------- */
function probToAngle(prob) { return prob * 180 - 90; }

function setGauge(prob) {
  const angle = probToAngle(prob);
  needleGroup.style.transform = `rotate(${angle}deg)`;
  gaugeFill.style.strokeDashoffset = GAUGE_LENGTH - GAUGE_LENGTH * prob;
  gaugeFill.style.stroke = prob >= 0.5 ? "var(--risk)" : "var(--safe)";
}

function setThresholdTick(threshold) {
  const angle = probToAngle(threshold);
  thresholdTick.setAttribute("transform", `rotate(${angle} 110 110)`);
}

function setVerdict(isHighRisk) {
  verdict.classList.remove("safe", "risk");
  verdict.classList.add(isHighRisk ? "risk" : "safe");
  verdict.querySelector(".verdict-text").textContent = isHighRisk
    ? "High risk — likely default"
    : "Low risk — likely repaid";
}

/* ---------------- Form <-> payload ---------------- */
function collectPayload() {
  return {
    person_age: Number(document.getElementById("person_age").value),
    person_income: Number(document.getElementById("person_income").value),
    person_home_ownership: document.getElementById("person_home_ownership").value,
    person_emp_length: Number(document.getElementById("person_emp_length").value),
    loan_intent: document.getElementById("loan_intent").value,
    loan_grade: document.getElementById("loan_grade").value,
    loan_amnt: Number(document.getElementById("loan_amnt").value),
    loan_int_rate: Number(document.getElementById("loan_int_rate").value),
    loan_percent_income: Number(document.getElementById("loan_percent_income").value),
    cb_person_default_on_file: document.getElementById("cb_person_default_on_file").value,
    cb_person_cred_hist_length: Number(document.getElementById("cb_person_cred_hist_length").value),
  };
}

function fillForm(payload) {
  Object.entries(payload).forEach(([key, value]) => {
    const el = document.getElementById(key);
    if (el) el.value = value;
  });
}

function apiBase() {
  return apiUrlInput.value.trim().replace(/\/predict\/?$/, "");
}

/* ---------------- Feature importance ---------------- */
async function loadFeatureImportance() {
  try {
    const res = await fetch(`${apiBase()}/feature-importance`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    renderImportance(data.features || []);
  } catch (err) {
    importanceList.innerHTML = `<p class="empty-line">Could not load insights (${err.message})</p>`;
  }
}

function renderImportance(features) {
  if (!features.length) {
    importanceList.innerHTML = `<p class="empty-line">No insights available.</p>`;
    return;
  }
  const top = features.slice(0, 8);
  importanceList.innerHTML = top.map(f => {
    const pct = (f.importance * 100).toFixed(1);
    const label = FIELD_LABELS[f.field] || f.field;
    return `
      <div class="importance-row">
        <span>${label}</span>
        <div class="importance-bar-track">
          <div class="importance-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="importance-value">${pct}%</span>
      </div>`;
  }).join("");
}

/* ---------------- History ---------------- */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(payload, prob, isHighRisk) {
  const history = loadHistory();
  history.unshift({
    id: Date.now(),
    time: new Date().toLocaleString(),
    payload,
    prob,
    isHighRisk,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    historyList.innerHTML = `<p class="empty-line">No assessments yet.</p>`;
    return;
  }
  historyList.innerHTML = history.map(item => `
    <div class="history-item ${item.isHighRisk ? "risk" : "safe"}" data-id="${item.id}">
      <div class="h-left">
        <span>$${item.payload.loan_amnt} loan · ${item.payload.loan_intent.toLowerCase()}</span>
        <span class="h-time">${item.time}</span>
      </div>
      <span class="h-prob">${(item.prob * 100).toFixed(1)}%</span>
    </div>
  `).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      const entry = loadHistory().find(h => h.id === id);
      if (entry) fillForm(entry.payload);
    });
  });
}

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

/* ---------------- Submit ---------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorLine.hidden = true;
  assessBtn.classList.add("loading");
  assessBtn.disabled = true;
  statusText.textContent = "Calling model…";

  const payload = collectPayload();

  try {
    const res = await fetch(apiUrlInput.value.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server responded ${res.status}: ${text}`);
    }

    const data = await res.json();
    const prob = data.default_probability;
    const threshold = data.threshold;
    const isHighRisk = data.default_prediction === 1;

    setGauge(prob);
    setThresholdTick(threshold);
    probabilityText.textContent = `${(prob * 100).toFixed(1)}%`;
    thresholdText.textContent = `${(threshold * 100).toFixed(1)}%`;
    setVerdict(isHighRisk);
    statusText.textContent = "Success";

    saveToHistory(payload, prob, isHighRisk);
  } catch (err) {
    errorLine.textContent = `Could not reach model: ${err.message}`;
    errorLine.hidden = false;
    statusText.textContent = "Failed";
  } finally {
    assessBtn.classList.remove("loading");
    assessBtn.disabled = false;
  }
});

/* ---------------- Init ---------------- */
renderHistory();
loadFeatureImportance();