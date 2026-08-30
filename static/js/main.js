// EcoReward Phase 3B: Interactive AI Vision Classifier, QR Scanner, Points Estimator, & Hardware Simulator

let html5QrCode = null;
let mobilenetModel = null;
let aiVideoStream = null;

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
  if (document.getElementById("ai-video")) {
    initAiClassifier();
  }
});

/* ----------------------------------------------------
   1. AI VISION CLASSIFIER (TensorFlow.js + MobileNet)
---------------------------------------------------- */
async function initAiClassifier() {
  const statusDiv = document.getElementById("ai-model-status");
  const classifyBtn = document.getElementById("btn-classify");

  try {
    if (typeof mobilenet !== "undefined") {
      mobilenetModel = await mobilenet.load();
      if (statusDiv) statusDiv.innerHTML = `✅ AI MobileNet Vision Model Ready!`;
      if (classifyBtn) classifyBtn.disabled = false;
      setupAiWebcam();
    } else {
      if (statusDiv) statusDiv.innerHTML = `⚠️ TensorFlow.js or MobileNet script failed to load.`;
    }
  } catch (err) {
    console.error("AI Model Loading Error:", err);
    if (statusDiv) statusDiv.innerHTML = `⚠️ AI Model Initialization Error: ${err.message || err}`;
  }
}

async function setupAiWebcam() {
  const videoElem = document.getElementById("ai-video");
  if (!videoElem) return;

  try {
    aiVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    videoElem.srcObject = aiVideoStream;
  } catch (err) {
    console.warn("AI Webcam access denied or unavailable:", err);
    const statusDiv = document.getElementById("ai-model-status");
    if (statusDiv) statusDiv.innerHTML = `⚠️ Camera access denied or unavailable.`;
  }
}

async function classifyCurrentFrame() {
  const videoElem = document.getElementById("ai-video");
  const badge = document.getElementById("ai-result-badge");
  const nameDiv = document.getElementById("ai-detected-name");
  const categoryDiv = document.getElementById("ai-category-matched");
  const classifyBtn = document.getElementById("btn-classify");

  if (!mobilenetModel || !videoElem) return;

  if (classifyBtn) classifyBtn.innerHTML = `⏳ Analyzing Image Frame...`;

  try {
    const predictions = await mobilenetModel.classify(videoElem);
    if (classifyBtn) classifyBtn.innerHTML = `🎯 Scan & Classify Waste Item`;

    if (predictions && predictions.length > 0) {
      const topPred = predictions[0];
      const detectedName = topPred.className.split(",")[0].trim();
      const confidence = Math.round(topPred.probability * 100);
      const matchedCategory = mapPredictionToCategory(topPred.className.toLowerCase());

      if (badge) badge.style.display = "block";
      if (nameDiv) nameDiv.innerHTML = `Item Detected: <strong>${escapeHtml(detectedName)}</strong> (${confidence}% confidence)`;
      if (categoryDiv) categoryDiv.innerHTML = `Auto-Matched Category: <strong style="color:#16794c;">${matchedCategory}</strong> (${RATES[matchedCategory]} pts / 100g)`;

      // Auto-prefill category form and advance step indicator
      prefillForm(matchedCategory, parseInt(document.getElementById("weightInput")?.value || "250", 10));

      const step1 = document.getElementById("step-1");
      const step2 = document.getElementById("step-2");
      if (step1 && step2) {
        step1.classList.remove("active");
        step2.classList.add("active");
      }
    }
  } catch (err) {
    console.error("Frame classification error:", err);
    if (classifyBtn) classifyBtn.innerHTML = `🎯 Scan & Classify Waste Item`;
  }
}

function mapPredictionToCategory(label) {
  label = label.toLowerCase();
  
  // Plastic keywords
  if (label.includes("bottle") || label.includes("water bottle") || label.includes("pop bottle") || 
      label.includes("plastic") || label.includes("container") || label.includes("bucket") || 
      label.includes("tub") || label.includes("cup") || label.includes("beaker") || 
      label.includes("lotion") || label.includes("sunscreen") || label.includes("shampoo")) {
    return "Plastic";
  }
  
  // Metal keywords
  if (label.includes("can") || label.includes("tin") || label.includes("beer") || 
      label.includes("metal") || label.includes("aluminum") || label.includes("brass") || 
      label.includes("kettle") || label.includes("pan") || label.includes("pot") || 
      label.includes("corkscrew") || label.includes("hammer") || label.includes("nail")) {
    return "Metal";
  }
  
  // Paper keywords
  if (label.includes("paper") || label.includes("carton") || label.includes("cardboard") || 
      label.includes("box") || label.includes("envelope") || label.includes("book") || 
      label.includes("journal") || label.includes("notebook") || label.includes("newspaper") || 
      label.includes("tissue") || label.includes("towel") || label.includes("packet")) {
    return "Paper";
  }

  return "Other";
}


/* ----------------------------------------------------
   2. QR CODE SCANNER (HTML5 QR CODE)
---------------------------------------------------- */
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
    console.log("Webcam QR access error or camera not found:", err);
    qrRegion.innerHTML = `<p style="padding: 20px; color: #888; text-align: center;">Webcam unavailable or permission denied.<br>Use Manual Entry or Hardware Simulator below.</p>`;
  });
}

function onQrCodeSuccess(decodedText, decodedResult) {
  const resultBox = document.getElementById("qr-result");
  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.innerHTML = `✅ Scanned QR / Barcode: <strong>${escapeHtml(decodedText)}</strong>`;
  }
  
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  if (step1 && step2) {
    step1.classList.remove("active");
    step2.classList.add("active");
  }

  if (decodedText.toUpperCase().includes("PLASTIC")) prefillForm("Plastic", 250);
  else if (decodedText.toUpperCase().includes("PAPER")) prefillForm("Paper", 300);
  else if (decodedText.toUpperCase().includes("METAL")) prefillForm("Metal", 150);
}

function onQrCodeError(errorMessage) {
  // Ignore minor frame read failures
}


/* ----------------------------------------------------
   3. TAB MODE SWITCHER & FORM PREFILL
---------------------------------------------------- */
function switchMode(mode) {
  const aiSec = document.getElementById("ai-section");
  const qrSec = document.getElementById("qr-section");
  const formSec = document.getElementById("form-section");
  const sensorSec = document.getElementById("sensor-section");

  const tabAi = document.getElementById("tab-ai");
  const tabQr = document.getElementById("tab-qr");
  const tabManual = document.getElementById("tab-manual");
  const tabSensor = document.getElementById("tab-sensor");

  if (aiSec) aiSec.style.display = (mode === "ai") ? "block" : "none";
  if (qrSec) qrSec.style.display = (mode === "qr") ? "block" : "none";
  if (formSec) formSec.style.display = (mode === "sensor") ? "none" : "block";
  if (sensorSec) sensorSec.style.display = (mode === "sensor") ? "block" : "none";

  [tabAi, tabQr, tabManual, tabSensor].forEach(btn => btn && btn.classList.add("secondary"));
  if (mode === "ai" && tabAi) tabAi.classList.remove("secondary");
  if (mode === "qr" && tabQr) tabQr.classList.remove("secondary");
  if (mode === "manual" && tabManual) tabManual.classList.remove("secondary");
  if (mode === "sensor" && tabSensor) tabSensor.classList.remove("secondary");
}

function prefillForm(category, weight) {
  const catSel = document.getElementById("categorySelect");
  const wtInp = document.getElementById("weightInput");
  if (catSel) catSel.value = category;
  if (wtInp && (!wtInp.value || wtInp.value === "0")) wtInp.value = weight;
  calculatePointsPreview();
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


/* ----------------------------------------------------
   4. HARDWARE SIMULATOR & REST API
---------------------------------------------------- */
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
