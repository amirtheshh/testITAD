const API_BASE = "https://r6zqp9jvi4.execute-api.ap-southeast-2.amazonaws.com/events";
const DEVICE_ID = "pharmabox-001";

const QUICKSIGHT_DASHBOARD_URL =
  "https://ap-southeast-2.quicksight.aws.amazon.com/sn/account/amir-ITAD-project/dashboards/e082f6db-dfcf-4085-9291-17d7f2f6d414/views/fc21a43c-8e34-4152-83b9-830028577f43";

function openQuickSight() {
  window.open(QUICKSIGHT_DASHBOARD_URL, "_blank", "noopener,noreferrer");
}

function humanizeLabel(text) {
  if (!text) return "-";
  return String(text).replace(/_/g, " ").toUpperCase();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = (theme === "light") ? "☀️" : "🌙";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("pharmabox_theme", next);
  applyTheme(next);
}

(function initTheme() {
  const saved = localStorage.getItem("pharmabox_theme");
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
})();

function toReadableTime(ts) {
  if (ts === undefined || ts === null) return "N/A";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "N/A";
  const ms = n >= 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? "N/A" : d.toLocaleString();
}

function badgeClass(issue, isAdherenceAlert=false) {
  if (isAdherenceAlert) return "adherence";
  const s = String(issue || "").toUpperCase();
  if (s.includes("TEMP")) return "hot";
  if (s.includes("HUMID")) return "humid";
  if (s.includes("LID")) return "lid";
  if (s.includes("MOTION") || s.includes("TAMPER")) return "motion";
  return "";
}

function showError(message) {
  const b = document.getElementById("errorBanner");
  b.textContent = message;
  b.style.display = "block";
}

function clearError() {
  const b = document.getElementById("errorBanner");
  b.textContent = "";
  b.style.display = "none";
}

/* ✅ Quick Stats font fix (NO CSS EDITS) */
function applyQuickStatsFontFix() {
  const lastTime = document.getElementById("statLastTime");
  const lastIssues = document.getElementById("statLastIssues");

  if (lastTime) lastTime.style.fontSize = "14px";
  if (lastIssues) lastIssues.style.fontSize = "14px";
}

/**
 * ✅ Render KV telemetry grid only when telemetryAvailable is true.
 * If isAdherenceAlert == true (e.g., MISSED_DOSE), we hide telemetry entirely.
 */
function renderTelemetryGrid(item) {
  if (item?.isAdherenceAlert) return "";
  if (item?.telemetryAvailable === false) return "";

  const hasAny =
    item?.temperature !== undefined ||
    item?.humidity !== undefined ||
    item?.motion !== undefined ||
    item?.lightRaw !== undefined ||
    item?.lidOpened !== undefined;

  if (!hasAny) return "";

  const lidText =
    item.lidOpened === true ? "Yes" :
    item.lidOpened === false ? "No" :
    "-";

  return `
    <div class="kv">
      <div class="kvBox"><div class="k">Temperature (°C)</div><div class="v">${item.temperature ?? "-"}</div></div>
      <div class="kvBox"><div class="k">Humidity (%)</div><div class="v">${item.humidity ?? "-"}</div></div>
      <div class="kvBox"><div class="k">Motion</div><div class="v">${item.motion ?? "-"}</div></div>
      <div class="kvBox"><div class="k">Lid Opened</div><div class="v">${lidText}</div></div>
    </div>
  `;
}

async function loadEvents(userTriggered=false) {
  try {
    clearError();

    const deviceId = DEVICE_ID;
    const limit = 50;

    document.getElementById("deviceLabel").textContent = `Device: ${deviceId}`;
    document.getElementById("statusText").textContent = userTriggered ? "Refreshing…" : "Fetching…";

    const url = `${API_BASE}?deviceId=${encodeURIComponent(deviceId)}&limit=${encodeURIComponent(String(limit))}`;

    const res = await fetch(url);
    if (!res.ok) {
      showError(`API error: ${res.status} ${res.statusText}`);
      document.getElementById("statusText").textContent = "Failed";
      return;
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    document.getElementById("statusText").textContent = `Showing ${items.length} alert record(s)`;
    document.getElementById("statCount").textContent = String(items.length || 0);

    if (items.length > 0) {
      const newest = items[0];
      document.getElementById("statLastTime").textContent = toReadableTime(newest.ts);

      const newestIssues = Array.isArray(newest.issues)
        ? newest.issues.join(", ")
        : (newest.eventTypeDisplay || newest.eventType || "-");

      document.getElementById("statLastIssues").textContent =
        newestIssues ? newestIssues.split(",").map(humanizeLabel).join(", ") : "-";
    } else {
      document.getElementById("statLastTime").textContent = "—";
      document.getElementById("statLastIssues").textContent = "—";
    }

    const container = document.getElementById("events");
    container.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "eventCard";
      empty.innerHTML = `
        <div class="topRow">
          <div class="pill"><span class="dot warn"></span><span>No alerts found</span></div>
          <div class="time">${deviceId}</div>
        </div>
        <div class="footerHint" style="margin-top:8px;">
          Publish a test message that exceeds thresholds so an ALERT record is stored in DynamoDB.
        </div>
      `;
      container.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const timeStr = toReadableTime(item.ts);
      const isAdherenceAlert = item.isAdherenceAlert === true;

      const issues = Array.isArray(item.issues) ? item.issues : [];
      const issueMessages = Array.isArray(item.issueMessages) ? item.issueMessages : [];

      const fallbackIssue = item.eventTypeDisplay || item.eventType;
      const fallbackMessage = item.messageDisplay || item.message;

      const badgeSource = issues.length ? issues : (fallbackIssue ? [fallbackIssue] : []);
      const badgeHtml = badgeSource
        .map(x => `<span class="badge ${badgeClass(x, isAdherenceAlert)}">${humanizeLabel(x)}</span>`)
        .join("");

      const msgSource = issueMessages.length ? issueMessages : (fallbackMessage ? [fallbackMessage] : []);
      const msgHtml = msgSource
        .map(m => `<div class="msg">• ${String(m)}</div>`)
        .join("");

      const telemetryHtml = renderTelemetryGrid(item);

      const div = document.createElement("div");
      div.className = "eventCard";
      div.innerHTML = `
        <div class="topRow">
          <div class="pill">
            <span class="dot bad"></span>
            <span>${item.status || "ALERT"}</span>
          </div>
          <div class="time">${timeStr}</div>
        </div>

        <div class="badgeRow">
          ${badgeHtml || `<span class="badge">EVENT</span>`}
        </div>

        ${telemetryHtml}

        <div class="msgList">
          <div class="title">Detected issue(s)</div>
          ${msgHtml || `<div class="msg">No message available.</div>`}
        </div>
      `;

      container.appendChild(div);
    });

  } catch (err) {
    showError(`Dashboard error: ${err}`);
    document.getElementById("statusText").textContent = "Failed";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const themeBtn = document.getElementById("themeToggle");
  const refreshBtn = document.getElementById("refreshBtn");
  const qsBtn = document.getElementById("quickSightBtn");

  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadEvents(true));
  if (qsBtn) qsBtn.addEventListener("click", openQuickSight);

  /* ✅ apply the Quick Stats font fix once page loads */
  applyQuickStatsFontFix();

  loadEvents(false);
  setInterval(() => loadEvents(false), 5000);
});
