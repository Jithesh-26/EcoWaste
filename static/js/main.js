// EcoReward: Interactive AI Vision Classifier, Hardware Monitor, & Demo Mode

let mobilenetModel = null;
let aiVideoStream = null;
let lastRenderedDepositTs = 0;
let simulatedIrState = false;

const RATES = {
  "Plastic": 5,
  "Paper": 3,
  "Metal": 8,
  "Other": 1
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("ai-video")) {
    initAiClassifier();
  }
  // Start polling hardware monitor on deposit page (400ms for responsive live scale)
  if (document.getElementById("hw-esp32-dot")) {
    pollHardwareStatus();
    setInterval(pollHardwareStatus, 400);
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
      if (statusDiv) statusDiv.innerHTML = `⏳ Loading local AI model (Offline)...`;
      mobilenetModel = await mobilenet.load({
        version: 1,
        alpha: 1.0,
        modelUrl: "/static/models/mobilenet/model.json"
      });
      if (statusDiv) statusDiv.innerHTML = `✅ AI Vision Model Ready (100% Offline)`;
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
  const statusPill = document.getElementById("ai-status-pill");
  const confPill = document.getElementById("ai-confidence-pill");
  const categoryDiv = document.getElementById("ai-category-matched");
  const rateDiv = document.getElementById("ai-points-rate");
  const instructionDiv = document.getElementById("ai-instruction-text");
  const classifyBtn = document.getElementById("btn-classify");

  if (!mobilenetModel || !videoElem) return;

  if (classifyBtn) classifyBtn.innerHTML = `⏳ Analyzing Image Frame...`;

  try {
    const predictions = await mobilenetModel.classify(videoElem, 5);
    if (classifyBtn) classifyBtn.innerHTML = `🎯 Scan & Classify Waste Item`;

    // 1-Click Classification Strategy:
    // If it clearly matches Plastic, Metal, or Paper -> assign that category.
    // If it cannot classify or is anything else -> instantly assign "Other".
    let matchedCategory = "Other";

    if (predictions && predictions.length > 0) {
      const topCategory = mapPredictionToCategory(predictions[0].className);
      if (topCategory !== "Other") {
        matchedCategory = topCategory;
      } else {
        // Check next top candidates for Plastic/Metal/Paper match
        for (let i = 1; i < Math.min(predictions.length, 3); i++) {
          const candidateCat = mapPredictionToCategory(predictions[i].className);
          if (candidateCat !== "Other" && predictions[i].probability >= 0.15) {
            matchedCategory = candidateCat;
            break;
          }
        }
      }
    }

    // In 1 single click, immediately lock the result (Plastic, Metal, Paper, OR Other)
    if (badge) {
      badge.style.display = "block";
      badge.style.background = "#edf8f0";
      badge.style.border = "1px solid #22c55e";
    }
    if (statusPill) {
      statusPill.style.background = "#22c55e";
      statusPill.style.color = "#ffffff";
      statusPill.textContent = "✅ Identified";
    }
    if (confPill) {
      confPill.style.display = "none";
    }
    if (categoryDiv) {
      categoryDiv.innerHTML = `Category: <strong style="color: #16794c;">${matchedCategory}</strong>`;
    }
    if (rateDiv) {
      rateDiv.innerHTML = `Reward Rate: <strong>${RATES[matchedCategory] || 1} pts / 100g</strong>`;
    }
    if (instructionDiv) {
      instructionDiv.innerHTML = `<span style="color: #16794c; font-weight: 700;">Ready for Step 2:</span> Category identified: <strong>${matchedCategory}</strong>. Please place item inside the smart bin.`;
    }

    // Lock pending category on backend
    await registerPendingDeposit(matchedCategory, 100);

    // Advance visual step indicator to Step 2
    setStepIndicator(2);

    // Activate and smoothly scroll to Step 2 Digital Scale
    const scaleCard = document.getElementById("scale-card");
    if (scaleCard) {
      scaleCard.classList.add("active-scale", "scale-pulse");
      scaleCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const guidance = document.getElementById("scale-guidance-text");
    if (guidance) {
      guidance.innerHTML = `<strong>Category identified: ${matchedCategory}</strong>. Please place your waste item into the smart bin intake.`;
    }

    // Pre-fill manual backup form
    prefillForm(matchedCategory, 250);

  } catch (err) {
    console.error("Frame classification error:", err);
    if (classifyBtn) classifyBtn.innerHTML = `🎯 Scan & Classify Waste Item`;
  }
}

function mapPredictionToCategory(label) {
  if (!label) return "Other";
  label = label.toLowerCase();
  
  // Plastic keywords
  if (label.includes("bottle") || label.includes("water bottle") || label.includes("pop bottle") || 
      label.includes("plastic") || label.includes("container") || label.includes("bucket") || 
      label.includes("tub") || label.includes("cup") || label.includes("beaker") || 
      label.includes("lotion") || label.includes("sunscreen") || label.includes("shampoo") ||
      label.includes("jug") || label.includes("flask") || label.includes("pitcher") ||
      label.includes("measuring cup") || label.includes("vial") || label.includes("soap dispenser") ||
      label.includes("polyethylene") || label.includes("straw") || label.includes("bag")) {
    return "Plastic";
  }
  
  // Metal keywords
  if (label.includes("can") || label.includes("tin") || label.includes("beer") || 
      label.includes("metal") || label.includes("aluminum") || label.includes("brass") || 
      label.includes("steel") || label.includes("copper") || label.includes("iron") ||
      label.includes("kettle") || label.includes("pan") || label.includes("pot") || 
      label.includes("corkscrew") || label.includes("hammer") || label.includes("nail") ||
      label.includes("screw") || label.includes("wrench") || label.includes("scissors") ||
      label.includes("spoon") || label.includes("fork") || label.includes("knife") ||
      label.includes("foil") || label.includes("thimble") || label.includes("cork")) {
    return "Metal";
  }
  
  // Paper keywords
  if (label.includes("paper") || label.includes("carton") || label.includes("cardboard") || 
      label.includes("box") || label.includes("envelope") || label.includes("book") || 
      label.includes("journal") || label.includes("notebook") || label.includes("newspaper") || 
      label.includes("tissue") || label.includes("towel") || label.includes("packet") ||
      label.includes("magazine") || label.includes("pamphlet") || label.includes("flyer") ||
      label.includes("ticket") || label.includes("napkin") || label.includes("wrapper") ||
      label.includes("menu") || label.includes("binder") || label.includes("postcard")) {
    return "Paper";
  }

  return "Other";
}


/* ----------------------------------------------------
   2. HARDWARE MONITOR POLLING & RECEIPT SLIP
---------------------------------------------------- */
async function registerPendingDeposit(category, confidence) {
  try {
    const res = await fetch("/api/hardware/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, confidence })
    });
    const data = await res.json();
    if (data.success) {
      const typeSpan = document.getElementById("hw-pending-type");
      if (typeSpan) typeSpan.innerHTML = `<span style="color:#16794c;">${data.category}</span>`;
    }
  } catch (e) {
    console.warn("Could not register pending deposit:", e);
  }
}

async function pollHardwareStatus() {
  try {
    const res = await fetch("/api/hardware/status");
    const data = await res.json();
    if (!data.success) return;

    // ESP32 Connection Status
    const esp32Dot = document.getElementById("hw-esp32-dot");
    const esp32Text = document.getElementById("hw-esp32-text");
    if (esp32Dot && esp32Text) {
      if (data.esp32_connected) {
        esp32Dot.style.background = "#22c55e";
        esp32Text.style.color = "#16794c";
        esp32Text.textContent = "Online (Active)";
      } else {
        esp32Dot.style.background = "#94a3b8";
        esp32Text.style.color = "#64748b";
        esp32Text.textContent = "Standby (Demo Ready)";
      }
    }

    // IR Sensor State
    const irDot = document.getElementById("hw-ir-dot");
    const irText = document.getElementById("hw-ir-text");
    if (irDot && irText) {
      if (data.ir_detected) {
        irDot.style.background = "#ef4444";
        irText.style.color = "#b91c1c";
        irText.textContent = "Object Inside Bin";
      } else {
        irDot.style.background = "#22c55e";
        irText.style.color = "#16794c";
        irText.textContent = "Beam Clear";
      }
    }

    // Current Weight (Top status bar)
    const weightText = document.getElementById("hw-weight-text");
    if (weightText) {
      weightText.textContent = `${data.current_weight_g || 0} g`;
    }

    // Step 2: Digital Weigh Scale Live Display
    const digitalVal = document.getElementById("digital-scale-value");
    const scaleProgress = document.getElementById("scale-progress-bar");
    const scaleBadge = document.getElementById("scale-status-badge");
    const scaleEst = document.getElementById("scale-points-estimate");
    const btnConfirm = document.getElementById("btn-confirm-deposit");
    const guidanceText = document.getElementById("scale-guidance-text");
    const scaleCard = document.getElementById("scale-card");

    const curWeight = Number(data.current_weight_g) || 0;

    if (digitalVal) digitalVal.textContent = curWeight;
    if (scaleProgress) {
      const pct = Math.min(100, Math.max(0, (curWeight / 1000) * 100));
      scaleProgress.style.width = `${pct}%`;
    }

    if (scaleBadge) {
      if (curWeight > 5) {
        scaleBadge.textContent = `⚖️ Item on Scale (${curWeight} g)`;
        scaleBadge.style.background = "#dcfce7";
        scaleBadge.style.color = "#15803d";
      } else {
        scaleBadge.textContent = "⚖️ Ready (Zeroed)";
        scaleBadge.style.background = "#e2f2e7";
        scaleBadge.style.color = "#16794c";
      }
    }

    const activeCategory = data.pending_category;
    if (activeCategory && RATES[activeCategory]) {
      if (scaleCard) scaleCard.classList.add("active-scale");
      if (curWeight >= 5) {
        const estPoints = Math.max(1, Math.round((curWeight * RATES[activeCategory] + 50) / 100));
        if (scaleEst) scaleEst.innerHTML = `<span style="color:#16794c;">+${estPoints} pts</span> <span style="font-size:0.85rem; font-weight:normal; color:#64748b;">(${activeCategory}: ${RATES[activeCategory]} pts/100g)</span>`;
        if (btnConfirm) btnConfirm.disabled = false;
        if (guidanceText) guidanceText.innerHTML = `<strong>Item on scale:</strong> ${curWeight}g of ${activeCategory}. Drop detected or click Confirm below!`;
      } else {
        if (scaleEst) scaleEst.innerHTML = `<span style="color:#64748b; font-size:1rem; font-weight:600;">Place item on scale...</span>`;
        if (btnConfirm) btnConfirm.disabled = true;
        if (guidanceText) guidanceText.innerHTML = `<strong>Category locked: ${activeCategory}.</strong> Place item on the scale / into the bin.`;
      }
    } else {
      if (scaleEst) scaleEst.innerHTML = `<span style="color:#94a3b8; font-size:0.92rem; font-weight:normal;">Scan item with camera first</span>`;
      if (btnConfirm) btnConfirm.disabled = true;
      if (guidanceText && !curWeight) guidanceText.textContent = "Show item to camera above to lock the category, then place item into the bin intake.";
    }

    // Pending Type
    const typeSpan = document.getElementById("hw-pending-type");
    if (typeSpan) {
      if (data.pending_category) {
        typeSpan.innerHTML = `<span style="color:#16794c; font-weight:700;">${data.pending_category}</span>`;
      } else {
        typeSpan.textContent = "None (Show to Camera)";
      }
    }

    // Step Sync
    if (data.step === "WAIT_FOR_CAMERA") {
      setStepIndicator(1);
    } else if (data.step === "PENDING_INSERT") {
      setStepIndicator(2);
    } else if (data.step === "READY_TO_COLLECT") {
      setStepIndicator(3);
      if (data.last_deposit && !data.last_deposit.collected) {
        showCollectRewardCard(data.last_deposit);
      }
    } else if (data.step === "COMPLETED") {
      setStepIndicator(3);
    }

    // Only render slip if already collected
    if (data.last_deposit && data.last_deposit.collected && data.last_deposit.timestamp && data.last_deposit.timestamp > lastRenderedDepositTs) {
      lastRenderedDepositTs = data.last_deposit.timestamp;
      const collectCard = document.getElementById("collect-reward-card");
      if (collectCard) collectCard.style.display = "none";
      renderReceiptSlip(data.last_deposit);
    }
  } catch (err) {
    // Silent catch during page navigation
  }
}

function setStepIndicator(stepNum) {
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  const step3 = document.getElementById("step-3");
  [step1, step2, step3].forEach(s => s && s.classList.remove("active"));

  if (stepNum === 1 && step1) step1.classList.add("active");
  if (stepNum === 2 && step2) step2.classList.add("active");
  if (stepNum === 3 && step3) step3.classList.add("active");
}

function renderReceiptSlip(deposit) {
  const container = document.getElementById("receipt-container");
  if (!container) return;

  const recCat = document.getElementById("rec-category");
  const recWt = document.getElementById("rec-weight");
  const recPts = document.getElementById("rec-points");
  const recDate = document.getElementById("rec-datetime");
  const recBal = document.getElementById("rec-balance");

  if (recCat) recCat.textContent = (deposit.category || "PLASTIC").toUpperCase();
  if (recWt) recWt.textContent = `${deposit.weight} g`;
  if (recPts) recPts.textContent = `+${deposit.points} PTS`;
  if (recDate) recDate.textContent = `${deposit.date_str || ""} ${deposit.time_str || ""}`;
  if (recBal) recBal.textContent = `${deposit.new_balance} PTS`;

  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth", block: "center" });

  setStepIndicator(3);
}

// Synthesize physical buzzer sound via Web Audio API (Double Beep)
function playBuzzerSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Beep 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5 note
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Beep 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.2); // D6 note
    gain2.gain.setValueAtTime(0.15, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.4);
  } catch (e) {
    // AudioContext blocked by browser policy before user interaction
  }
}


/* ----------------------------------------------------
   3. DEMO SIMULATOR & HARDWARE CONTROL ACTIONS
---------------------------------------------------- */
let currentPendingDeposit = null;

function showCollectRewardCard(deposit) {
  if (!deposit) return;
  currentPendingDeposit = deposit;
  const card = document.getElementById("collect-reward-card");
  const wtText = document.getElementById("collect-weight-text");
  const catText = document.getElementById("collect-category-text");
  const ptsText = document.getElementById("collect-points-text");
  const receiptContainer = document.getElementById("receipt-container");

  if (receiptContainer) receiptContainer.style.display = "none";

  if (wtText) wtText.textContent = `${deposit.weight}g`;
  if (catText) catText.textContent = deposit.category;
  if (ptsText) ptsText.textContent = `+${deposit.points} PTS`;

  if (card) {
    card.style.display = "block";
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  setStepIndicator(3);
}

async function collectReward() {
  const btn = document.getElementById("btn-collect-reward");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span><span>Dispensing Slip via Servo...</span>`;
  }

  try {
    const res = await fetch("/api/hardware/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    const deposit = (data && data.deposit) ? data.deposit : currentPendingDeposit;

    // Hide collect reward card
    const card = document.getElementById("collect-reward-card");
    if (card) card.style.display = "none";

    // Show slip and sound
    if (deposit) {
      renderReceiptSlip(deposit);
      playBuzzerSound();
    }
    pollHardwareStatus();
  } catch (err) {
    console.error("Collect reward error:", err);
    if (currentPendingDeposit) {
      const card = document.getElementById("collect-reward-card");
      if (card) card.style.display = "none";
      renderReceiptSlip(currentPendingDeposit);
      playBuzzerSound();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🎟️</span><span>Collect Reward Slip</span><span>➔</span>`;
    }
  }
}

async function confirmCurrentScaleDeposit() {
  const btnConfirm = document.getElementById("btn-confirm-deposit");
  if (btnConfirm) btnConfirm.disabled = true;

  try {
    const res = await fetch("/api/hardware/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ir_detected: true })
    });
    const data = await res.json();
    if (data.success) {
      showCollectRewardCard(data.deposit);
      pollHardwareStatus();
    } else {
      alert(data.message || "Deposit confirmation failed.");
      if (btnConfirm) btnConfirm.disabled = false;
    }
  } catch (e) {
    alert("Could not communicate with backend.");
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

async function runDemoDeposit(category, weight) {
  const statusDiv = document.getElementById("sensor-status");
  if (statusDiv) statusDiv.innerHTML = `⏳ Simulating Camera Lock (${category}) & Load Cell Weight (${weight}g)...`;

  try {
    // 1. Lock category
    await registerPendingDeposit(category, 95);

    // 2. Animate digital scale weighing
    const scaleCard = document.getElementById("scale-card");
    if (scaleCard) {
      scaleCard.classList.add("active-scale");
      scaleCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const digitalVal = document.getElementById("digital-scale-value");
    const scaleProgress = document.getElementById("scale-progress-bar");
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const intermediate = Math.round((weight / steps) * i);
      if (digitalVal) digitalVal.textContent = intermediate;
      if (scaleProgress) scaleProgress.style.width = `${Math.min(100, (intermediate / 1000) * 100)}%`;
      await new Promise(r => setTimeout(r, 45));
    }

    // 3. Trigger deposit
    const res = await fetch("/api/hardware/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, weight, ir_detected: true, demo: true })
    });
    const data = await res.json();

    if (data.success) {
      if (statusDiv) {
        statusDiv.innerHTML = `✅ <span style="color:#16794c;">Deposit Verified!</span> Recorded ${data.weight}g of ${data.category}. Click <strong>Collect Reward Slip</strong> below.`;
      }
      showCollectRewardCard(data.deposit);
      pollHardwareStatus();
    } else {
      if (statusDiv) {
        statusDiv.innerHTML = `❌ <span style="color:#ef4444;">${data.message || "Simulation failed."}</span>`;
      }
    }
  } catch (err) {
    if (statusDiv) statusDiv.innerHTML = `❌ Network Error: Could not reach backend server.`;
  }
}

function runCustomDemoDeposit() {
  const wt = parseInt(document.getElementById("demo-weight-input")?.value || "350", 10);
  const cat = document.getElementById("demo-cat-select")?.value || "Plastic";
  runDemoDeposit(cat, wt);
}

async function toggleSimulatedIr() {
  simulatedIrState = !simulatedIrState;
  try {
    await fetch("/api/hardware/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ir_detected: simulatedIrState, current_weight_g: simulatedIrState ? 250 : 0 })
    });
    pollHardwareStatus();
  } catch (e) {}
}

async function requestScaleTare() {
  try {
    const res = await fetch("/api/hardware/tare", { method: "POST" });
    const data = await res.json();
    alert(data.message || "Tare signal queued!");
    pollHardwareStatus();
  } catch (e) {
    alert("Could not queue tare signal.");
  }
}

async function resetForNextDeposit() {
  await resetHardwareState();
  const scaleCard = document.getElementById("scale-card");
  if (scaleCard) scaleCard.classList.remove("active-scale", "scale-pulse");
  const aiSec = document.getElementById("ai-section");
  if (aiSec) aiSec.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function resetHardwareState() {
  try {
    const res = await fetch("/api/hardware/reset", { method: "POST" });
    const data = await res.json();
    const badge = document.getElementById("ai-result-badge");
    const container = document.getElementById("receipt-container");
    const collectCard = document.getElementById("collect-reward-card");
    if (badge) badge.style.display = "none";
    if (container) container.style.display = "none";
    if (collectCard) collectCard.style.display = "none";
    currentPendingDeposit = null;
    setStepIndicator(1);
    pollHardwareStatus();
  } catch (e) {}
}


/* ----------------------------------------------------
   4. TAB MODE SWITCHER & FORM PREFILL
---------------------------------------------------- */
function switchMode(mode) {
  const aiSec = document.getElementById("ai-section");
  const formSec = document.getElementById("form-section");
  const sensorSec = document.getElementById("sensor-section");

  const tabAi = document.getElementById("tab-ai");
  const tabManual = document.getElementById("tab-manual");
  const tabSensor = document.getElementById("tab-sensor");

  if (aiSec) aiSec.style.display = (mode === "ai") ? "block" : "none";
  if (formSec) formSec.style.display = (mode === "manual") ? "block" : "none";
  if (sensorSec) sensorSec.style.display = (mode === "sensor") ? "block" : "none";

  [tabAi, tabManual, tabSensor].forEach(btn => btn && btn.classList.add("secondary"));
  if (mode === "ai" && tabAi) tabAi.classList.remove("secondary");
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}
