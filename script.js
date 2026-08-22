window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ELEMENTS DE L'INTERFACE (HUD)
  const score1El = document.getElementById("score1");
  const score2El = document.getElementById("score2");
  const timerEl = document.getElementById("timer");
  const statusEl = document.getElementById("game-status");

  // MODAUX & OVERLAYS
  const mainMenu = document.getElementById("main-menu");
  const settingsModal = document.getElementById("settings-modal");
  const manualModal = document.getElementById("manual-modal");
  const onlineControls = document.getElementById("online-controls");

  // BOUTONS ET SELECTS
  const gameModeSelect = document.getElementById("gameModeSelect");
  const gameDurationSelect = document.getElementById("gameDuration");

  // ÉTAT ET PARAMÈTRES DU JEU
  let currentGameMode = "AI";
  let score1 = 0, score2 = 0;
  let totalTime = 180, timeLeft = 180;
  let isPaused = false, isGameOver = false;
  let isCountdown = false, countdownValue = 3;
  let timerInterval = null, countdownInterval = null;

  // GESTION DU CLAVIER
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // AUDIO WEB SYNTHÉTIQUE
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = "sine") {
    initAudio();
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playKickSound() { playTone(140, 0.08, "triangle"); }
  function playBeepSound(high = false) { playTone(high ? 880 : 440, 0.12, "sine"); }
  function playGoalSound() { playTone(260, 0.5, "sawtooth"); }

  // ENTITÉS DE JEU
  const p1 = { x: 150, y: 250, radius: 20, color: "#10b981", speed: 5.5, num: "J1" };
  const p2 = { x: 650, y: 250, radius: 20, color: "#ef4444", speed: 5.5, num: "J2" };
  const ball = { x: 400, y: 250, radius: 11, color: "#ffffff", vx: 0, vy: 0, friction: 0.985 };

  const goalHeight = 180;
  const goalY = (canvas.height - goalHeight) / 2;

  // SYSTEME DE JOYSTICKS TACTILES
  const joy1 = { baseX: 80, baseY: 420, stickX: 80, stickY: 420, baseR: 45, stickR: 20, dirX: 0, dirY: 0, active: false, touchId: null };
  const joy2 = { baseX: 720, baseY: 420, stickX: 720, stickY: 420, baseR: 45, stickR: 20, dirX: 0, dirY: 0, active: false, touchId: null };

  function handlePointer(clientX, clientY, isDown, touchId = null) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    [joy1, joy2].forEach((j, idx) => {
      if (idx === 1 && currentGameMode === "AI") return;

      if (isDown) {
        const dist = Math.hypot(x - j.baseX, y - j.baseY);
        if (dist < j.baseR + 50 && (!j.active || j.touchId === touchId)) {
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

  canvas.addEventListener("mousedown", (e) => handlePointer(e.clientX, e.clientY, true));
  window.addEventListener("mousemove", (e) => { if (joy1.active || joy2.active) handlePointer(e.clientX, e.clientY, true); });
  window.addEventListener("mouseup", () => handlePointer(0, 0, false));

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) handlePointer(t.clientX, t.identifier ? t.clientY : t.clientY, true, t.identifier);
  });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) handlePointer(t.clientX, t.clientY, true, t.identifier);
  });
  canvas.addEventListener("touchend", (e) => {
    for (let t of e.changedTouches) handlePointer(0, 0, false, t.identifier);
  });

  // LOGIQUE DE L'INTELLIGENCE ARTIFICIELLE (IA)
  function updateAI() {
    let targetX, targetY;
    const midField = canvas.width / 2;

    // Plafond secret : Si l'IA a 3 buts ou plus, elle défend proprement sans chercher le tir parfait
    const restrictScoring = score2 >= 3;

    // 1. Détection de la position de la balle
    if (ball.x >= midField - 20) {
      // LA BALLE EST DANS LE CAMP DE L'IA : ATTAQUE TOTALE ET RENVOI
      if (restrictScoring) {
        // Mode restriction : L'IA dégage le ballon latéralement ou doucement vers le camp adverse
        targetX = ball.x + 25;
        targetY = ball.y > canvas.height / 2 ? ball.y - 30 : ball.y + 30;
      } else {
        // Mode normal : L'IA contourne légèrement la balle pour frapper fort en direction du but adverse
        const p1GoalY = canvas.height / 2;
        const angleToGoal = Math.atan2(p1GoalY - ball.y, 0 - ball.x);
        
        targetX = ball.x - Math.cos(angleToGoal) * 15;
        targetY = ball.y - Math.sin(angleToGoal) * 15;
      }
    } else {
      // LA BALLE EST DANS LE CAMP ADVERSE : REPLACEMENT TACTIQUE
      targetX = canvas.width - 120;
      // Suit l'axe Y de la balle pour couvrir la trajectoire de tir
      targetY = Math.max(goalY - 20, Math.min(goalY + goalHeight + 20, ball.y));
    }

    // Déplacement fluide de l'IA vers sa cible
    let dx = targetX - p2.x;
    let dy = targetY - p2.y;
    let dist = Math.hypot(dx, dy);

    if (dist > 2) {
      let currentSpeed = Math.min(p2.speed, dist * 0.2);
      p2.x += (dx / dist) * currentSpeed;
      p2.y += (dy / dist) * currentSpeed;
    }

    // RÈGLE ABSOLUE : L'IA RESTE DANS SON CAMP (Ne dépasse pas la ligne médiane)
    const minXBoundary = midField + p2.radius + 2;
    p2.x = Math.max(minXBoundary, Math.min(canvas.width - p2.radius, p2.x));
    p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y));
  }

  // DÉROULEMENT DU MATCH & GESTION DU TEMPS
  function startMatchSequence() {
    initAudio();
    canvas.focus();
    if (gameModeSelect) currentGameMode = gameModeSelect.value;

    if (mainMenu) mainMenu.classList.add("hidden");
    if (settingsModal) settingsModal.classList.add("hidden");
    if (manualModal) manualModal.classList.add("hidden");

    totalTime = parseInt(gameDurationSelect ? gameDurationSelect.value : 180);
    timeLeft = totalTime;
    score1 = 0; score2 = 0;
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
        if (statusEl) statusEl.textContent = "EN JEU";
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
          endGame();
        }
      }
    }, 1000);
  }

  function endGame() {
    isGameOver = true;
    clearInterval(timerInterval);
    playGoalSound();
    if (statusEl) statusEl.textContent = "TERMINÉ";
    alert(`FIN DU MATCH !\nScore Final : Joueur 1 [ ${score1} - ${score2} ] Joueur 2`);
  }

  function resetPositions(starter = 1) {
    p1.x = 150; p1.y = canvas.height / 2;
    p2.x = canvas.width - 150; p2.y = canvas.height / 2;
    ball.vx = 0; ball.vy = 0;
    ball.x = starter === 1 ? 380 : 420;
    ball.y = canvas.height / 2;
  }

  // BOUCLE PRINCIPALE ET PHYSIQUE
  function update() {
    if (isPaused || isGameOver || isCountdown) return;

    // Déplacements Joueur 1
    let move1X = joy1.dirX * p1.speed;
    let move1Y = joy1.dirY * p1.speed;
    if (keys["KeyW"] || keys["KeyZ"]) move1Y = -p1.speed;
    if (keys["KeyS"]) move1Y = p1.speed;
    if (keys["KeyA"] || keys["KeyQ"]) move1X = -p1.speed;
    if (keys["KeyD"]) move1X = p1.speed;

    // Confinement Joueur 1 dans son camp
    p1.x = Math.max(p1.radius, Math.min(canvas.width / 2 - p1.radius - 2, p1.x + move1X));
    p1.y = Math.max(p1.radius, Math.min(canvas.height - p1.radius, p1.y + move1Y));

    // Déplacements Joueur 2 / IA
    if (currentGameMode === "LOCAL_2P") {
      let move2X = joy2.dirX * p2.speed;
      let move2Y = joy2.dirY * p2.speed;
      if (keys["ArrowUp"]) move2Y = -p2.speed;
      if (keys["ArrowDown"]) move2Y = p2.speed;
      if (keys["ArrowLeft"]) move2X = -p2.speed;
      if (keys["ArrowRight"]) move2X = p2.speed;

      // Confinement Joueur 2 dans son camp
      p2.x = Math.max(canvas.width / 2 + p2.radius + 2, Math.min(canvas.width - p2.radius, p2.x + move2X));
      p2.y = Math.max(p2.radius, Math.min(canvas.height - p2.radius, p2.y + move2Y));
    } else if (currentGameMode === "AI") {
      updateAI();
    }

    // Interactions physique Joueurs / Ballon
    pushBall(p1);
    pushBall(p2);

    // Déplacement de la balle et friction
    ball.x += ball.vx; ball.y += ball.vy;
    ball.vx *= ball.friction; ball.vy *= ball.friction;

    // Rebond sur les bordures haut et bas
    if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy *= -1; }
    if (ball.y + ball.radius > canvas.height) { ball.y = canvas.height - ball.radius; ball.vy *= -1; }

    // Rebond sur les poteaux et murs de fond (hors zone des buts)
    if (ball.y < goalY || ball.y > goalY + goalHeight) {
      if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx *= -1; }
      if (ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.vx *= -1; }
    }

    // DETECTION DES BUTS
    if (ball.x < 0) {
      score2++;
      if (score2El) score2El.textContent = score2;
      playGoalSound();
      resetPositions(1);
      startCountdown();
    } else if (ball.x > canvas.width) {
      score1++;
      if (score1El) score1El.textContent = score1;
      playGoalSound();
      resetPositions(2);
      startCountdown();
    }
  }

  function pushBall(p) {
    let dx = ball.x - p.x;
    let dy = ball.y - p.y;
    let dist = Math.hypot(dx, dy);

    if (dist < p.radius + ball.radius) {
      let angle = Math.atan2(dy, dx);
      let overlap = (p.radius + ball.radius) - dist;
      
      // Repousse la balle pour éviter les chevauchements
      ball.x += Math.cos(angle) * overlap;
      ball.y += Math.sin(angle) * overlap;

      // Impulsion de force basée sur la direction du choc
      let power = 7.5;
      ball.vx = Math.cos(angle) * power;
      ball.vy = Math.sin(angle) * power;
      playKickSound();
    }
  }

  // RENDU GRAPHIQUE SUR CANVAS
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Lignes du terrain
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 3;

    // Ligne médiane
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    // Cercle central
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 55, 0, Math.PI * 2);
    ctx.stroke();

    // Buts (Lignes blanches)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, goalY, 10, goalHeight);
    ctx.fillRect(canvas.width - 10, goalY, 10, goalHeight);

    // Dessin Joueur 1 et Joueur 2
    [p1, p2].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.num, p.x, p.y);
    });

    // Dessin Ballon
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rendu Compte à Rebours en overlay canvas
    if (isCountdown) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 85px sans-serif";
      ctx.fillStyle = "#f1c40f";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(countdownValue > 0 ? countdownValue : "GO !", canvas.width / 2, canvas.height / 2);
    }
  }

  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  // ATTACHEMENT SÉCURISÉ DES ÉVÉNEMENTS
  function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  }

  bindClick("btnStartGame", startMatchSequence);
  bindClick("btnOpenSettings", () => settingsModal && settingsModal.classList.remove("hidden"));
  bindClick("btnCloseSettings", () => {
    if (gameModeSelect) currentGameMode = gameModeSelect.value;
    if (settingsModal) settingsModal.classList.add("hidden");
  });

  bindClick("btnOpenManual", () => manualModal && manualModal.classList.remove("hidden"));
  bindClick("btnCloseManual", () => manualModal && manualModal.classList.add("hidden"));

  bindClick("btnHome", () => {
    clearInterval(timerInterval);
    if (mainMenu) mainMenu.classList.remove("hidden");
  });

  bindClick("btnPause", () => {
    if (isGameOver || isCountdown) return;
    isPaused = !isPaused;
    if (statusEl) statusEl.textContent = isPaused ? "PAUSE" : "EN JEU";
  });

  bindClick("btnReset", startMatchSequence);

  if (gameModeSelect) {
    gameModeSelect.addEventListener("change", (e) => {
      currentGameMode = e.target.value;
      if (onlineControls) {
        if (currentGameMode === "ONLINE") onlineControls.classList.remove("hidden");
        else onlineControls.classList.add("hidden");
      }
    });
  }

  // Démarrage de la boucle graphique globale
  gameLoop();
});
