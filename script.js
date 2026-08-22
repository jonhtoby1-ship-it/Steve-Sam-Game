alert("LE SCRIPT EST BIEN CHARGÉ !");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ÉLÉMENTS UI
const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("game-status");

// ÉCRANS ET MODAUX
const mainMenu = document.getElementById("main-menu");
const settingsModal = document.getElementById("settings-modal");
const manualModal = document.getElementById("manual-modal");

const gameModeSelect = document.getElementById("gameModeSelect");
const gameDurationSelect = document.getElementById("gameDuration");

// ÉTAT DU JEU
let currentGameMode = "AI"; 
let score1 = 0, score2 = 0, round = 1;
let totalTime = 180, timeLeft = 90;
let isPaused = false, isGameOver = false;
let isCountdown = false, countdownValue = 3;
let timerInterval = null, countdownInterval = null;

// GESTION DU CLAVIER
const keys = {};
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

// ==========================================
// SYNTHÉTISEUR AUDIO (DÉBLOQUÉ)
// ==========================================
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

['click', 'touchstart', 'keydown'].forEach(evt => {
  window.addEventListener(evt, initAudio, { once: false });
});

function playTone(freq, duration, type = "sine") {
  initAudio();
  if (!audioCtx) return;

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.log("Audio non disponible :", e);
  }
}

function playKickSound() { playTone(120, 0.08, "triangle"); }
function playBeepSound(high = false) { playTone(high ? 880 : 440, 0.15, "sine"); }
function playGoalSound() { playTone(220, 0.6, "sawtooth"); }

// ==========================================
// JOUEURS, BALLE & JOYSTICKS
// ==========================================
const p1 = { x: 120, y: 250, radius: 18, color: "#00d2ff", speed: 5, num: "J1" };
const p2 = { x: 680, y: 250, radius: 18, color: "#ff416c", speed: 5, num: "J2" };
const ball = { x: 400, y: 250, radius: 10, color: "#ffffff", vx: 0, vy: 0, friction: 0.98 };

const goalHeight = 200;
const goalY = (canvas.height - goalHeight) / 2;

const joy1 = { baseX: 80, baseY: 420, stickX: 80, stickY: 420, baseR: 45, stickR: 20, dirX: 0, dirY: 0, active: false, touchId: null };
const joy2 = { baseX: 720, baseY: 420, stickX: 720, stickY: 420, baseR: 45, stickR: 20, dirX: 0, dirY: 0, active: false, touchId: null };

function handlePointer(clientX, clientY, isDown, touchId = null) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  [joy1, joy2].forEach((j, idx) => {
    // Si mode IA, le Joystick 2 est désactivé
    if (idx === 1 && currentGameMode === "AI") return;

    if (isDown) {
      const dist = Math.hypot(x - j.baseX, y - j.baseY);
      if (dist < j.baseR + 40 && (!j.active || j.touchId === touchId)) {
        j.active = true;
        j.touchId = touchId;
        let dx = x - j.baseX;
        let dy = y - j.baseY;
        const maxDist = j.baseR - 10;
        const d = Math.hypot(dx, dy);
        if (d > maxDist) {
          dx = (dx / d) * maxDist;
          dy = (dy / d) * maxDist;
        }
        j.stickX = j.baseX + dx;
        j.stickY = j.baseY + dy;
        j.dirX = dx / maxDist;
        j.dirY = dy / maxDist;
      }
    } else {
      if (j.touchId === touchId || touchId === null) {
        j.active = false;
        j.stickX = j.baseX;
        j.stickY = j.baseY;
        j.dirX = 0;
        j.dirY = 0;
        j.touchId = null;
      }
    }
  });
}

// Événements Tactiles & Souris
canvas.addEventListener("mousedown", (e) => handlePointer(e.clientX, e.clientY, true));
window.addEventListener("mousemove", (e) => { if (joy1.active || joy2.active) handlePointer(e.clientX, e.clientY, true); });
window.addEventListener("mouseup", () => handlePointer(0, 0, false));

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (let t of e.changedTouches) handlePointer(t.clientX, t.clientY, true, t.identifier);
});
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (let t of e.changedTouches) handlePointer(t.clientX, t.clientY, true, t.identifier);
});
canvas.addEventListener("touchend", (e) => {
  for (let t of e.changedTouches) handlePointer(0, 0, false, t.identifier);
});

// ==========================================
// INTELLIGENCE ARTIFICIELLE (MODE 1J)
// ==========================================
let noiseTimer = 0, p2NoiseX = 0, p2NoiseY = 0;
function updatePlayerNoise() {
  noiseTimer++;
  if (noiseTimer > 15) {
    noiseTimer = 0;
    p2NoiseX = (Math.random() - 0.5) * 12;
    p2NoiseY = (Math.random() - 0.5) * 12;
  }
}

function updateAI() {
  let targetX, targetY;
  if (ball.x >= canvas.width / 2) {
    targetX = ball.x + p2NoiseX * 2;
    targetY = ball.y + p2NoiseY * 2;
  } else {
    targetX = canvas.width - 120 + p2NoiseX;
    targetY = ball.y + p2NoiseY;
  }

  let dx = targetX - p2.x, dy = targetY - p2.y, dist = Math.hypot(dx, dy);
  if (dist > 3) {
    let currentSpeed = Math.min(p2.speed, dist * 0.15);
    p2.x += (dx / dist) * currentSpeed;
    p2.y += (dy / dist) * currentSpeed;
  }

  p2.x = Math.max(canvas.width / 2 + p2.radius + 4, Math.min(canvas.width - p2.radius, p2.x));
  p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y));

  let ballDist = Math.hypot(ball.x - p2.x, ball.y - p2.y);
  if (ballDist < p2.radius + ball.radius + 3) {
    const targetGoalY = goalY + goalHeight / 2 + (p2NoiseY * 4);
    let angle = Math.atan2(targetGoalY - ball.y, 0 - ball.x);
    let kickPower = 8 + (Math.random() - 0.5) * 4;
    ball.vx = Math.cos(angle) * kickPower;
    ball.vy = Math.sin(angle) * kickPower;
    playKickSound();
  }
}

// ==========================================
// DÉROULEMENT DU MATCH
// ==========================================
function startMatchSequence() {
  initAudio();

  if (gameModeSelect) currentGameMode = gameModeSelect.value;

  if (mainMenu) mainMenu.classList.add("hidden");
  if (settingsModal) settingsModal.classList.add("hidden");
  if (manualModal) manualModal.classList.add("hidden");

  totalTime = parseInt(gameDurationSelect ? gameDurationSelect.value : 180);
  timeLeft = Math.floor(totalTime / 2);
  score1 = 0; score2 = 0; round = 1;
  isGameOver = false; isPaused = false;
  if (score1El) score1El.textContent = "0";
  if (score2El) score2El.textContent = "0";

  resetPositions(1);
  startCountdown(() => { startTimer(); });
}

function startCountdown(callback) {
  isCountdown = true;
  countdownValue = 3;
  if (statusEl) statusEl.textContent = "PRÊT ?";
  playBeepSound(false);

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdownValue--;
    if (countdownValue > 0) {
      playBeepSound(false);
    } else if (countdownValue === 0) {
      playBeepSound(true);
      if (statusEl) statusEl.textContent = "GO !";
    } else {
      clearInterval(countdownInterval);
      isCountdown = false;
      if (statusEl) statusEl.textContent = `ROUND ${round}`;
      if (callback) callback();
    }
  }, 1000);
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPaused && !isGameOver && !isCountdown) {
      timeLeft--;
      let mins = Math.floor(timeLeft / 60);
      let secs = timeLeft % 60;
      if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      if (timeLeft <= 0) {
        if (round === 1) startRound2();
        else endGame();
      }
    }
  }, 1000);
}

function startRound2() {
  round = 2;
  timeLeft = Math.floor(totalTime / 2);
  resetPositions(2);
  startCountdown();
}

function endGame() {
  isGameOver = true;
  clearInterval(timerInterval);
  playGoalSound();
  alert(`FIN DU MATCH !\nScore Final : J1 ${score1} - ${score2} J2`);
}

function resetPositions(starter = 1) {
  p1.x = 120; p1.y = canvas.height / 2;
  p2.x = canvas.width - 120; p2.y = canvas.height / 2;
  ball.vx = 0; ball.vy = 0;
  ball.x = starter === 1 ? 420 : 380;
  ball.y = canvas.height / 2;
}

// ==========================================
// BOUCLE DE MISE À JOUR ET DE RENDU
// ==========================================
function update() {
  if (isPaused || isGameOver || isCountdown) return;

  updatePlayerNoise();

  // Déplacement J1 (Tactile / Souris / Clavier)
  let move1X = joy1.dirX * p1.speed;
  let move1Y = joy1.dirY * p1.speed;
  if (keys["KeyW"] || keys["KeyZ"]) move1Y = -p1.speed;
  if (keys["KeyS"]) move1Y = p1.speed;
  if (keys["KeyA"] || keys["KeyQ"]) move1X = -p1.speed;
  if (keys["KeyD"]) move1X = p1.speed;

  p1.x = Math.max(p1.radius, Math.min(canvas.width / 2 - p1.radius, p1.x + move1X));
  p1.y = Math.max(p1.radius, Math.min(canvas.height - p1.radius, p1.y + move1Y));

  // Déplacement J2 / IA
  if (currentGameMode === "LOCAL_2P") {
    let move2X = joy2.dirX * p2.speed;
    let move2Y = joy2.dirY * p2.speed;
    if (keys["ArrowUp"]) move2Y = -p2.speed;
    if (keys["ArrowDown"]) move2Y = p2.speed;
    if (keys["ArrowLeft"]) move2X = -p2.speed;
    if (keys["ArrowRight"]) move2X = p2.speed;

    p2.x = Math.max(canvas.width / 2 + p2.radius, Math.min(canvas.width - p2.radius, p2.x + move2X));
    p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y + move2Y));
  } else {
    updateAI();
  }

  pushBall(p1);
  pushBall(p2);

  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= ball.friction; ball.vy *= ball.friction;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) ball.vy *= -1;

  if (ball.y < goalY || ball.y > goalY + goalHeight) {
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.vx *= -1;
  }

  if (ball.x < 0) {
    score2++; 
    if (score2El) score2El.textContent = score2;
    playGoalSound(); resetPositions(2); startCountdown();
  } else if (ball.x > canvas.width) {
    score1++; 
    if (score1El) score1El.textContent = score1;
    playGoalSound(); resetPositions(1); startCountdown();
  }
}

function pushBall(p) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius) {
    let angle = Math.atan2(dy, dx);
    let overlap = (p.radius + ball.radius) - dist;
    ball.x += Math.cos(angle) * overlap;
    ball.y += Math.sin(angle) * overlap;
    ball.vx = Math.cos(angle) * 7;
    ball.vy = Math.sin(angle) * 7;
    playKickSound();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Terrain
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2); ctx.stroke();

  // Buts
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, goalY, 8, goalHeight);
  ctx.fillRect(canvas.width - 8, goalY, 8, goalHeight);

  // Joueurs
  [p1, p2].forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
    ctx.fillText(p.num, p.x - 6, p.y + 4);
  });

  // Ballon
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();

  // Joysticks
  const drawJoystick = (j, color) => {
    ctx.beginPath(); ctx.arc(j.baseX, j.baseY, j.baseR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 3; ctx.stroke();

    ctx.beginPath(); ctx.arc(j.stickX, j.stickY, j.stickR, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
  };

  drawJoystick(joy1, "#00d2ff");
  if (currentGameMode === "LOCAL_2P") {
    drawJoystick(joy2, "#ff416c");
  }

  // Compte à rebours
  if (isCountdown) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 80px system-ui";
    ctx.fillStyle = "#ffeb3b";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(countdownValue > 0 ? countdownValue : "GO !", canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

// ==========================================
// ÉVÉNEMENTS ÉCRANS & BOUTONS
// ==========================================
const btnStart = document.getElementById("btnStartGame");
if (btnStart) btnStart.addEventListener("click", startMatchSequence);

const btnOpenSet = document.getElementById("btnOpenSettings");
if (btnOpenSet) btnOpenSet.addEventListener("click", () => settingsModal.classList.remove("hidden"));

const btnCloseSet = document.getElementById("btnCloseSettings");
if (btnCloseSet) btnCloseSet.addEventListener("click", () => {
  if (gameModeSelect) currentGameMode = gameModeSelect.value;
  settingsModal.classList.add("hidden");
});

const btnOpenMan = document.getElementById("btnOpenManual");
if (btnOpenMan) btnOpenMan.addEventListener("click", () => manualModal.classList.remove("hidden"));

const btnCloseMan = document.getElementById("btnCloseManual");
if (btnCloseMan) btnCloseMan.addEventListener("click", () => manualModal.classList.add("hidden"));

const btnHome = document.getElementById("btnHome");
if (btnHome) btnHome.addEventListener("click", () => {
  clearInterval(timerInterval);
  mainMenu.classList.remove("hidden");
});

if (gameModeSelect) {
  gameModeSelect.addEventListener("change", (e) => {
    currentGameMode = e.target.value;
  });
}

const btnPause = document.getElementById("btnPause");
if (btnPause) btnPause.addEventListener("click", () => {
  if (isGameOver || isCountdown) return;
  isPaused = !isPaused;
  if (statusEl) statusEl.textContent = isPaused ? "PAUSE" : `ROUND ${round}`;
});

const btnReset = document.getElementById("btnReset");
if (btnReset) btnReset.addEventListener("click", startMatchSequence);

// Démarrage de la boucle de jeu
gameLoop();
