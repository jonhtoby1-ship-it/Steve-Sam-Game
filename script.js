const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("game-status");
const netStatus = document.getElementById("networkStatus");

const btnPause = document.getElementById("btnPause");
const btnReset = document.getElementById("btnReset");
const btnMusic = document.getElementById("btnMusic");

const btnCreateRoom = document.getElementById("btnCreateRoom");
const btnJoinRoom = document.getElementById("btnJoinRoom");
const roomInput = document.getElementById("roomInput");

const gameDurationSelect = document.getElementById("gameDuration");

let score1 = 0, score2 = 0, round = 1;
let totalTime = 180, timeLeft = 90;
let isPaused = false, isGameOver = false;
let isCountdown = false, countdownValue = 3;
let timerInterval = null, musicInterval = null, countdownInterval = null;
let musicEnabled = true;

const keys = {};

// --- CODE SECRET DÉVELOPPEUR INVISIBLE ---
let devCodeSequence = [];
const SECRET_CODE = ["ArrowUp", "ArrowUp", "ArrowDown"];

window.addEventListener("keydown", (e) => {
  devCodeSequence.push(e.code);
  if (devCodeSequence.length > SECRET_CODE.length) devCodeSequence.shift();
  if (JSON.stringify(devCodeSequence) === JSON.stringify(SECRET_CODE)) {
    triggerDevGoal();
    devCodeSequence = [];
  }
});

function triggerDevGoal() {
  if (myPlayerId === 1) {
    ball.x = canvas.width - 15;
    ball.y = canvas.height / 2;
    ball.vx = 28;
  } else {
    ball.x = 15;
    ball.y = canvas.height / 2;
    ball.vx = -28;
  }
}

// --- AUDIO ---
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

function playGoalSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const bufferSize = audioCtx.sampleRate * 1.2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 700;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
  whiteNoise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  whiteNoise.start();
}

const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
let noteIndex = 0;
function startBackgroundMusic() {
  if (musicInterval) clearInterval(musicInterval);
  musicInterval = setInterval(() => {
    if (!musicEnabled || isPaused || isGameOver || isCountdown) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(notes[noteIndex], audioCtx.currentTime);
    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    noteIndex = (noteIndex + 1) % notes.length;
  }, 300);
}

// --- MULTIJOUEUR PEERJS ---
let peer = null, conn = null, isHost = true, myPlayerId = 1;

if (btnCreateRoom) {
  btnCreateRoom.addEventListener("click", () => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(`foot-game-${roomId}`);
    netStatus.textContent = "Création du salon...";
    peer.on('open', () => {
      netStatus.textContent = `🟢 Salon Créé ! CODE: ${roomId}`;
      isHost = true; myPlayerId = 1;
    });
    peer.on('connection', (c) => {
      conn = c; setupNetworkEvents();
      netStatus.textContent = `⚡ Joueur 2 Connecté !`;
    });
  });
}

if (btnJoinRoom) {
  btnJoinRoom.addEventListener("click", () => {
    const roomId = roomInput.value.trim();
    if (roomId.length !== 4) return alert("Entrez un code à 4 chiffres valide.");
    peer = new Peer();
    netStatus.textContent = "Connexion...";
    peer.on('open', () => {
      conn = peer.connect(`foot-game-${roomId}`);
      isHost = false; myPlayerId = 2;
      setupNetworkEvents();
    });
  });
}

function setupNetworkEvents() {
  conn.on('open', () => netStatus.textContent = `🟢 Connecté au match !`);
  conn.on('data', (data) => {
    if (data.type === 'STATE_UPDATE' && !isHost) {
      p1.x = data.p1.x; p1.y = data.p1.y;
      p2.x = data.p2.x; p2.y = data.p2.y;
      ball.x = data.ball.x; ball.y = data.ball.y;
      score1 = data.score1; score2 = data.score2;
      score1El.textContent = score1; score2El.textContent = score2;
      isCountdown = data.isCountdown; countdownValue = data.countdownValue;
    }
    if (data.type === 'INPUT_UPDATE' && isHost) {
      keys["RemoteUp"] = data.up; keys["RemoteDown"] = data.down;
      keys["RemoteLeft"] = data.left; keys["RemoteRight"] = data.right;
      keys["RemoteShoot"] = data.shoot;
    }
  });
}

function sendNetworkData() {
  if (!conn || !conn.open) return;
  if (isHost) {
    conn.send({
      type: 'STATE_UPDATE',
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      ball: { x: ball.x, y: ball.y },
      score1: score1, score2: score2,
      isCountdown: isCountdown, countdownValue: countdownValue
    });
  } else {
    conn.send({
      type: 'INPUT_UPDATE',
      up: keys["ArrowUp"] || keys["KeyW"], down: keys["ArrowDown"] || keys["KeyS"],
      left: keys["ArrowLeft"] || keys["KeyA"], right: keys["ArrowRight"] || keys["KeyD"],
      shoot: keys["Space"]
    });
  }
}

// --- CONTRÔLES ---
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

function bindBtn(id, keyCode) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("touchstart", (e) => { e.preventDefault(); keys[keyCode] = true; });
  el.addEventListener("touchend", (e) => { e.preventDefault(); keys[keyCode] = false; });
  el.addEventListener("mousedown", () => keys[keyCode] = true);
  el.addEventListener("mouseup", () => keys[keyCode] = false);
}

bindBtn("btnUp", "ArrowUp"); bindBtn("btnDown", "ArrowDown");
bindBtn("btnLeft", "ArrowLeft"); bindBtn("btnRight", "ArrowRight");
bindBtn("btnShoot", "Space");

// --- MOTEUR DE JEU ---
const p1 = { x: 100, y: 250, radius: 18, color: "#00d2ff", speed: 5, num: "J1" };
const p2 = { x: 700, y: 250, radius: 18, color: "#ff416c", speed: 5, num: "J2" };
const ball = { x: 400, y: 250, radius: 10, color: "#ffffff", vx: 0, vy: 0, friction: 0.98 };

const goalHeight = 200;
const goalY = (canvas.height - goalHeight) / 2;

// --- IA NATURELLE ---
function updateAI() {
  p2.speed = 5; // Vitesse identique au joueur

  let targetX, targetY;
  const targetGoalX = 0;
  const targetGoalY = goalY + goalHeight / 2;

  // L'IA ne joue que si elle a moins de 3 buts
  if (ball.x > canvas.width / 2 && score2 < 3) {
    targetX = ball.x;
    targetY = ball.y;
  } else {
    targetX = canvas.width - 150;
    targetY = canvas.height / 2;
  }

  if (p2.x < targetX) p2.x += p2.speed;
  if (p2.x > targetX) p2.x -= p2.speed;
  if (p2.y < targetY) p2.y += p2.speed;
  if (p2.y > targetY) p2.y -= p2.speed;

  p2.x = Math.max(canvas.width / 2 + p2.radius + 5, Math.min(canvas.width - p2.radius, p2.x));
  p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y));

  let dx = ball.x - p2.x;
  let dy = ball.y - p2.y;
  let dist = Math.hypot(dx, dy);

  if (dist < p2.radius + ball.radius + 6 && Math.random() > 0.3) { 
    let angle = Math.atan2(targetGoalY - ball.y, targetGoalX - ball.x);
    ball.vx = Math.cos(angle) * 11; 
    ball.vy = Math.sin(angle) * 11;
    playKickSound();
  }
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
  let reward = "";
  if (score1 > score2) reward = "🥇 RÉCOMPENSE : COUPE D'OR DES CHAMPIONS ! 🏆";
  else if (score2 > score1) reward = "🥉 RÉCOMPENSE : MÉDAILLE DE BRONZE !";
  else reward = "🥈 RÉCOMPENSE : MÉDAILLE D'ARGENT (Match Nul) !";

  playGoalSound();
  alert(`FIN DU MATCH !\n\nScore : Vous ${score1} - ${score2} J2\n\n${reward}`);
}

function resetPositions(starter = 1) {
  p1.x = 120; p1.y = canvas.height / 2;
  p2.x = canvas.width - 120; p2.y = canvas.height / 2;

  ball.vx = 0; ball.vy = 0;
  ball.x = starter === 1 ? 420 : 380;
  ball.y = canvas.height / 2;
}

function resetGame() {
  if (gameDurationSelect) totalTime = parseInt(gameDurationSelect.value);
  timeLeft = Math.floor(totalTime / 2);
  score1 = 0; score2 = 0; round = 1;
  isGameOver = false; isPaused = false;
  score1El.textContent = "0"; score2El.textContent = "0";

  resetPositions(1);
  startCountdown(() => { startTimer(); });
  startBackgroundMusic();
}

function update() {
  if (isPaused || isGameOver || isCountdown) return;

  if ((keys["ArrowUp"] || keys["KeyW"]) && p1.y - p1.radius > 0) p1.y -= p1.speed;
  if ((keys["ArrowDown"] || keys["KeyS"]) && p1.y + p1.radius < canvas.height) p1.y += p1.speed;
  if ((keys["ArrowLeft"] || keys["KeyA"]) && p1.x - p1.radius > 0) p1.x -= p1.speed;
  if ((keys["ArrowRight"] || keys["KeyD"]) && p1.x + p1.radius < canvas.width / 2 - p1.radius) p1.x += p1.speed;

  handleAction(p1, "Space");

  if (conn && conn.open && !isHost) {
    if (keys["RemoteUp"] && p2.y - p2.radius > 0) p2.y -= p2.speed;
    if (keys["RemoteDown"] && p2.y + p2.radius < canvas.height) p2.y += p2.speed;
    if (keys["RemoteLeft"] && p2.x - p2.radius > canvas.width / 2 + p2.radius) p2.x -= p2.speed;
    if (keys["RemoteRight"] && p2.x + p2.radius < canvas.width) p2.x += p2.speed;
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

  // LOGIQUE DE BUTS AVEC PLAFOND DE 3 POUR IA
  if (ball.x < 0) {
    if (score2 < 3) {
      score2++; score2El.textContent = score2;
      playGoalSound(); resetPositions(2); startCountdown();
    } else {
      ball.vx *= -1; ball.x = 10; // Le but ne compte plus
    }
  } else if (ball.x > canvas.width) {
    score1++; score1El.textContent = score1;
    playGoalSound(); resetPositions(1); startCountdown();
  }

  sendNetworkData();
}

function handleAction(p, shootKey) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius + 12) {
    if (keys[shootKey]) {
      let angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * 15;
      ball.vy = Math.sin(angle) * 15;
      playKickSound();
    }
  }
}

function pushBall(p) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius) {
    let angle = Math.atan2(dy, dx);
    let overlap = (p.radius + ball.radius) - dist;
    ball.x += Math.cos(angle) * overlap;
    ball.y += Math.sin(angle) * overlap;
    ball.vx = Math.cos(angle) * 4;
    ball.vy = Math.sin(angle) * 4;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, goalY, 8, goalHeight);
  ctx.fillRect(canvas.width - 8, goalY, 8, goalHeight);

  [p1, p2].forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
    ctx.fillText(p.num, p.x - 6, p.y + 4);
  });

  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();

  if (isCountdown) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "bold 80px system-ui";
    ctx.fillStyle = "#ffeb3b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let text = countdownValue > 0 ? countdownValue : "GO !";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

btnPause.addEventListener("click", () => {
  if (isGameOver || isCountdown) return;
  isPaused = !isPaused;
  btnPause.textContent = isPaused ? "▶️ Reprendre" : "⏸️ Pause";
  statusEl.textContent = isPaused ? "PAUSE" : `ROUND ${round}`;
});

btnReset.addEventListener("click", resetGame);
if (gameDurationSelect) gameDurationSelect.addEventListener("change", resetGame);

btnMusic.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  btnMusic.textContent = musicEnabled ? "🎵 Musique: ON" : "🔇 Musique: OFF";
});

resetGame();
gameLoop();
