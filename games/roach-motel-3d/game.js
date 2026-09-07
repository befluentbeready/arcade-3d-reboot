/* Roach Motel 3D — a 3D reboot of the 1978 Space Invaders loop.
 * Vanilla JS + Three.js (CDN, no build step). See /pipeline/PLAYBOOK.md
 * and games/roach-motel-3d/docs/{01-concept,02-mechanics}.md for the
 * design this implements.
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.error('[roach-motel-3d] THREE failed to load — check the CDN <script> tag in index.html.');
    return;
  }

  // ---------------------------------------------------------------------
  // Config — mirrors games/roach-motel-3d/docs/02-mechanics.md
  // ---------------------------------------------------------------------
  var CFG = {
    rows: 5,
    cols: 11,
    colSpacing: 0.95,
    rowSpacing: 0.72,
    swarmStartY: 7.4,
    swarmLoseY: 2.1, // bottom row reaching this height = swarm reached the barricade line
    buggyZ: 8,
    buggyY: 0.55,
    buggyBoundX: 6.1,
    buggySpeed: 9.5,
    roachZ: -3,
    bulletSpeed: 11,
    bulletCooldownMs: 380,
    hitRadiusX: 0.5,
    hitRadiusY: 0.4,
    lives: 3,
    pointsByRow: [30, 30, 20, 20, 10], // row 0 = top/back row
    truckMinDelayMs: 9000,
    truckMaxDelayMs: 17000,
    truckBonusMin: 50,
    truckBonusMax: 300,
    fullClearBonus: 50,
    waveBaseIntervalStart: 620, // ms per horizontal step-equivalent at wave 1, full swarm
    waveBaseIntervalFloor: 260,
    roachFireMinMs: 1400,
    roachFireMaxMs: 3600,
  };

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function el(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------
  // Tiny WebAudio SFX (no external audio files — see PR notes)
  // ---------------------------------------------------------------------
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, durationMs, type, gainPeak) {
    if (!audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      var now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak || 0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
    } catch (e) { /* audio is best-effort */ }
  }
  var SFX = {
    laser: function () { beep(920, 90, 'square', 0.08); },
    roachPop: function () { beep(rand(180, 260), 110, 'sawtooth', 0.10); },
    hit: function () { beep(120, 220, 'triangle', 0.14); },
    truck: function () { beep(rand(500, 700), 70, 'sine', 0.05); },
    gameOver: function () {
      beep(220, 260, 'triangle', 0.12);
      setTimeout(function () { beep(160, 400, 'triangle', 0.12); }, 180);
    },
    wave: function () {
      beep(440, 90, 'square', 0.08);
      setTimeout(function () { beep(660, 140, 'square', 0.08); }, 100);
    },
  };

  // ---------------------------------------------------------------------
  // Three.js scene setup
  // ---------------------------------------------------------------------
  var canvas = el('scene');
  // Antialiasing off by default: on a software/weak-GPU fallback path this
  // is one of the more expensive knobs relative to what it buys visually
  // at this low-poly art style, and the fps floor matters more than MSAA.
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  window.__roachMotelRenderer = renderer; // exposed for perf self-checks only

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a16);
  scene.fog = new THREE.Fog(0x0a0a16, 8, 26);

  var BASE_FOV_DEG = 62;
  var BASE_CAMERA_Z = 10.2;
  var camera = new THREE.PerspectiveCamera(BASE_FOV_DEG, 1, 0.1, 100);
  camera.position.set(0, 3.1, BASE_CAMERA_Z);
  camera.lookAt(0, 3.6, -2);

  // Half-width (world units) that must stay in frame: the buggy's travel
  // range plus a little margin for the outer barricades/swarm columns.
  var NEEDED_HALF_WIDTH = CFG.buggyBoundX + 1.5;
  var BASE_VFOV_RAD = THREE.MathUtils.degToRad(BASE_FOV_DEG);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    var aspect = w / h;
    camera.aspect = aspect;
    // On a narrow/portrait viewport a fixed FOV crops the outer barricades
    // (verified against a phone-sized viewport during self-check). Rather
    // than widen the FOV, which fisheyes the low-poly art, dolly the
    // camera back just enough to keep the full play width in frame —
    // a no-op on landscape/desktop aspect ratios.
    var requiredDepth = NEEDED_HALF_WIDTH / (Math.tan(BASE_VFOV_RAD / 2) * aspect);
    var extraBack = Math.max(0, requiredDepth - BASE_CAMERA_Z);
    camera.position.z = BASE_CAMERA_Z + extraBack;
    camera.lookAt(0, 3.6, -2);
    camera.updateProjectionMatrix();

    // THREE.Fog distance is measured from the camera, so dollying back for
    // a narrow viewport (above) also pushes the swarm further from the
    // camera — without this, portrait aspect ratios fogged the whole
    // swarm out of visibility (caught in the mobile-viewport self-check).
    // Keep fog anchored just past the buggy and well past the swarm.
    scene.fog.near = Math.max(1, camera.position.z - CFG.buggyZ - 1);
    scene.fog.far = (camera.position.z - CFG.roachZ) + 10;
  }
  window.addEventListener('resize', resize);
  resize();

  // Lighting — deliberately just two lights (ambient + one directional).
  // A third (point) light was cut after profiling: every additional light
  // adds a per-fragment cost across the whole scene under forward
  // rendering, and a software/weak-GPU fallback path feels that far more
  // than a discrete GPU does. The "cockpit glow" is faked instead with an
  // emissive tint on the dome material below — same read, no extra light.
  scene.add(new THREE.AmbientLight(0x8892b0, 0.7));
  var moonLight = new THREE.DirectionalLight(0xbfe0ff, 0.95);
  moonLight.position.set(-4, 10, -6);
  scene.add(moonLight);

  // Moon (cheap emissive sphere, purely decorative).
  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xeaf3ff })
  );
  moon.position.set(-9, 11, -20);
  scene.add(moon);

  // Ground / lane — flat plane, cheap, gives roaches and buggy something to sit on visually.
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 60),
    new THREE.MeshLambertMaterial({ color: 0x11131f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -4);
  scene.add(ground);

  // ---------------------------------------------------------------------
  // Buggy + pilot bust ("Bug Zapper")
  // ---------------------------------------------------------------------
  var buggyGroup = new THREE.Group();
  buggyGroup.position.set(0, CFG.buggyY, CFG.buggyZ);
  scene.add(buggyGroup);

  var buggyBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x3a4a3a })
  );
  buggyBody.position.y = 0.25;
  buggyGroup.add(buggyBody);

  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7),
    // Plain transparent MeshLambertMaterial reads as a glass dome at gameplay
    // distance for a fraction of the cost of MeshPhysicalMaterial's
    // `transmission` (which renders the scene to an extra texture every
    // frame — measured ~3x slower for zero visible benefit at this scale).
    // A warm emissive tint stands in for the cut cockpit point-light.
    new THREE.MeshLambertMaterial({
      color: 0x88ffcc, emissive: 0x442200, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide,
    })
  );
  dome.position.y = 0.6;
  buggyGroup.add(dome);

  var pilotGroup = new THREE.Group();
  pilotGroup.position.set(0, 0.62, 0.05);
  buggyGroup.add(pilotGroup);
  var pilotHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xffd7a8 })
  );
  pilotHead.position.y = 0.18;
  pilotGroup.add(pilotHead);
  var pilotBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.28, 8),
    new THREE.MeshLambertMaterial({ color: 0xff6ea8 })
  );
  pilotGroup.add(pilotBody);

  [[-0.7, -0.75], [0.7, -0.75], [-0.7, 0.75], [0.7, 0.75]].forEach(function (p) {
    var wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.22, 10),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 })
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(p[1], 0.05, p[0] * 0.5);
    buggyGroup.add(wheel);
  });

  var buggyReaction = 0; // >0 while playing a hit/kill reaction tilt

  // ---------------------------------------------------------------------
  // Roach swarm — InstancedMesh for a cheap, single-draw-call crowd.
  // ---------------------------------------------------------------------
  var ROACH_COUNT = CFG.rows * CFG.cols;
  var roachGeometry = new THREE.IcosahedronGeometry(0.32, 0);
  roachGeometry.scale(1, 0.6, 1.3);
  // Base color is white: InstancedMesh multiplies each instance's color
  // (set below, per row) onto the material color, so a tinted base would
  // muddy the per-row hues instead of showing them cleanly.
  var roachMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0x0e4a26,
  });
  var roachMesh = new THREE.InstancedMesh(roachGeometry, roachMaterial, ROACH_COUNT);
  roachMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(roachMesh);

  var roachColorAlt = new THREE.Color(0xb26bff);
  var roachColorBase = new THREE.Color(0x39ff8f);
  var roachColors = new Float32Array(ROACH_COUNT * 3);
  roachMesh.instanceColor = new THREE.InstancedBufferAttribute(roachColors, 3);

  var roaches = []; // { row, col, alive }
  var dummy = new THREE.Object3D();

  function roachLocalX(col) { return (col - (CFG.cols - 1) / 2) * CFG.colSpacing; }
  function roachLocalY(row) { return -row * CFG.rowSpacing; }

  function initRoaches() {
    roaches.length = 0;
    for (var r = 0; r < CFG.rows; r++) {
      for (var c = 0; c < CFG.cols; c++) {
        roaches.push({ row: r, col: c, alive: true });
      }
    }
    roachesAlive = ROACH_COUNT;
  }

  var swarmDir = 1;
  var swarmOffsetX = 0;
  var swarmY = CFG.swarmStartY;
  var swarmHalfWidth = ((CFG.cols - 1) / 2) * CFG.colSpacing;
  var swarmXBound = 6.4;
  var roachesAlive = ROACH_COUNT;

  function swarmSpeed() {
    // Continuous horizontal speed (units/sec). Scales up as fewer roaches
    // remain, and each wave starts faster than the last (both floored so
    // it stays playable on the 30fps floor target).
    var remainingFraction = roachesAlive / ROACH_COUNT;
    var base = 1000 / waveBaseIntervalMs; // "steps/sec equivalent" -> units/sec scale below
    var speedUnitsPerSec = 1.1 * base * CFG.colSpacing * (1.9 - remainingFraction);
    return speedUnitsPerSec;
  }

  function updateRoachInstances() {
    for (var i = 0; i < roaches.length; i++) {
      var ro = roaches[i];
      if (!ro.alive) {
        dummy.position.set(0, -999, 0); // parked off-screen
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        roachMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      var x = swarmOffsetX + roachLocalX(ro.col);
      var y = swarmY + roachLocalY(ro.row);
      dummy.position.set(x, y, CFG.roachZ);
      var bob = Math.sin(performance.now() * 0.006 + ro.col * 0.7 + ro.row) * 0.05;
      dummy.position.y += bob;
      dummy.rotation.set(0, swarmDir > 0 ? 0.15 : -0.15, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roachMesh.setMatrixAt(i, dummy.matrix);
      var col = ro.row >= 3 ? roachColorAlt : roachColorBase; // back two rows glow violet
      roachMesh.setColorAt(i, col);
    }
    roachMesh.instanceMatrix.needsUpdate = true;
    if (roachMesh.instanceColor) roachMesh.instanceColor.needsUpdate = true;
  }

  function bottomRowY() {
    return swarmY + roachLocalY(CFG.rows - 1);
  }

  // ---------------------------------------------------------------------
  // Barricades — 4 crumbling scrap barricades between buggy and swarm.
  // ---------------------------------------------------------------------
  var barricades = [];
  function initBarricades() {
    barricades.forEach(function (b) {
      b.chunks.forEach(function (c) { scene.remove(c.mesh); });
    });
    barricades.length = 0;

    var xs = [-4.6, -1.55, 1.55, 4.6];
    var chunkGeo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
    var chunkMat = new THREE.MeshLambertMaterial({ color: 0x6b6f5a });

    xs.forEach(function (bx) {
      var chunks = [];
      var layout = [[-0.28, 0], [0.28, 0], [-0.28, 0.35], [0.28, 0.35], [0, 0.7]];
      layout.forEach(function (p) {
        var mesh = new THREE.Mesh(chunkGeo, chunkMat);
        mesh.position.set(bx + p[0], 0.35 + p[1], 3.2);
        scene.add(mesh);
        chunks.push({ mesh: mesh, alive: true });
      });
      barricades.push({ x: bx, chunks: chunks });
    });
  }

  function barricadeBlock(x, y, z) {
    // Returns true and consumes one chunk if (x,y,z) hits a live barricade chunk.
    for (var i = 0; i < barricades.length; i++) {
      var b = barricades[i];
      if (Math.abs(x - b.x) > 0.55) continue;
      for (var j = 0; j < b.chunks.length; j++) {
        var c = b.chunks[j];
        if (!c.alive) continue;
        if (Math.abs(z - c.mesh.position.z) < 0.5 && Math.abs(y - c.mesh.position.y) < 0.45) {
          c.alive = false;
          c.mesh.visible = false;
          return true;
        }
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // Ice-cream truck bonus
  // ---------------------------------------------------------------------
  var truckGroup = new THREE.Group();
  (function buildTruck() {
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.6, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xfff3d6 })
    );
    truckGroup.add(body);
    var stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 0.15, 0.62),
      new THREE.MeshLambertMaterial({ color: 0xff6ea8 })
    );
    stripe.position.y = 0.05;
    truckGroup.add(stripe);
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xffd76e })
    );
    cone.position.set(0.85, 0.15, 0);
    cone.rotation.z = Math.PI / 2 - 0.3;
    truckGroup.add(cone);
  })();
  truckGroup.visible = false;
  truckGroup.position.set(0, CFG.swarmStartY + 1.1, CFG.roachZ - 1.2);
  scene.add(truckGroup);

  var truck = { active: false, dir: 1, value: 0, nextAt: 0 };
  function scheduleTruck(fromNow) {
    truck.nextAt = performance.now() + fromNow + rand(CFG.truckMinDelayMs, CFG.truckMaxDelayMs);
  }
  function launchTruck() {
    truck.active = true;
    truck.dir = Math.random() < 0.5 ? 1 : -1;
    truck.value = Math.round(rand(CFG.truckBonusMin, CFG.truckBonusMax) / 10) * 10;
    truckGroup.position.x = -truck.dir * (swarmXBound + 1.5);
    truckGroup.visible = true;
  }

  // ---------------------------------------------------------------------
  // Bullets
  // ---------------------------------------------------------------------
  var playerBullets = []; // {mesh, vx, vy, vz}
  var roachBullets = [];
  var bulletGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6);
  var playerBulletMat = new THREE.MeshBasicMaterial({ color: 0x9dffcf });
  var roachBulletMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b });

  function firePlayerBullet() {
    var mesh = new THREE.Mesh(bulletGeo, playerBulletMat);
    mesh.position.set(buggyGroup.position.x, 1.0, CFG.buggyZ - 0.6);
    scene.add(mesh);
    var dz = CFG.roachZ - CFG.buggyZ;
    var dy = bottomRowY() - 1.0;
    var dist = Math.sqrt(dz * dz + dy * dy) || 1;
    playerBullets.push({
      mesh: mesh,
      vy: (dy / dist) * CFG.bulletSpeed,
      vz: (dz / dist) * CFG.bulletSpeed,
    });
    SFX.laser();
  }

  function fireRoachBullet() {
    var alive = roaches.filter(function (r) { return r.alive; });
    if (!alive.length) return;
    var shooter = alive[Math.floor(Math.random() * alive.length)];
    var x = swarmOffsetX + roachLocalX(shooter.col);
    var y = swarmY + roachLocalY(shooter.row);
    var mesh = new THREE.Mesh(bulletGeo, roachBulletMat);
    mesh.position.set(x, y, CFG.roachZ);
    scene.add(mesh);
    var dz = CFG.buggyZ - CFG.roachZ;
    var dy = CFG.buggyY - y;
    var dist = Math.sqrt(dz * dz + dy * dy) || 1;
    roachBullets.push({
      mesh: mesh,
      x: x,
      vy: (dy / dist) * (CFG.bulletSpeed * 0.7),
      vz: (dz / dist) * (CFG.bulletSpeed * 0.7),
    });
  }
  var nextRoachFireAt = performance.now() + rand(CFG.roachFireMinMs, CFG.roachFireMaxMs);

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  var STATE = { BOOT: 0, START: 1, PLAYING: 2, GAMEOVER: 3 };
  var state = STATE.START;
  var score = 0, lives = CFG.lives, wave = 1;
  var highScore = 0;
  var waveBaseIntervalMs = CFG.waveBaseIntervalStart;
  var lastFireAt = -Infinity;
  var moveLeft = false, moveRight = false;
  var wasHitDuringWave = false;

  try {
    highScore = parseInt(localStorage.getItem('roachMotel3dHighScore') || '0', 10) || 0;
  } catch (e) { highScore = 0; }
  el('highscore').textContent = String(highScore);

  function updateHud() {
    el('score').textContent = String(score);
    el('wave').textContent = String(wave);
    el('lives').textContent = new Array(Math.max(lives, 0) + 1).join('▲') || '';
  }

  function resetWave(keepScore) {
    initRoaches();
    swarmY = CFG.swarmStartY;
    swarmOffsetX = 0;
    swarmDir = 1;
    wasHitDuringWave = false;
    updateRoachInstances();
    scheduleTruck(2500);
  }

  function startGame() {
    ensureAudio();
    score = 0; lives = CFG.lives; wave = 1;
    waveBaseIntervalMs = CFG.waveBaseIntervalStart;
    initBarricades();
    resetWave();
    updateHud();
    el('start-screen').classList.add('hidden');
    el('gameover-screen').classList.add('hidden');
    state = STATE.PLAYING;
  }

  function loseLife() {
    lives -= 1;
    buggyReaction = 1;
    SFX.hit();
    updateHud();
    if (lives <= 0) {
      endGame();
    }
  }

  function endGame() {
    state = STATE.GAMEOVER;
    SFX.gameOver();
    var isNew = score > highScore;
    if (isNew) {
      highScore = score;
      try { localStorage.setItem('roachMotel3dHighScore', String(highScore)); } catch (e) { /* ignore */ }
    }
    el('highscore').textContent = String(highScore);
    el('final-score-line').textContent = 'Score ' + score + ' — reached wave ' + wave;
    el('new-high').classList.toggle('hidden', !isNew);
    el('gameover-screen').classList.remove('hidden');
  }

  function onFullClear() {
    if (!wasHitDuringWave) {
      score += CFG.fullClearBonus;
    }
    wave += 1;
    waveBaseIntervalMs = Math.max(CFG.waveBaseIntervalFloor, waveBaseIntervalMs - 35);
    SFX.wave();
    updateHud();
    resetWave();
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  function tryFire() {
    var now = performance.now();
    if (now - lastFireAt < CFG.bulletCooldownMs) return;
    if (state !== STATE.PLAYING) return;
    lastFireAt = now;
    firePlayerBullet();
  }

  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') moveLeft = true;
    if (ev.code === 'ArrowRight' || ev.code === 'KeyD') moveRight = true;
    if (ev.code === 'Space') { ev.preventDefault(); tryFire(); }
  });
  window.addEventListener('keyup', function (ev) {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') moveLeft = false;
    if (ev.code === 'ArrowRight' || ev.code === 'KeyD') moveRight = false;
  });

  function bindHold(elm, onDown, onUp) {
    if (!elm) return;
    elm.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(); });
    elm.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(); });
    elm.addEventListener('pointerleave', function () { onUp(); });
    elm.addEventListener('pointercancel', function () { onUp(); });
  }
  bindHold(el('touch-left'), function () { moveLeft = true; }, function () { moveLeft = false; });
  bindHold(el('touch-right'), function () { moveRight = true; }, function () { moveRight = false; });
  bindHold(el('touch-fire'), function () { tryFire(); }, function () {});

  if ('ontouchstart' in window) el('touch-controls').classList.add('active');

  el('start-btn').addEventListener('click', startGame);
  el('restart-btn').addEventListener('click', startGame);
  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'Enter' && (state === STATE.START || state === STATE.GAMEOVER)) startGame();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { moveLeft = false; moveRight = false; }
  });

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  var clock = new THREE.Clock();

  function stepSwarm(dt) {
    var speed = swarmSpeed();
    swarmOffsetX += swarmDir * speed * dt;
    var edge = swarmXBound - swarmHalfWidth;
    if (swarmOffsetX > edge || swarmOffsetX < -edge) {
      swarmOffsetX = clamp(swarmOffsetX, -edge, edge);
      swarmDir *= -1;
      swarmY -= 0.34;
    }
    if (bottomRowY() <= CFG.swarmLoseY) {
      endGame();
    }
  }

  function stepBullets(dt) {
    for (var i = playerBullets.length - 1; i >= 0; i--) {
      var b = playerBullets[i];
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;

      var blocked = b.vz < 0 && barricadeBlock(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z);
      var hitRoach = null;
      if (!blocked) {
        for (var j = 0; j < roaches.length; j++) {
          var ro = roaches[j];
          if (!ro.alive) continue;
          var rx = swarmOffsetX + roachLocalX(ro.col);
          var ry = swarmY + roachLocalY(ro.row);
          if (Math.abs(b.mesh.position.x - rx) < CFG.hitRadiusX &&
              Math.abs(b.mesh.position.y - ry) < CFG.hitRadiusY &&
              b.mesh.position.z <= CFG.roachZ + 0.4) {
            hitRoach = ro;
            break;
          }
        }
      }

      var offscreen = b.mesh.position.z < CFG.roachZ - 3 || b.mesh.position.y > CFG.swarmStartY + 3;
      if (blocked || hitRoach || offscreen) {
        scene.remove(b.mesh);
        playerBullets.splice(i, 1);
        if (hitRoach) {
          hitRoach.alive = false;
          roachesAlive -= 1;
          score += CFG.pointsByRow[hitRoach.row] || 10;
          buggyReaction = 0.5;
          SFX.roachPop();
          updateHud();
          updateRoachInstances();
          if (roachesAlive <= 0) onFullClear();
        }
      }
    }

    for (var k = roachBullets.length - 1; k >= 0; k--) {
      var rb = roachBullets[k];
      rb.mesh.position.y += rb.vy * dt;
      rb.mesh.position.z += rb.vz * dt;

      var rblocked = rb.vz > 0 && barricadeBlock(rb.mesh.position.x, rb.mesh.position.y, rb.mesh.position.z);
      var hitBuggy = !rblocked &&
        rb.mesh.position.z >= CFG.buggyZ - 0.7 &&
        Math.abs(rb.mesh.position.x - buggyGroup.position.x) < 0.7 &&
        Math.abs(rb.mesh.position.y - 1.0) < 0.6;

      var roffscreen = rb.mesh.position.z > CFG.buggyZ + 2;
      if (rblocked || hitBuggy || roffscreen) {
        scene.remove(rb.mesh);
        roachBullets.splice(k, 1);
        if (hitBuggy) {
          wasHitDuringWave = true;
          loseLife();
        }
      }
    }
  }

  function stepTruck(dt, now) {
    if (!truck.active) {
      if (now >= truck.nextAt) launchTruck();
      return;
    }
    truckGroup.position.x += truck.dir * 3.2 * dt;
    if (Math.abs(truckGroup.position.x) > swarmXBound + 2) {
      truck.active = false;
      truckGroup.visible = false;
      scheduleTruck(0);
      return;
    }
    // Player bullets can also tag the truck for the bonus.
    for (var i = playerBullets.length - 1; i >= 0; i--) {
      var b = playerBullets[i];
      if (Math.abs(b.mesh.position.x - truckGroup.position.x) < 0.9 &&
          Math.abs(b.mesh.position.y - truckGroup.position.y) < 0.6 &&
          b.mesh.position.z < CFG.roachZ + 2) {
        score += truck.value;
        SFX.truck();
        updateHud();
        scene.remove(b.mesh);
        playerBullets.splice(i, 1);
        truck.active = false;
        truckGroup.visible = false;
        scheduleTruck(0);
        break;
      }
    }
  }

  function stepBuggy(dt) {
    var dir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    buggyGroup.position.x = clamp(
      buggyGroup.position.x + dir * CFG.buggySpeed * dt,
      -CFG.buggyBoundX, CFG.buggyBoundX
    );
    var idle = Math.sin(performance.now() * 0.0025) * 0.03;
    buggyReaction = Math.max(0, buggyReaction - dt * 1.6);
    buggyGroup.rotation.z = idle + buggyReaction * (wasHitDuringWave ? -0.18 : 0.14);
    buggyGroup.position.y = CFG.buggyY + Math.sin(performance.now() * 0.0025) * 0.02;
  }

  var frameCount = 0, fpsAccum = 0, fpsLastLog = 0;

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05); // clamp huge tab-switch deltas
    var now = performance.now();

    if (state === STATE.PLAYING) {
      stepSwarm(dt);
      stepBullets(dt);
      stepTruck(dt, now);
      if (now >= nextRoachFireAt && roachesAlive > 0) {
        fireRoachBullet();
        nextRoachFireAt = now + rand(CFG.roachFireMinMs, CFG.roachFireMaxMs);
      }
      updateRoachInstances();
    }
    stepBuggy(dt);

    renderer.render(scene, camera);

    // Lightweight perf self-check, exposed for automated verification only.
    frameCount++;
    fpsAccum += dt;
    if (fpsAccum >= 1) {
      window.__roachMotelFps = Math.round(frameCount / fpsAccum);
      frameCount = 0; fpsAccum = 0;
    }
  }

  initBarricades();
  initRoaches();
  updateRoachInstances();
  updateHud();
  window.__roachMotelReady = true;
  requestAnimationFrame(tick);
})();
