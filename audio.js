// ===== 音(Web Audio API で生成するオリジナル音。sounds/ のファイルへの差し替えも可能) =====
// 好きな音源に差し替えるときはここに書く。例: { bgm: 'sounds/bgm.mp3', clear: 'sounds/clear.wav' }
// 名前: bgm move rotate drop land start pause clear fail chain1〜chain7(詳しくは sounds/README.txt)
const SOUND_FILES = {};

const Sound = (() => {
  const cfg = { bgm: true, se: true, vol: 0.5 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('nazopuyo.sound') || '{}')); } catch (e) { /* 保存なし */ }
  const save = () => { try { localStorage.setItem('nazopuyo.sound', JSON.stringify(cfg)); } catch (e) { /* 無視 */ } };

  let ac = null, master = null, bgmGain = null;
  let want = false, running = false, timer = null, step = 0, next = 0, look = 0.15;
  const files = {};
  for (const [name, path] of Object.entries(SOUND_FILES)) {
    const a = new Audio(); a.preload = 'auto';
    a.addEventListener('canplaythrough', () => { files[name] = a; if (name === 'bgm') a.loop = true; }, { once: true });
    a.src = path; // 読み込めなかったものは files に入らず、生成音で鳴る
  }

  function init() {
    if (ac) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ac = new C();
    master = ac.createGain(); master.gain.value = cfg.vol; master.connect(ac.destination);
    bgmGain = ac.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(master);
    return true;
  }
  function unlock() { // ブラウザの自動再生制限のため、最初の操作で有効化する
    if (init() && ac.state === 'suspended' && ac.resume) ac.resume().catch(() => {});
  }

  // ---- 音の部品 ----
  function tone(f, t, d, type, v, f2, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + d + 0.03);
  }
  function noise(t, d, v, dest) {
    const n = Math.max(1, Math.floor(ac.sampleRate * d));
    const buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf; g.gain.value = v; s.connect(g); g.connect(dest || master); s.start(t);
  }

  // ---- 効果音 ----
  const CHAIN_SEMI = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]; // 連鎖ごとに音が上がる
  const SE = {
    move: t => tone(520, t, 0.04, 'square', 0.07),
    rotate: t => tone(780, t, 0.05, 'square', 0.08, 980),
    drop: t => tone(900, t, 0.09, 'sawtooth', 0.07, 200),
    land: t => { tone(170, t, 0.12, 'triangle', 0.3, 70); noise(t, 0.04, 0.05); },
    start: t => [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.07, 0.12, 'square', 0.09)),
    pause: t => { tone(600, t, 0.06, 'square', 0.07); tone(450, t + 0.06, 0.08, 'square', 0.07); },
    clear: t => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.25, 'square', 0.2));
      tone(1047, t + 0.5, 0.7, 'triangle', 0.25);
    },
    fail: t => [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.16, 0.28, 'sawtooth', 0.17)),
    chain: (t, n) => {
      const f = 392 * Math.pow(2, CHAIN_SEMI[Math.min(n - 1, CHAIN_SEMI.length - 1)] / 12);
      tone(f, t, 0.35, 'square', 0.12); tone(f * 2, t, 0.22, 'triangle', 0.1); tone(f * 1.5, t + 0.04, 0.25, 'square', 0.05);
      noise(t, 0.06, 0.08);
    },
  };
  function se(name, n) {
    if (!cfg.se) return;
    const key = name === 'chain' ? 'chain' + Math.min(n || 1, 7) : name;
    if (files[key]) { const a = files[key].cloneNode(); a.volume = cfg.vol; a.play().catch(() => {}); return; }
    if (!init()) return;
    unlock();
    SE[name](ac.currentTime + 0.01, n || 1);
  }

  // ---- BGM(オリジナルの短いループ曲) ----
  const STEP = 60 / 150 / 2;                       // 150BPM の8分音符
  const MELODY = [                                  // C5 からの半音数。-1 は休符
    0, -1, 4, -1, 7, -1, 4, -1,   5, -1, 9, -1, 7, -1, 4, 2,
    0, -1, 4, 7, 12, -1, 7, 4,    2, -1, 5, -1, 4, -1, 0, -1,
  ];
  const BASS = [0, 5, 0, 7];                        // 1小節ごとの根音(C F C G)
  function bgmStep(i, t) {
    const m = MELODY[i];
    if (m >= 0) tone(523.25 * Math.pow(2, m / 12), t, STEP * 0.9, 'square', 0.05, 0, bgmGain);
    const root = 130.81 * Math.pow(2, BASS[(i >> 3) % 4] / 12), s = i % 8;
    if (s % 2 === 0) tone(s % 4 === 2 ? root * 2 : root, t, STEP * 1.6, 'triangle', 0.13, 0, bgmGain);
    if (s % 2 === 1) noise(t, 0.03, 0.04, bgmGain);
  }
  function tick() {
    while (next < ac.currentTime + look) { bgmStep(step, next); next += STEP; step = (step + 1) % MELODY.length; }
  }
  function startRun() {
    if (running) return;
    if (files.bgm) { files.bgm.volume = cfg.vol * 0.6; files.bgm.play().catch(() => {}); running = true; return; }
    if (!init()) return;
    unlock(); next = ac.currentTime + 0.05; timer = setInterval(tick, 30); running = true;
  }
  function haltRun() {
    if (!running) return;
    running = false;
    if (files.bgm) files.bgm.pause();
    clearInterval(timer); timer = null;
  }
  const refresh = () => (want && cfg.bgm ? startRun() : haltRun());

  function set(k, v) {
    cfg[k] = v; save();
    if (k === 'vol') { if (master) master.gain.value = v; if (files.bgm) files.bgm.volume = v * 0.6; }
    if (k === 'bgm') refresh();
  }

  // 設定UI
  const q = id => document.getElementById(id);
  if (q('optBgm')) {
    q('optBgm').checked = cfg.bgm; q('optSe').checked = cfg.se; q('optVol').value = Math.round(cfg.vol * 100);
    q('optBgm').onchange = e => set('bgm', e.target.checked);
    q('optSe').onchange = e => set('se', e.target.checked);
    q('optVol').oninput = e => set('vol', e.target.value / 100);
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  return {
    se, unlock,
    play() { want = true; refresh(); },                                                   // BGM再生(ポーズからの再開も)
    pause() { want = false; refresh(); },                                                 // 一時停止(位置は保持)
    stop() { want = false; refresh(); step = 0; if (files.bgm) files.bgm.currentTime = 0; }, // 停止して最初から
    _ctx: () => ac, _look: v => { look = v; },                                            // テスト用
  };
})();
