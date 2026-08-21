const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("game-status");
const btnPause = document.getElementById("btnPause");
const btnReset = document.getElementById("btnReset");

let score1 = 0;
let score2 = 0;
let timeLeft = 90;
let isPaused = false;
let isGameOver = false;
let timerInterval = null;

const keys = {};

// --- MOTEUR AUDIO (Sons du jeu) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Son d'impact / Tir
function playKickSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

// Son de But (Cri de foule généré en synthèse)
function playGoalSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const bufferSize = audioCtx.sampleRate * 1.5; // 1.5 seconde de son
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);
  
  // Générer du bruit blanc modulé (Rumeur de stade)
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 3;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.3); // Monte en puissance
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5); // S'atténue

  whiteNoise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  whiteNoise.start();
}

// --- ÉVÉNEMENT TACTILE / CLAVIER ---
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

function bindTouch(elementId, keyName) {
  const btn = document.getElementById(elementId);
  if (!btn) return;
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); keys[keyName] = true; });
  btn.addEventListener("touchend", (e) => { e.preventDefault(); keys[keyName] = false; });
  btn.addEventListener("mousedown", () => keys[keyName] = true);
  btn.addEventListener("mouseup", () => keys[keyName] = false);
}

bindTouch("btnUp", "ArrowUp");
bindTouch("btnDown", "ArrowDown");
bindTouch("btnLeft", "ArrowLeft");
bindTouch("btnRight", "ArrowRight");
bindTouch("btnShoot", "Space");

// Joueur plus rapide, IA plus lente pour équilibrer
const player1 = { x: 150, y: 250, radius: 20, color: "#00d2ff", speed: 5.5 };
const ai = { x: 650, y: 250, radius: 20, color: "#ff416c", speed: 2.5 }; // IA ralentie
const ball = { x: 400, y: 250, radius: 12, color: "#ffffff", vx: 0, vy: 0, friction: 0.98 };

// Cages de but agrandies (200px au lieu de 160px) pour marquer plus facilement
const goalHeight = 200;
const goalY = (canvas.height - goalHeight) / 2;

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPaused && !isGameOver) {
      timeLeft--;
      let mins = Math.floor(timeLeft / 60);
      let secs = timeLeft % 60;
      timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      if (timeLeft <= 0) endGame();
    }
  }, 1000);
}

function endGame() {
  isGameOver = true;
  clearInterval(timerInterval);
  if (score1 > score2) statusEl.textContent = "🏆 VICTOIRE !";
  else if (score2 > score1) statusEl.textContent = "❌ DÉFAITE !";
  else statusEl.textContent = "🤝 ÉGALITÉ !";
}

function resetPositions() {
  player1.x = 150; player1.y = canvas.height / 2;
  ai.x = 650; ai.y = canvas.height / 2;
  ball.x = canvas.width / 2; ball.y = canvas.height / 2;
  ball.vx = 0; ball.vy = 0;
}

function resetGame() {
  score1 = 0; score2 = 0; timeLeft = 90;
  isGameOver = false; isPaused = false;
  score1El.textContent = "0"; score2El.textContent = "0";
  statusEl.textContent = "EN COURS";
  timerEl.textContent = "01:30";
  resetPositions();
  startTimer();
}

function update() {
  if (isPaused || isGameOver) return;

  // Déplacements Joueur
  if ((keys["ArrowUp"] || keys["KeyW"] || keys["KeyZ"]) && player1.y - player1.radius > 0) player1.y -= player1.speed;
  if ((keys["ArrowDown"] || keys["KeyS"]) && player1.y + player1.radius < canvas.height) player1.y += player1.speed;
  if ((keys["ArrowLeft"] || keys["KeyA"] || keys["KeyQ"]) && player1.x - player1.radius > 0) player1.x -= player1.speed;
  if ((keys["ArrowRight"] || keys["KeyD"]) && player1.x + player1.radius < canvas.width) player1.x += player1.speed;

  // Déplacement IA (Modéré)
  if (ball.x > canvas.width / 3) {
    if (ai.y < ball.y - 5 && ai.y + ai.radius < canvas.height) ai.y += ai.speed;
    if (ai.y > ball.y + 5 && ai.y - ai.radius > 0) ai.y -= ai.speed;
    if (ai.x < ball.x && ai.x < canvas.width - 25) ai.x += ai.speed * 0.7;
    if (ai.x > ball.x && ai.x > canvas.width / 2 + 50) ai.x -= ai.speed * 0.7;
  }

  // Tir de super puissance
  if (keys["Space"]) {
    let dx = ball.x - player1.x, dy = ball.y - player1.y, dist = Math.hypot(dx, dy);
    if (dist < player1.radius + ball.radius + 20) {
      let angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * 16;
      ball.vy = Math.sin(angle) * 16;
      playKickSound(); // Son du tir
    }
  }

  // Physique Balle
  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= ball.friction; ball.vy *= ball.friction;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) ball.vy *= -1;
  if (ball.y < goalY || ball.y > goalY + goalHeight) {
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.vx *= -1;
  }

  pushBall(player1); pushBall(ai);

  // Gestion des buts avec Cris de joie !
  if (ball.x < 0) {
    score2++; score2El.textContent = score2; 
    playGoalSound();
    resetPositions();
  } else if (ball.x > canvas.width) {
    score1++; score1El.textContent = score1; 
    playGoalSound();
    resetPositions();
  }
}

function pushBall(p) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius) {
    let angle = Math.atan2(dy, dx);
    let overlap = (p.radius + ball.radius) - dist;
    ball.x += Math.cos(angle) * overlap; ball.y += Math.sin(angle) * overlap;
    ball.vx = Math.cos(angle) * 6; ball.vy = Math.sin(angle) * 6;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Lignes Terrain
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2); ctx.stroke();

  // Buts (agrandis)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, goalY, 10, goalHeight); ctx.fillRect(canvas.width - 10, goalY, 10, goalHeight);

  // Joueur
  ctx.beginPath(); ctx.arc(player1.x, player1.y, player1.radius, 0, Math.PI * 2);
  ctx.fillStyle = player1.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();

  // IA
  ctx.beginPath(); ctx.arc(ai.x, ai.y, ai.radius, 0, Math.PI * 2);
  ctx.fillStyle = ai.color; ctx.fill(); ctx.stroke();

  // Ballon
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

btnPause.addEventListener("click", () => {
  if (isGameOver) return;
  isPaused = !isPaused;
  btnPause.textContent = isPaused ? "▶️ Reprendre" : "⏸️ Pause";
  statusEl.textContent = isPaused ? "PAUSE" : "EN COURS";
});

btnReset.addEventListener("click", resetGame);

resetGame();
gameLoop();
