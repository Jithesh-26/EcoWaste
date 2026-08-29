// EcoReward Phase 3: Interactive QR Scanner, Points Estimator, & Hardware Simulator

let html5QrCode = null;

const RATES = {
  "Plastic": 5,
  "Paper": 3,
  "Metal": 8,
  "Other": 1
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("qr-reader")) {
    initQrScanner();
  }
});

function initQrScanner() {
  const qrRegion = document.getElementById("qr-reader");
  if (!qrRegion || typeof Html5Qrcode === "undefined") return;

  html5QrCode = new Html5Qrcode("qr-reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onQrCodeSuccess,
    onQrCodeError
  ).catch(err => {
    console.log("Webcam access error or camera not found:", err);
    qrRegion.innerHTML = `<p style="padding: 20px; color: #888; text-align: center;">Webcam unavailable or permission denied.<br>Use Manual Entry or Hardware Simulator below.</p>`;
  });
}

function onQrCodeSuccess(decodedText, decodedResult) {
  const resultBox = document.getElementById("qr-result");
  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.innerHTML = `✅ Scanned QR / Barcode: <strong>${escapeHtml(decodedText)}</strong>`;
  }
  
  // Advance progress steps
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  if (step1 && step2) {
    step1.classList.remove("active");
    step2.classList.add("active");
  }

  // If QR contains a waste type hint (e.g. "PLASTIC:250"), prefill form
  if (decodedText.toUpperCase().includes("PLASTIC")) prefillForm("Plastic", 250);
  else if (decodedText.toUpperCase().includes("PAPER")) prefillForm("Paper", 300);
  else if (decodedText.toUpperCase().includes("METAL")) prefillForm("Metal", 150);
}

function onQrCodeError(errorMessage) {
  // Ignore minor frame read failures
}

function prefillForm(category, weight) {
  const catSel = document.getElementById("categorySelect");
  const wtInp = document.getElementById("weightInput");
  if (catSel) catSel.value = category;
  if (wtInp) wtInp.value = weight;
  calculatePointsPreview();
}

function switchMode(mode) {
  const qrSec = document.getElementById("qr-section");
  const formSec = document.getElementById("form-section");
  const sensorSec = document.getElementById("sensor-section");

  const tabQr = document.getElementById("tab-qr");
  const tabManual = document.getElementById("tab-manual");
  const tabSensor = document.getElementById("tab-sensor");

  if (qrSec) qrSec.style.display = (mode === "qr") ? "block" : "none";
  if (formSec) formSec.style.display = (mode === "sensor") ? "none" : "block";
  if (sensorSec) sensorSec.style.display = (mode === "sensor") ? "block" : "none";

  [tabQr, tabManual, tabSensor].forEach(btn => btn && btn.classList.add("secondary"));
  if (mode === "qr" && tabQr) tabQr.classList.remove("secondary");
  if (mode === "manual" && tabManual) tabManual.classList.remove("secondary");
  if (mode === "sensor" && tabSensor) tabSensor.classList.remove("secondary");
}

function calculatePointsPreview() {
  const category = document.getElementById("categorySelect")?.value;
  const weight = parseInt(document.getElementById("weightInput")?.value || "0", 10);
  const previewDiv = document.getElementById("points-preview");
  const previewPts = document.getElementById("preview-pts");

  if (category && RATES[category] && weight > 0) {
    const pts = Math.max(1, Math.round(weight * RATES[category] / 100));
    if (previewPts) previewPts.textContent = `+${pts} pts`;
    if (previewDiv) previewDiv.style.display = "block";
  } else {
    if (previewDiv) previewDiv.style.display = "none";
  }
}

async function simulateSensor(weight, category) {
  const statusDiv = document.getElementById("sensor-status");
  if (statusDiv) statusDiv.innerHTML = `⏳ Sending HTTP POST request from simulated load cell...`;

  try {
    const response = await fetch("/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, weight })
    });
    const data = await response.json();
    if (data.success) {
      if (statusDiv) statusDiv.innerHTML = `✅ <span style="color: #22c55e;">${data.message}</span> (Earned ${data.points} points)`;
    } else {
      if (statusDiv) statusDiv.innerHTML = `❌ <span style="color: #ef4444;">${data.message || "Failed to process deposit"}</span>`;
    }
  } catch (err) {
    if (statusDiv) statusDiv.innerHTML = `❌ Network Error: Could not reach backend API.`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}
