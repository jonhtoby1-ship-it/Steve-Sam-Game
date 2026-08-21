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

const teamFormatSelect = document.getElementById("teamFormat");
const humanCountSelect = document.getElementById("humanCount");
const gameDurationSelect = document.getElementById("gameDuration");

let score1 = 0, score2 = 0, round = 1;
let totalTime = 180, timeLeft = 90;
let isPaused = false, isGameOver = false;
let timerInterval = null, musicInterval = null;
let musicEnabled = true;

const keys = {};

// --- CODE SECRET DÉVELOPPEUR INVISIBLE ---
// Enchaînement tactile/clavier : Haut -> Haut -> Bas
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

// --- AUDIO & MUSIQUE 8-BIT ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playKickSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.12);
}

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
    if (!musicEnabled || isPaused || isGameOver) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(notes[noteIndex], audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    noteIndex = (noteIndex + 1) % notes.length;
  }, 300);
}

// --- MULTIJOUEUR RÉSEAU (PEERJS / WEBRTC) ---
let peer = null;
let conn = null;
let isHost = true;
let myPlayerId = 1;

btnCreateRoom.addEventListener("click", () => {
  const roomId = Math.floor(1000 + Math.random() * 9000).toString();
  peer = new Peer(`foot-game-${roomId}`);
  
  netStatus.textContent = "Création du salon...";

  peer.on('open', () => {
    netStatus.textContent = `🟢 Salon Créé ! CODE: ${roomId} (En attente...)`;
    isHost = true;
    myPlayerId = 1;
  });

  peer.on('connection', (c) => {
    conn = c;
    setupNetworkEvents();
    netStatus.textContent = `⚡ Joueur 2 Connecté !`;
  });
});

btnJoinRoom.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  if (roomId.length !== 4) return alert("Entrez un code à 4 chiffres valide.");

  peer = new Peer();
  netStatus.textContent = "Connexion...";

  peer.on('open', () => {
    conn = peer.connect(`foot-game-${roomId}`);
    isHost = false;
    myPlayerId = 2;
    setupNetworkEvents();
  });
});

function setupNetworkEvents() {
  conn.on('open', () => {
    netStatus.textContent = `🟢 Connecté au match en réseau !`;
  });

  conn.on('data', (data) => {
    if (data.type === 'STATE_UPDATE' && !isHost) {
      players[0].x = data.p1.x; players[0].y = data.p1.y;
      players[1].x = data.p2.x; players[1].y = data.p2.y;
      ball.x = data.ball.x; ball.y = data.ball.y;
      score1 = data.score1; score2 = data.score2;
      score1El.textContent = score1; score2El.textContent = score2;
    }
    if (data.type === 'INPUT_UPDATE' && isHost) {
      keys["RemoteUp"] = data.up;
      keys["RemoteDown"] = data.down;
      keys["RemoteLeft"] = data.left;
      keys["RemoteRight"] = data.right;
      keys["RemoteShoot"] = data.shoot;
    }
  });
}

function sendNetworkData() {
  if (!conn || !conn.open) return;

  if (isHost) {
    conn.send({
      type: 'STATE_UPDATE',
      p1: { x: players[0].x, y: players[0].y },
      p2: { x: players[1].x, y: players[1].y },
      ball: { x: ball.x, y: ball.y },
      score1: score1, score2: score2
    });
  } else {
    conn.send({
      type: 'INPUT_UPDATE',
      up: keys["ArrowUp"] || keys["KeyW"],
      down: keys["ArrowDown"] || keys["KeyS"],
      left: keys["ArrowLeft"] || keys["KeyA"],
      right: keys["ArrowRight"] || keys["KeyD"],
      shoot: keys["Space"] || keys["KeyF"]
    });
  }
}

// --- CONTRÔLES TACTILES ET CLAVIER ---
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

function bindBtn(id, keyCode) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("touchstart", (e) => { e.preventDefault(); keys[keyCode] = true; registerDevTouch(keyCode); });
  el.addEventListener("touchend", (e) => { e.preventDefault(); keys[keyCode] = false; });
  el.addEventListener("mousedown", () => { keys[keyCode] = true; registerDevTouch(keyCode); });
  el.addEventListener("mouseup", () => keys[keyCode] = false);
}

function registerDevTouch(keyCode) {
  devCodeSequence.push(keyCode);
  if (devCodeSequence.length > SECRET_CODE.length) devCodeSequence.shift();
  if (JSON.stringify(devCodeSequence) === JSON.stringify(SECRET_CODE)) {
    triggerDevGoal();
    devCodeSequence = [];
  }
}

bindBtn("btnUp", "ArrowUp"); bindBtn("btnDown", "ArrowDown");
bindBtn("btnLeft", "ArrowLeft"); bindBtn("btnRight", "ArrowRight");
bindBtn("btnShoot", "Space"); bindBtn("btnPass", "KeyP");

// --- MOTEUR DE JEU ET IA HUMANISÉE ---
let players = [];
const ball = { x: 400, y: 250, radius: 10, color: "#ffffff", vx: 0, vy: 0, friction: 0.98 };
const goalHeight = 200;
const goalY = (canvas.height - goalHeight) / 2;

function initMatch() {
  const format = parseInt(teamFormatSelect.value);
  const humanCount = parseInt(humanCountSelect.value);
  
  players = [];
  let currentHuman = 1;

  for (let team = 1; team <= 2; team++) {
    for (let i = 0; i < format; i++) {
      const isHuman = currentHuman <= humanCount;
      const teamColor = team === 1 ? "#00d2ff" : "#ff416c";
      const startX = team === 1 ? 150 + (i * 40) : 650 - (i * 40);
      const startY = 150 + (i * 80);

      players.push({
        id: players.length + 1,
        team: team,
        isHuman: isHuman,
        humanId: isHuman ? currentHuman : null,
        x: startX, y: startY,
        radius: 18,
        color: teamColor,
        speed: isHuman ? 4.8 : 3.8,
        num: isHuman ? `J${currentHuman}` : "IA",
        errorTimer: 0
      });

      if (isHuman) currentHuman++;
    }
  }
}

function updateAI(p) {
  p.errorTimer = (p.errorTimer || 0) + 1;
  let errorOffset = Math.sin(p.errorTimer * 0.05) * 20;

  let targetX = ball.x + errorOffset;
  let targetY = ball.y + errorOffset;

  if ((p.team === 1 && ball.x < canvas.width * 0.75) || (p.team === 2 && ball.x > canvas.width * 0.25)) {
    if (p.x < targetX) p.x += p.speed * 0.8;
    if (p.x > targetX) p.x -= p.speed * 0.8;
    if (p.y < targetY) p.y += p.speed * 0.8;
    if (p.y > targetY) p.y -= p.speed * 0.8;
  }

  let dx = ball.x - p.x, dy = ball.y - p.y;
  if (Math.hypot(dx, dy) < p.radius + ball.radius + 10 && Math.random() < 0.08) {
    let targetGoalX = p.team === 1 ? canvas.width : 0;
    let shootAngle = Math.atan2(canvas.height / 2 - ball.y, targetGoalX - ball.x);
    ball.vx = Math.cos(shootAngle) * 13;
    ball.vy = Math.sin(shootAngle) * 13;
    playKickSound();
  }
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPaused && !isGameOver) {
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
  round = 2; timeLeft = Math.floor(totalTime / 2);
  statusEl.textContent = "ROUND 2"; resetPositions(2);
}

function endGame() {
  isGameOver = true; clearInterval(timerInterval);
  let reward = "";
  if (score1 > score2) reward = "🥇 RÉCOMPENSE : COUPE D'OR DES CHAMPIONS ! 🏆";
  else if (score2 > score1) reward = "🥉 RÉCOMPENSE : MÉDAILLE DE BRONZE !";
  else reward = "🥈 RÉCOMPENSE : MÉDAILLE D'ARGENT (Match Nul) !";

  playGoalSound();
  alert(`FIN DU MATCH !\n\nScore : Bleus ${score1} - ${score2} Rouges\n\n${reward}`);
}

function resetPositions(starter = 1) {
  const format = parseInt(teamFormatSelect.value);
  let index1 = 0, index2 = 0;
  
  players.forEach(p => {
    if (p.team === 1) {
      p.x = 150; p.y = 120 + (index1 * (260 / Math.max(1, format - 1)));
      index1++;
    } else {
      p.x = 650; p.y = 120 + (index2 * (260 / Math.max(1, format - 1)));
      index2++;
    }
  });

  ball.vx = 0; ball.vy = 0;
  ball.x = starter === 1 ? 420 : 380;
  ball.y = canvas.height / 2;
}

function resetGame() {
  totalTime = parseInt(gameDurationSelect.value);
  timeLeft = Math.floor(totalTime / 2);
  score1 = 0; score2 = 0; round = 1;
  isGameOver = false; isPaused = false;
  score1El.textContent = "0"; score2El.textContent = "0";
  statusEl.textContent = "ROUND 1";
  initMatch();
  resetPositions(1);
  startTimer();
  startBackgroundMusic();
}

function update() {
  if (isPaused || isGameOver) return;

  players.forEach(p => {
    if (p.isHuman) {
      if (p.humanId === 1) {
        if ((keys["ArrowUp"] || keys["KeyW"]) && p.y - p.radius > 0) p.y -= p.speed;
        if ((keys["ArrowDown"] || keys["KeyS"]) && p.y + p.radius < canvas.height) p.y += p.speed;
        if ((keys["ArrowLeft"] || keys["KeyA"]) && p.x - p.radius > 0) p.x -= p.speed;
        if ((keys["ArrowRight"] || keys["KeyD"]) && p.x + p.radius < canvas.width) p.x += p.speed;

        handleAction(p, "Space", "KeyP");
      }
    } else {
      updateAI(p);
    }

    pushBall(p);
  });

  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= ball.friction; ball.vy *= ball.friction;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) ball.vy *= -1;
  if (ball.y < goalY || ball.y > goalY + goalHeight) {
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.vx *= -1;
  }

  if (ball.x < 0) { score2++; score2El.textContent = score2; playGoalSound(); resetPositions(2); }
  else if (ball.x > canvas.width) { score1++; score1El.textContent = score1; playGoalSound(); resetPositions(1); }

  sendNetworkData();
}

function handleAction(p, shootKey, passKey) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius + 15) {
    if (keys[shootKey]) {
      let angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * 15; ball.vy = Math.sin(angle) * 15;
      playKickSound();
    }
    if (keys[passKey]) {
      let teammate = players.find(other => other.team === p.team && other.id !== p.id);
      if (teammate) {
        let passAngle = Math.atan2(teammate.y - ball.y, teammate.x - ball.x);
        ball.vx = Math.cos(passAngle) * 11; ball.vy = Math.sin(passAngle) * 11;
        playKickSound();
        keys[passKey] = false;
      }
    }
  }
}

function pushBall(p) {
  let dx = ball.x - p.x, dy = ball.y - p.y, dist = Math.hypot(dx, dy);
  if (dist < p.radius + ball.radius) {
    let angle = Math.atan2(dy, dx);
    let overlap = (p.radius + ball.radius) - dist;
    ball.x += Math.cos(angle) * overlap; ball.y += Math.sin(angle) * overlap;
    ball.vx = Math.cos(angle) * 5; ball.vy = Math.sin(angle) * 5;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, goalY, 8, goalHeight); ctx.fillRect(canvas.width - 8, goalY, 8, goalHeight);

  players.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif";
    ctx.fillText(p.num, p.x - 7, p.y + 4);
  });

  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

btnPause.addEventListener("click", () => {
  if (isGameOver) return;
  isPaused = !isPaused;
  btnPause.textContent = isPaused ? "▶️ Reprendre" : "⏸️ Pause";
  statusEl.textContent = isPaused ? "PAUSE" : `ROUND ${round}`;
});

btnReset.addEventListener("click", resetGame);
teamFormatSelect.addEventListener("change", resetGame);
humanCountSelect.addEventListener("change", resetGame);
gameDurationSelect.addEventListener("change", resetGame);

btnMusic.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  btnMusic.textContent = musicEnabled ? "🎵 Musique: ON" : "🔇 Musique: OFF";
});

resetGame();
gameLoop();
