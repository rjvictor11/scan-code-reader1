const $ = id => document.getElementById(id);

// Codes look like P<EBOM>-<TRACEABILITY>, e.g. P68579358AB-T05WH269300041.
// EBOM never contains a hyphen, so splitting on the first "-" after the
// leading "P" holds even if traceability itself contains one. Labels are
// due to move to a new, unknown format -- anything that doesn't match is
// still saved, just without parsed fields.
const CODE_PATTERN = /^P([^-]+)-(.+)$/;

// Broadened later if the new label format turns out to need a different
// symbology -- Data Matrix is the current format, QR/Code128 cover likely
// replacements.
const SCAN_FORMATS = [
 Html5QrcodeSupportedFormats.DATA_MATRIX,
 Html5QrcodeSupportedFormats.QR_CODE,
 Html5QrcodeSupportedFormats.CODE_128,
];

let mode = "single"; // "single" | "pair"
let pairStep = "old"; // "old" | "new"
let pairCorrelationId = null;
let pendingDecoded = null; // {raw, ebom, traceability}
let html5Qrcode = null;
let cameraRunning = false;
let torchOn = false;
let undoTimer = null;
let historyRows = [];
let linkTargetRow = null;

function esc(s) {
 return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function parseCode(raw) {
 const m = CODE_PATTERN.exec(raw.trim());
 if (!m) return { ebom: null, traceability: null };
 return { ebom: m[1], traceability: m[2] };
}

function formatTimestamp(iso) {
 return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

function getScanner() {
 if (!html5Qrcode) {
  html5Qrcode = new Html5Qrcode("reader-region", { formatsToSupport: SCAN_FORMATS, verbose: false });
 }
 return html5Qrcode;
}

// A handheld barcode scanner acts like a keyboard -- it just types the
// decoded text into whatever's focused, then Enter. Keeping this field
// focused by default (and re-focusing after every save/undo/discard) lets
// someone scan repeatedly without touching the screen between scans.
function focusManualInput() {
 $("manual-input").focus();
}

// ---- Mode / pair-progress ----

function resetPairSession() {
 pairStep = "old";
 pairCorrelationId = crypto.randomUUID();
 updatePairProgressUI();
}

function updatePairProgressUI() {
 document.querySelectorAll("#pair-progress .step").forEach(el => {
  el.classList.toggle("active", el.dataset.step === pairStep);
  el.classList.toggle("done", pairStep === "new" && el.dataset.step === "old");
 });
}

function currentLabelVersion() {
 if (mode === "pair") return pairStep;
 return document.querySelector('input[name="label-version"]:checked').value;
}

document.querySelectorAll(".mode-btn").forEach(btn => {
 btn.addEventListener("click", () => {
  mode = btn.dataset.mode;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b === btn));
  $("pair-progress").hidden = mode !== "pair";
  $("version-picker").style.display = mode === "pair" ? "none" : "";
  if (mode === "pair") resetPairSession();
  focusManualInput();
 });
});

// ---- Camera ----

function pickBackCamera(cameras) {
 const back = cameras.find(c => /back|rear|environment/i.test(c.label));
 return (back || cameras[cameras.length - 1]).id;
}

function populateCameraSelect(cameras, selectedId) {
 const sel = $("camera-select");
 sel.innerHTML = cameras.map(c => `<option value="${esc(c.id)}">${esc(c.label || c.id)}</option>`).join("");
 sel.value = selectedId;
 sel.hidden = cameras.length < 2;
}

function showCameraError(err) {
 const el = $("camera-error");
 el.hidden = false;
 el.textContent = "Error: " + (err && err.message ? err.message : String(err));
}

async function launchCamera(cameraId) {
 const scanner = getScanner();
 await scanner.start(cameraId, { fps: 10, qrbox: { width: 260, height: 260 } }, onDecoded, () => {});
 cameraRunning = true;
 $("btn-start-camera").hidden = true;
 $("btn-stop-camera").hidden = false;
 updateTorchButton();
}

async function startCamera() {
 $("camera-error").hidden = true;
 try {
  const cameras = await Html5Qrcode.getCameras();
  if (!cameras || !cameras.length) throw new Error("No camera found on this device.");
  const preferredId = $("camera-select").value || pickBackCamera(cameras);
  populateCameraSelect(cameras, preferredId);
  await launchCamera(preferredId);
 } catch (err) {
  showCameraError(err);
 }
}

async function stopCamera() {
 if (html5Qrcode && cameraRunning) {
  try { await html5Qrcode.stop(); } catch (e) {}
  html5Qrcode.clear();
 }
 cameraRunning = false;
 $("btn-start-camera").hidden = false;
 $("btn-stop-camera").hidden = true;
 $("btn-torch").hidden = true;
}

function updateTorchButton() {
 const btn = $("btn-torch");
 try {
  const torch = html5Qrcode.getRunningTrackCameraCapabilities().torchFeature();
  btn.hidden = !torch.isSupported();
  btn.textContent = torchOn ? "Torch: on" : "Torch: off";
 } catch (e) {
  btn.hidden = true;
 }
}

function onDecoded(decodedText) {
 stopCamera();
 showPreview(decodedText);
}

$("btn-start-camera").addEventListener("click", startCamera);
$("btn-stop-camera").addEventListener("click", stopCamera);

$("btn-torch").addEventListener("click", async () => {
 try {
  const torch = html5Qrcode.getRunningTrackCameraCapabilities().torchFeature();
  torchOn = !torchOn;
  await torch.apply(torchOn);
  updateTorchButton();
 } catch (e) {}
});

$("camera-select").addEventListener("change", async () => {
 if (cameraRunning) {
  await stopCamera();
  await launchCamera($("camera-select").value);
 }
});

$("file-input").addEventListener("change", async e => {
 const file = e.target.files[0];
 e.target.value = "";
 if (!file) return;
 $("camera-error").hidden = true;
 if (cameraRunning) await stopCamera();
 try {
  const decodedText = await getScanner().scanFile(file, false);
  showPreview(decodedText);
 } catch (err) {
  showCameraError(new Error("Couldn't find a recognizable code in that image."));
 }
});

$("btn-manual-add").addEventListener("click", () => {
 const val = $("manual-input").value.trim();
 if (!val) return;
 showPreview(val);
 $("manual-input").value = "";
});
$("manual-input").addEventListener("keydown", e => {
 if (e.key === "Enter") $("btn-manual-add").click();
});

// ---- Preview / save ----

function showPreview(raw) {
 const { ebom, traceability } = parseCode(raw);
 pendingDecoded = { raw, ebom, traceability };
 $("preview-raw").textContent = raw;
 $("preview-fields").innerHTML = ebom
  ? `<div><span class="field-label">EBOM</span>${esc(ebom)}</div><div><span class="field-label">Traceability</span>${esc(traceability)}</div>`
  : `<div class="muted">Doesn't match the P+EBOM-Traceability pattern &mdash; will be saved as raw text only.</div>`;
 $("preview").hidden = false;
}

$("btn-rescan").addEventListener("click", () => {
 pendingDecoded = null;
 $("preview").hidden = true;
 focusManualInput();
});

$("btn-save").addEventListener("click", async () => {
 if (!pendingDecoded) return;
 const labelVersion = currentLabelVersion();
 const correlationId = mode === "pair" ? pairCorrelationId : crypto.randomUUID();
 const row = {
  correlation_id: correlationId,
  label_version: labelVersion,
  raw_code: pendingDecoded.raw,
  ebom: pendingDecoded.ebom,
  traceability: pendingDecoded.traceability,
 };
 $("btn-save").disabled = true;
 const { data, error } = await sbClient.from("label_scans").insert(row).select().single();
 $("btn-save").disabled = false;
 if (error) {
  showCameraError(new Error("Save failed: " + error.message));
  return;
 }
 $("preview").hidden = true;
 pendingDecoded = null;
 showSavedToast(data);
 loadHistory($("search-input").value.trim());

 if (mode === "pair" && pairStep === "old") {
  pairStep = "new";
  updatePairProgressUI();
 } else if (mode === "pair" && pairStep === "new") {
  resetPairSession();
 }
 focusManualInput();
});

function showSavedToast(row) {
 clearTimeout(undoTimer);
 const toast = $("save-toast");
 toast.hidden = false;
 toast.innerHTML = `Saved as ${row.label_version} label <button id="btn-undo" class="link-btn">Undo</button>`;
 $("btn-undo").addEventListener("click", async () => {
  await sbClient.from("label_scans").delete().eq("id", row.id);
  toast.hidden = true;
  loadHistory($("search-input").value.trim());
  focusManualInput();
 });
 undoTimer = setTimeout(() => { toast.hidden = true; }, 8000);
}

// ---- History / correlation ----

function groupByCorrelation(rows) {
 const groups = new Map();
 for (const row of rows) {
  if (!groups.has(row.correlation_id)) groups.set(row.correlation_id, []);
  groups.get(row.correlation_id).push(row);
 }
 return groups;
}

async function loadHistory(searchTerm) {
 let query = sbClient.from("label_scans").select("*").order("scanned_at", { ascending: false }).limit(200);
 if (searchTerm) {
  const like = `%${searchTerm}%`;
  query = query.or(`raw_code.ilike.${like},ebom.ilike.${like},traceability.ilike.${like}`);
 }
 const { data, error } = await query;
 if (error) {
  $("history-list").innerHTML = `<div class="msg err">${esc(error.message)}</div>`;
  return;
 }
 historyRows = data || [];
 renderHistory();
 renderUnpaired();
}

function renderHistory() {
 const groups = groupByCorrelation(historyRows);
 if (!groups.size) {
  $("history-list").innerHTML = '<div class="empty">No scans yet.</div>';
  return;
 }
 const items = [];
 for (const rows of groups.values()) {
  const oldRow = rows.find(r => r.label_version === "old");
  const newRow = rows.find(r => r.label_version === "new");
  items.push(renderGroup(oldRow, newRow));
 }
 $("history-list").innerHTML = items.join("");
}

function renderGroup(oldRow, newRow) {
 const paired = Boolean(oldRow && newRow);
 return `<div class="scan-group ${paired ? "paired" : ""}">
   ${renderScanSide(oldRow, "old")}
   <div class="link-indicator">${paired ? "&harr;" : ""}</div>
   ${renderScanSide(newRow, "new")}
  </div>`;
}

function renderScanSide(row, version) {
 if (!row) return `<div class="scan-side empty-side">&mdash;</div>`;
 return `<div class="scan-side">
   <span class="badge badge-${version}">${version === "old" ? "Old" : "New"}</span>
   <div class="scan-raw">${esc(row.raw_code)}</div>
   ${row.ebom ? `<div class="scan-sub">EBOM ${esc(row.ebom)}</div>` : ""}
   ${row.traceability ? `<div class="scan-sub">Trace ${esc(row.traceability)}</div>` : ""}
   <div class="scan-time">${esc(formatTimestamp(row.scanned_at))}</div>
  </div>`;
}

function renderUnpaired() {
 const groups = groupByCorrelation(historyRows);
 const unpaired = [];
 for (const rows of groups.values()) {
  if (rows.length === 1) unpaired.push(rows[0]);
 }
 $("link-card").hidden = !unpaired.length;
 if (!unpaired.length) return;
 $("unpaired-list").innerHTML = unpaired.map(row => `
  <div class="unpaired-row">
   <span class="badge badge-${row.label_version}">${row.label_version === "old" ? "Old" : "New"}</span>
   <span class="scan-raw">${esc(row.raw_code)}</span>
   <button class="ghost" data-link-id="${row.id}">Link&hellip;</button>
  </div>`).join("");
}

$("unpaired-list").addEventListener("click", e => {
 const btn = e.target.closest("button[data-link-id]");
 if (!btn) return;
 const row = historyRows.find(r => String(r.id) === btn.dataset.linkId);
 openLinkModal(row);
});

function openLinkModal(row) {
 linkTargetRow = row;
 const wantVersion = row.label_version === "old" ? "new" : "old";
 $("link-modal-target").textContent = `Linking "${row.raw_code}" (${row.label_version}) to its ${wantVersion}-label match:`;
 $("link-search").value = "";
 renderLinkResults("");
 $("link-modal").hidden = false;
 $("link-search").focus();
}

function renderLinkResults(term) {
 const wantVersion = linkTargetRow.label_version === "old" ? "new" : "old";
 const groups = groupByCorrelation(historyRows);
 const candidates = [];
 for (const rows of groups.values()) {
  if (rows.length !== 1) continue;
  const r = rows[0];
  if (r.id === linkTargetRow.id || r.label_version !== wantVersion) continue;
  const haystack = `${r.raw_code} ${r.ebom || ""} ${r.traceability || ""}`.toLowerCase();
  if (term && !haystack.includes(term.toLowerCase())) continue;
  candidates.push(r);
 }
 $("link-results").innerHTML = candidates.length
  ? candidates.map(r => `
    <div class="unpaired-row">
     <span class="scan-raw">${esc(r.raw_code)}</span>
     <span class="scan-time">${esc(formatTimestamp(r.scanned_at))}</span>
     <button class="primary" data-pick-id="${r.id}">Choose</button>
    </div>`).join("")
  : `<div class="empty">No unpaired ${wantVersion} scans${term ? " matching that search" : ""}.</div>`;
}

$("link-search").addEventListener("input", e => renderLinkResults(e.target.value.trim()));
$("link-cancel").addEventListener("click", () => { $("link-modal").hidden = true; });

$("link-results").addEventListener("click", async e => {
 const btn = e.target.closest("button[data-pick-id]");
 if (!btn) return;
 const other = historyRows.find(r => String(r.id) === btn.dataset.pickId);
 const { error } = await sbClient.from("label_scans").update({ correlation_id: linkTargetRow.correlation_id }).eq("id", other.id);
 if (error) { alert("Link failed: " + error.message); return; }
 $("link-modal").hidden = true;
 loadHistory($("search-input").value.trim());
});

let searchDebounce;
$("search-input").addEventListener("input", e => {
 clearTimeout(searchDebounce);
 const term = e.target.value.trim();
 searchDebounce = setTimeout(() => loadHistory(term), 300);
});
$("btn-refresh").addEventListener("click", () => loadHistory($("search-input").value.trim()));

// ---- CSV report ----

function csvValue(v) {
 if (v == null) return "";
 const s = String(v);
 return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// One row per correlation group (not per scan) -- old/new side by side, so
// the report reads the same way the "Recent scans" list does.
function buildReportCsv(rows) {
 const header = ["linked", "old_raw_code", "old_ebom", "old_traceability", "old_scanned_at", "new_raw_code", "new_ebom", "new_traceability", "new_scanned_at", "correlation_id"];
 const lines = [header.join(",")];
 for (const groupRows of groupByCorrelation(rows).values()) {
  const oldRow = groupRows.find(r => r.label_version === "old");
  const newRow = groupRows.find(r => r.label_version === "new");
  lines.push([
   oldRow && newRow ? "yes" : "no",
   oldRow ? oldRow.raw_code : "", oldRow ? oldRow.ebom : "", oldRow ? oldRow.traceability : "", oldRow ? formatTimestamp(oldRow.scanned_at) : "",
   newRow ? newRow.raw_code : "", newRow ? newRow.ebom : "", newRow ? newRow.traceability : "", newRow ? formatTimestamp(newRow.scanned_at) : "",
   (oldRow || newRow).correlation_id,
  ].map(csvValue).join(","));
 }
 return lines.join("\r\n");
}

$("btn-download-report").addEventListener("click", async () => {
 const btn = $("btn-download-report");
 btn.disabled = true;
 const searchTerm = $("search-input").value.trim();
 let query = sbClient.from("label_scans").select("*").order("scanned_at", { ascending: false });
 if (searchTerm) {
  const like = `%${searchTerm}%`;
  query = query.or(`raw_code.ilike.${like},ebom.ilike.${like},traceability.ilike.${like}`);
 }
 const { data, error } = await query;
 btn.disabled = false;
 if (error) { alert("Couldn't build the report: " + error.message); return; }

 const csv = buildReportCsv(data || []);
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `label-scans-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
});

// ---- Init ----
resetPairSession();
loadHistory();
focusManualInput();
