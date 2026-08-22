const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("game-status");
const netStatus = document.getElementById("networkStatus");

// Écrans et Modaux
const mainMenu = document.getElementById("main-menu");
const settingsModal = document.getElementById("settings-modal");
const manualModal = document.getElementById("manual-modal");
const onlineControls = document.getElementById("online-controls");

const gameModeSelect = document.getElementById("gameModeSelect");
const gameDurationSelect = document.getElementById("gameDuration");

let currentGameMode = "AI"; 
let score1 = 0, score2 = 0, round = 1;
let totalTime = 180, timeLeft = 90;
let isPaused = false, isGameOver = false;
let isCountdown = false, countdownValue = 3;
let timerInterval = null, musicInterval = null, countdownInterval = null;
let musicEnabled = true;

// Entrées Joysticks
const joy1Dir = { x: 0, y: 0 };
const joy2Dir = { x: 0, y: 0 };
const keys = {};

// Claviers (support PC pour tests)
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

// AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, duration, type = "sine") {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + duration);
}

function playKickSound() { playTone(150, 0.1, "triangle"); }
function playBeepSound(high = false) { playTone(high ? 800 : 400, 0.2, "sine"); }
function playGoalSound() { playTone(300, 0.5, "sawtooth"); }

// OBGETS DU JEU
const p1 = { x: 100, y: 250, radius: 18, color: "#00d2ff", speed: 5, num: "J1" };
const p2 = { x: 700, y: 250, radius: 18, color: "#ff416c", speed: 5, num: "J2" };
const ball = { x: 400, y: 250, radius: 10, color: "#ffffff", vx: 0, vy: 0, friction: 0.98 };

const goalHeight = 200;
const goalY = (canvas.height - goalHeight) / 2;

// --- GESTION DES JOYSTICKS ---
function setupJoystick(zoneId, stickId, targetDir) {
  const zone = document.getElementById(zoneId);
  const stick = document.getElementById(stickId);
  let touchId = null;
  let baseRect = null;

  zone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (touchId === null) {
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      baseRect = zone.getBoundingClientRect();
      updateStick(touch);
    }
  });

  zone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        updateStick(e.changedTouches[i]);
        break;
      }
    }
  });

  const resetStick = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touchId = null;
        stick.style.transform = `translate(0px, 0px)`;
        targetDir.x = 0; targetDir.y = 0;
        break;
      }
    }
  };

  zone.addEventListener("touchend", resetStick);
  zone.addEventListener("touchcancel", resetStick);

  function updateStick(touch) {
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const maxDist = 40;
    const dist = Math.hypot(dx, dy);

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    targetDir.x = dx / maxDist;
    targetDir.y = dy / maxDist;
  }
}

setupJoystick("joystick-left-zone", "joystick-left-stick", joy1Dir);
setupJoystick("joystick-right-zone", "joystick-right-stick", joy2Dir);

// --- MULTIJOUEUR PEERJS CORRIGÉ ---
let peer = null, conn = null, isHost = true, myPlayerId = 1;

document.getElementById("btnCreateRoom").addEventListener("click", () => {
  const roomId = Math.floor(1000 + Math.random() * 9000).toString();
  peer = new Peer(`foot-game-${roomId}`);
  netStatus.textContent = "Création du salon...";
  peer.on('open', () => {
    netStatus.textContent = `🟢 Salon Créé ! CODE : ${roomId}`;
    isHost = true; myPlayerId = 1;
  });
  peer.on('connection', (c) => {
    conn = c; setupNetworkEvents();
    netStatus.textContent = `⚡ Joueur 2 Connecté ! Prêt à jouer.`;
  });
});

document.getElementById("btnJoinRoom").addEventListener("click", () => {
  const roomId = document.getElementById("roomInput").value.trim();
  if (roomId.length !== 4) return alert("Entrez un code à 4 chiffres valide.");
  peer = new Peer();
  netStatus.textContent = "Connexion...";
  peer.on('open', () => {
    conn = peer.connect(`foot-game-${roomId}`);
    isHost = false; myPlayerId = 2;
    setupNetworkEvents();
  });
});

function setupNetworkEvents() {
  conn.on('open', () => {
    netStatus.textContent = `🟢 Connecté au match !`;
    if (isHost) {
      conn.send({ type: 'START_MATCH' });
      startMatchSequence();
    }
  });

  conn.on('data', (data) => {
    if (data.type === 'START_MATCH' && !isHost) {
      startMatchSequence();
    }
    if (data.type === 'STATE_UPDATE' && !isHost) {
      p1.x = data.p1.x; p1.y = data.p1.y;
      p2.x = data.p2.x; p2.y = data.p2.y;
      ball.x = data.ball.x; ball.y = data.ball.y;
      score1 = data.score1; score2 = data.score2;
      score1El.textContent = score1; score2El.textContent = score2;
      isCountdown = data.isCountdown; countdownValue = data.countdownValue;
    }
    if (data.type === 'INPUT_UPDATE' && isHost) {
      joy2Dir.x = data.joy.x;
      joy2Dir.y = data.joy.y;
    }
  });
}

function sendNetworkData() {
  if (!conn || !conn.open) return;
  if (isHost) {
    conn.send({
      type: 'STATE_UPDATE',
      p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y },
      ball: { x: ball.x, y: ball.y },
      score1: score1, score2: score2,
      isCountdown: isCountdown, countdownValue: countdownValue
    });
  } else {
    conn.send({ type: 'INPUT_UPDATE', joy: joy1Dir });
  }
}

// --- LOGIQUE DE L'IA AMÉLIORÉE (ATTAQUE DANS SON CAMP) ---
function updateAI() {
  p2.speed = 5;
  let targetX, targetY;
  const targetGoalY = goalY + goalHeight / 2;

  // L'IA attaque activement dès que le ballon entre dans sa zone
  if (ball.x > canvas.width / 2 && score2 < 3) {
    targetX = ball.x;
    targetY = ball.y;
  } else {
    targetX = canvas.width - 120;
    targetY = canvas.height / 2;
  }

  if (p2.x < targetX) p2.x += p2.speed;
  if (p2.x > targetX) p2.x -= p2.speed;
  if (p2.y < targetY) p2.y += p2.speed;
  if (p2.y > targetY) p2.y -= p2.speed;

  // IA reste STRICTEMENT dans son camp
  p2.x = Math.max(canvas.width / 2 + p2.radius + 5, Math.min(canvas.width - p2.radius, p2.x));
  p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y));

  // Tirs ajustés
  let dx = ball.x - p2.x;
  let dy = ball.y - p2.y;
  let dist = Math.hypot(dx, dy);

  if (dist < p2.radius + ball.radius + 4) {
    let angle = Math.atan2(targetGoalY - ball.y, 0 - ball.x);
    if (Math.random() < 0.70) angle += (Math.random() - 0.5) * 1.2;
    ball.vx = Math.cos(angle) * 11;
    ball.vy = Math.sin(angle) * 11;
    playKickSound();
  }
}

// --- DÉROULEMENT DU MATCH ---
function startMatchSequence() {
  mainMenu.classList.add("hidden");
  settingsModal.classList.add("hidden");
  manualModal.classList.add("hidden");

  totalTime = parseInt(gameDurationSelect.value);
  timeLeft = Math.floor(totalTime / 2);
  score1 = 0; score2 = 0; round = 1;
  isGameOver = false; isPaused = false;
  score1El.textContent = "0"; score2El.textContent = "0";

  resetPositions(1);
  startCountdown(() => { startTimer(); });
}

function startCountdown(callback) {
  isCountdown = true;
  countdownValue = 3;
  statusEl.textContent = "PRÊT ?";
  playBeepSound(false);

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    countdownValue--;
    if (countdownValue > 0) {
      playBeepSound(false);
    } else if (countdownValue === 0) {
      playBeepSound(true);
      statusEl.textContent = "GO !";
    } else {
      clearInterval(countdownInterval);
      isCountdown = false;
      statusEl.textContent = `ROUND ${round}`;
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
      timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
  alert(`FIN DU MATCH !\nScore : J1 ${score1} - ${score2} J2`);
}

function resetPositions(starter = 1) {
  p1.x = 120; p1.y = canvas.height / 2;
  p2.x = canvas.width - 120; p2.y = canvas.height / 2;
  ball.vx = 0; ball.vy = 0;
  ball.x = starter === 1 ? 420 : 380;
  ball.y = canvas.height / 2;
}

// --- BOUCLE PRINCIPALE ---
function update() {
  if (isPaused || isGameOver || isCountdown) return;

  // Déplacement J1 (Joystick 1 + Clavier) - Limité à son camp
  let move1X = joy1Dir.x * p1.speed;
  let move1Y = joy1Dir.y * p1.speed;
  if (keys["KeyW"]) move1Y = -p1.speed;
  if (keys["KeyS"]) move1Y = p1.speed;
  if (keys["KeyA"]) move1X = -p1.speed;
  if (keys["KeyD"]) move1X = p1.speed;

  p1.x = Math.max(p1.radius, Math.min(canvas.width / 2 - p1.radius, p1.x + move1X));
  p1.y = Math.max(p1.radius, Math.min(canvas.height - p1.radius, p1.y + move1Y));

  // Déplacement J2 selon le Mode
  if (currentGameMode === "LOCAL_2P") {
    // Mode 2 joueurs même écran
    let move2X = joy2Dir.x * p2.speed;
    let move2Y = joy2Dir.y * p2.speed;
    if (keys["ArrowUp"]) move2Y = -p2.speed;
    if (keys["ArrowDown"]) move2Y = p2.speed;
    if (keys["ArrowLeft"]) move2X = -p2.speed;
    if (keys["ArrowRight"]) move2X = p2.speed;

    p2.x = Math.max(canvas.width / 2 + p2.radius, Math.min(canvas.width - p2.radius, p2.x + move2X));
    p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y + move2Y));
  } else if (currentGameMode === "ONLINE" && conn && conn.open) {
    if (isHost) {
      let move2X = joy2Dir.x * p2.speed;
      let move2Y = joy2Dir.y * p2.speed;
      p2.x = Math.max(canvas.width / 2 + p2.radius, Math.min(canvas.width - p2.radius, p2.x + move2X));
      p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y + move2Y));
    }
  } else if (currentGameMode === "AI") {
    updateAI();
  }

  pushBall(p1);
  pushBall(p2);

  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= ball.friction; ball.vy *= ball.friction;

  // Rebond haut/bas
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) ball.vy *= -1;

  // Rebond poteaux
  if (ball.y < goalY || ball.y > goalY + goalHeight) {
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.vx *= -1;
  }

  // Buts
  if (ball.x < 0) {
    if (score2 < 3 || currentGameMode !== "AI") {
      score2++; score2El.textContent = score2;
      playGoalSound(); resetPositions(2); startCountdown();
    } else {
      ball.vx = 10; ball.x = 15;
    }
  } else if (ball.x > canvas.width) {
    score1++; score1El.textContent = score1;
    playGoalSound(); resetPositions(1); startCountdown();
  }

  if (currentGameMode === "ONLINE") sendNetworkData();
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

  // Balle
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();

  // Compte à rebours visuel
  if (isCountdown) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 80px system-ui";
    ctx.fillStyle = "#ffeb3b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(countdownValue > 0 ? countdownValue : "GO !", canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

// --- ÉVÉNEMENTS INTERFACE ---
document.getElementById("btnStartGame").addEventListener("click", () => {
  if (currentGameMode === "ONLINE" && (!conn || !conn.open)) {
    alert("Veuillez d'abord vous connecter à un autre joueur dans les paramètres !");
    return;
  }
  startMatchSequence();
});

document.getElementById("btnOpenSettings").addEventListener("click", () => settingsModal.classList.remove("hidden"));
document.getElementById("btnCloseSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.getElementById("btnOpenManual").addEventListener("click", () => manualModal.classList.remove("hidden"));
document.getElementById("btnCloseManual").addEventListener("click", () => manualModal.classList.add("hidden"));

document.getElementById("btnHome").addEventListener("click", () => {
  clearInterval(timerInterval);
  mainMenu.classList.remove("hidden");
});

gameModeSelect.addEventListener("change", (e) => {
  currentGameMode = e.target.value;
  if (currentGameMode === "ONLINE") onlineControls.classList.remove("hidden");
  else onlineControls.classList.add("hidden");
});

document.getElementById("btnPause").addEventListener("click", () => {
  if (isGameOver || isCountdown) return;
  isPaused = !isPaused;
  statusEl.textContent = isPaused ? "PAUSE" : `ROUND ${round}`;
});

document.getElementById("btnReset").addEventListener("click", () => startMatchSequence());

gameLoop();
