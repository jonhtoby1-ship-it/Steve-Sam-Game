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
let isCountdown = false, countdownValue = 3;
let timerInterval = null, musicInterval = null, countdownInterval = null;
let musicEnabled = true;

const keys = {};

// --- CODE SECRET DÉVELOPPEUR INVISIBLE (Haut - Haut - Bas) ---
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

// --- AUDIO & MOTEUR SONORE ---
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

// --- MULTIJOUEUR RÉSEAU (PEERJS) ---
let peer = null, conn = null, isHost = true, myPlayerId = 1;

btnCreateRoom.addEventListener("click", () => {
  const roomId = Math.floor(1000 + Math.random() * 9000).toString();
  peer = new Peer(`foot-game-${roomId}`);
  netStatus.textContent = "Création du salon...";
  peer.on('open', () => {
    netStatus.textContent = `🟢 Salon Créé ! CODE: ${roomId} (En attente...)`;
    isHost = true; myPlayerId = 1;
  });
  peer.on('connection', (c) => {
    conn = c; setupNetworkEvents();
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
    isHost = false; myPlayerId = 2;
    setupNetworkEvents();
  });
});

function setupNetworkEvents() {
  conn.on('open', () => netStatus.textContent = `🟢 Connecté au match !`);
  conn.on('data', (data) => {
    if (data.type === 'STATE_UPDATE' && !isHost) {
      players.forEach((p, i) => { if(data.players[i]) { p.x = data.players[i].x; p.y = data.players[i].y; } });
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
      players: players.map(p => ({ x: p.x, y: p.y })),
      ball: { x: ball.x, y: ball.y },
      score1: score1, score2: score2,
      isCountdown: isCountdown, countdownValue: countdownValue
    });
  } else {
    conn.send({
      type: 'INPUT_UPDATE',
      up: keys["ArrowUp"] || keys["KeyW"], down: keys["ArrowDown"] || keys["KeyS"],
      left: keys["ArrowLeft"] || keys["KeyA"], right: keys["ArrowRight"] || keys["KeyD"],
      shoot: keys["Space"] || keys["KeyF"]
    });
  }
}

// --- CONTRÔLES TACTILES & CLAVIER ---
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
bindBtn("btnShoot", "Space"); bindBtn("btnPass", "KeyP");

// --- MOTEUR DE JEU ET ÉQUIPES ---
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
      const role = (i === 0) ? "DEFENDER" : "ATTACKER";

      players.push({
        id: players.length + 1,
        team: team,
        role: role,
        isHuman: isHuman,
        humanId: isHuman ? currentHuman : null,
        x: 0, y: 0,
        radius: 18,
        color: teamColor,
        speed: 4.5, // Vitesse strictement identique pour IA et Humains
        num: isHuman ? `J${currentHuman}` : `IA${i+1}`,
        passCooldown: 0
      });

      if (isHuman) currentHuman++;
    }
  }
}

// --- INTELLIGENCE ARTIFICIELLE NORMALE ET FLUIDE ---
function updateAI(p) {
  if (p.passCooldown > 0) p.passCooldown--;

  const goalTargetX = p.team === 1 ? canvas.width : 0;
  const distToBall = Math.hypot(ball.x - p.x, ball.y - p.y);

  // Déterminer quel coéquipier est le plus proche du ballon
  let closestTeammate = players
    .filter(other => other.team === p.team)
    .reduce((prev, curr) => {
      let dPrev = Math.hypot(ball.x - prev.x, ball.y - prev.y);
      let dCurr = Math.hypot(ball.x - curr.x, ball.y - curr.y);
      return dCurr < dPrev ? curr : prev;
    });

  const isClosest = (closestTeammate.id === p.id);
  let targetX = p.x, targetY = p.y;

  if (p.role === "DEFENDER") {
    // Le défenseur protège la cage et n'avance que si le ballon entre dans sa zone
    targetX = p.team === 1 ? 80 : canvas.width - 80;
    targetY = Math.max(goalY + 20, Math.min(goalY + goalHeight - 20, ball.y));

    if ((p.team === 1 && ball.x < canvas.width * 0.4) || (p.team === 2 && ball.x > canvas.width * 0.6)) {
      if (isClosest) {
        targetX = ball.x;
        targetY = ball.y;
      }
    }
  } else {
    // Attaquants : le plus proche va au ballon, l'autre se positionne en soutien
    if (isClosest) {
      targetX = ball.x;
      targetY = ball.y;
    } else {
      targetX = p.team === 1 ? ball.x - 80 : ball.x + 80;
      targetY = ball.y + (p.id % 2 === 0 ? 70 : -70);
    }
  }

  // Déplacement direct et fluide vers l'objectif
  let dx = targetX - p.x, dy = targetY - p.y;
  let dist = Math.hypot(dx, dy);
  if (dist > 2) {
    p.x += (dx / dist) * p.speed;
    p.y += (dy / dist) * p.speed;
  }

  // --- COMPORTEMENT AVEC LE BALLON ---
  if (distToBall < p.radius + ball.radius + 6) {
    // Vérifier s'il y a un coéquipier bien placé en avant
    let teammate = players.find(other => 
      other.team === p.team && 
      other.id !== p.id && 
      ((p.team === 1 && other.x > p.x) || (p.team === 2 && other.x < p.x))
    );

    // Passe vers le coéquipier si disponible
    if (teammate && p.passCooldown === 0 && Math.random() < 0.4) {
      let angle = Math.atan2(teammate.y - ball.y, teammate.x - ball.x);
      ball.vx = Math.cos(angle) * 12;
      ball.vy = Math.sin(angle) * 12;
      p.passCooldown = 40;
      playKickSound();
      return;
    }

    // Tir direct vers le but adverse
    let shootAngle = Math.atan2((canvas.height / 2) - ball.y, goalTargetX - ball.x);
    ball.vx = Math.cos(shootAngle) * 13;
    ball.vy = Math.sin(shootAngle) * 13;
    playKickSound();
  }
}

// --- DÉPART ET COMPTE À REBOURS ---
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
  round = 2; timeLeft = Math.floor(totalTime / 2);
  resetPositions(2);
  startCountdown();
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
      p.x = 130 + (index1 * 50);
      p.y = 120 + (index1 * (260 / Math.max(1, format - 1)));
      index1++;
    } else {
      p.x = canvas.width - 130 - (index2 * 50);
      p.y = 120 + (index2 * (260 / Math.max(1, format - 1)));
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
  
  initMatch();
  resetPositions(1);
  startCountdown(() => { startTimer(); });
  startBackgroundMusic();
}

// --- BOUCLE DE JEU & PHYSIQUE ---
function update() {
  if (isPaused || isGameOver || isCountdown) return;

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

  // Rebond haut / bas
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) ball.vy *= -1;
  
  // Rebond cage / mur
  if (ball.y < goalY || ball.y > goalY + goalHeight) {
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.vx *= -1;
  }

  // Buts
  if (ball.x < 0) { 
    score2++; score2El.textContent = score2; 
    playGoalSound(); resetPositions(2); startCountdown(); 
  }
  else if (ball.x > canvas.width) { 
    score1++; score1El.textContent = score1; 
    playGoalSound(); resetPositions(1); startCountdown(); 
  }

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
        ball.vx = Math.cos(passAngle) * 12; ball.vy = Math.sin(passAngle) * 12;
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
    ball.vx = Math.cos(angle) * 4; ball.vy = Math.sin(angle) * 4;
  }
}

// --- AFFICHAGE & RENDU CANVA ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Terrain
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2); ctx.stroke();

  // Cages
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, goalY, 8, goalHeight); ctx.fillRect(canvas.width - 8, goalY, 8, goalHeight);

  // Joueurs
  players.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif";
    ctx.fillText(p.num, p.x - 7, p.y + 4);
  });

  // Ballon
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();

  // OVERLAY DU TOP DÉPART
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
teamFormatSelect.addEventListener("change", resetGame);
humanCountSelect.addEventListener("change", resetGame);
gameDurationSelect.addEventListener("change", resetGame);

btnMusic.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  btnMusic.textContent = musicEnabled ? "🎵 Musique: ON" : "🔇 Musique: OFF";
});

resetGame();
gameLoop();
