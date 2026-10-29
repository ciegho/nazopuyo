// ===== 画面・入力 =====
const APP_VER = '21';
// ファイルの版がそろっていないと動かないので、先に確認する
const fatal = msg => { if (typeof showFatal === 'function') showFatal(msg); throw new Error(msg); };
if (document.documentElement.dataset.ver !== APP_VER) fatal('index.html が古いです。index.html / logic.js / problems.js / main.js / editor.js を同じ版(zip)に入れ替えてください');
if (typeof Sound === 'undefined') fatal('audio.js が読み込めていません。最新版(zip)に入れ替えてください');
if (typeof groupStats !== 'function') fatal('logic.js が古いです。最新版に入れ替えてください');
const CELL = 40, OFF = 2; // OFF: 13段目の上に確保する行数(ツモの出現位置)
// 落下速度(本家の厳密な値は未確認なので、体感に合わせて調整してください)
const FALL_MS = 700;      // 通常の落下間隔(1マスあたり)
const SOFT_MS = 90;       // ↓長押し時の落下間隔
const LOCK_MS = 500;      // 着地してから固定されるまで(横移動・回転の猶予)
const LOCK_SOFT_MS = 130; // ↓長押し中の固定までの時間
const CSS = { 1: '#ee4a52', 2: '#39b45a', 3: '#3d7bea', 4: '#f2c93a', 5: '#a35fd6', 6: '#c9cede', 7: '#555b6b', 8: '#15161a' };
const $ = id => document.getElementById(id);
const cv = $('board'), ctx = cv.getContext('2d');
cv.width = COLS * CELL; cv.height = (ROWS + OFF) * CELL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keys = { down: false };
let st;
let mode = 'play'; // 'play' | 'edit'
let vsActive = false; // 対戦中(versus.js が操作)
let vsBanner = '';    // 盤面に重ねる対戦用の表示(空なら出さない)
let onJudge = null;   // 1問の結果が出たとき呼ばれる(対戦用)

// 問題一覧 = セットの集まり。先頭は組み込み(problems.js・変更不可)、以降は自作(ブラウザに保存)
function loadSets() {
  const list = [{ name: '組み込み', builtin: true, problems: PROBLEMS }];
  if (typeof GEN_SETS !== 'undefined') for (const g of GEN_SETS) list.push({ name: g.name, builtin: true, problems: g.problems }); // 自動生成した問題セット(problems_gen.js)
  try {
    const raw = localStorage.getItem('nazopuyo.sets');
    if (raw) {
      for (const s of JSON.parse(raw).sets || [])
        if (s && Array.isArray(s.problems) && s.problems.length) list.push({ name: String(s.name || '無題のセット'), problems: s.problems });
    } else { // 旧版(nazopuyo.custom)の自作問題を1つのセットに移す
      const old = JSON.parse(localStorage.getItem('nazopuyo.custom') || '[]');
      if (Array.isArray(old) && old.length) list.push({ name: '自作(旧データ)', problems: old });
    }
  } catch (e) { /* 保存データなし・壊れている */ }
  return list;
}
const sets = loadSets();
let curSet = 0;
let problems = sets[0].problems; // いま選んでいるセットの問題(sets[curSet].problems と同じ配列)
function saveSets() {
  try { localStorage.setItem('nazopuyo.sets', JSON.stringify({ v: 1, sets: sets.filter(s => !s.builtin).map(s => ({ name: s.name, problems: s.problems })) })); return true; }
  catch (e) { return false; }
}
function fillSetSelect() {
  const s = $('setSel'); s.innerHTML = '';
  sets.forEach((x, i) => s.add(new Option((x.builtin ? '📦 ' : '★ ') + x.name + ` (${x.problems.length}問)`, i)));
  s.value = curSet;
}
// むずかしさ(1〜5)の表示
const DIFF_NAMES = ['', '入門', 'やさしい', 'ふつう', 'むずかしい', '超むずかしい'];
const starsOf = d => d >= 1 && d <= 5 ? '★'.repeat(d) + '☆'.repeat(5 - d) : '';
function fillSelect() {
  const s = $('sel'), v = s.value; s.innerHTML = '';
  problems.forEach((p, i) => s.add(new Option(`${i + 1}. ${p.title}` + (p.difficulty ? `  ${starsOf(p.difficulty)}` : ''), i)));
  s.value = v;
}
function selectSet(i) { curSet = i; problems = sets[i].problems; fillSetSelect(); fillSelect(); }

function load(i) { $('sel').value = i; loadProblem(problems[i]); }
function loadProblem(p) {
  if (!vsActive) Sound.stop(); // 対戦中はBGMを途切れさせない
  st = { prob: p, board: parseBoard(p.board), softT: 0, idx: 0, cleared: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, phase: 'ready', chain: 0, hist: [], piece: null, fallT: 0, lockT: 0, anim: [], blink: null, blinkT0: 0, turnT: 0 };
  spawn(); setMsg(''); render();
  if (vsActive) startGame(); // 対戦中は READY を挟まず即開始
}
function spawn() {
  const t = st.prob.tsumo[st.idx];
  st.piece = t ? { x: 2, y: 0, rot: 0, a: COLORS[t[0]], c: COLORS[t[1]] } : null;
  st.fallT = t ? FALL_MS * 0.5 : 0; st.lockT = st.softT = 0; st.turnT = 0; keys.down = false; // 13段目から半マス進んだ12.5段目の見た目で出現し、そこから落ち始める
}
// ↓キーの押し下げ/解除。押した瞬間に1マス進む(softTを満タンにしておく)
function setDown(v) {
  if (v && !keys.down && st) st.softT = SOFT_MS;
  keys.down = v;
}
function setMsg(s) { $('msg').textContent = s; }
const canFall = p => fits(st.board, { ...p, y: p.y + 1 });

// ---- 操作 ----
function move(dx) {
  const p = st.piece;
  if (st.phase !== 'play' || !p) return;
  const q = { ...p, x: p.x + dx };
  if (fits(st.board, q)) { st.piece = q; st.lockT = 0; Sound.se('move'); }
}
const OFFS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // rotごとの子の位置
const QUICK_MS = 250; // クイックターン受付時間
// 回転先に置けるか。ふさがっていたら「子の反対方向」に1マス押し戻す
// (横向き→反対側へ壁蹴り / 子が下→1段上へ床蹴り = 昇竜の元)
function tryRot(p, rot) {
  const [dx, dy] = OFFS[rot];
  for (const [kx, ky] of [[0, 0], [-dx, -dy]]) {
    const q = { ...p, rot, x: p.x + kx, y: p.y + ky };
    if (fits(st.board, q)) return q;
  }
  return null;
}
function rotate(d) {
  const p = st.piece;
  if (st.phase !== 'play' || !p) return;
  let q = tryRot(p, (p.rot + d + 4) % 4);
  if (!q) {
    // 両側がふさがっている: 短時間にもう一度押されたら180度ターン
    const now = performance.now();
    if (st.turnT && now - st.turnT < QUICK_MS) { q = tryRot(p, (p.rot + 2) % 4); st.turnT = 0; }
    else st.turnT = now;
  }
  if (q) { st.piece = q; st.lockT = 0; Sound.se('rotate'); }
}
function hardDrop() {
  const p = st.piece;
  if (st.phase !== 'play' || !p) return;
  while (canFall(p)) p.y++;
  Sound.se('drop');
  lock();
}
async function lock() {
  const p = st.piece;
  if (st.phase !== 'play' || !p) return;
  const snap = { board: cloneBoard(st.board), idx: st.idx, cleared: { ...st.cleared } };
  if (!lockPiece(st.board, p)) { st.phase = 'done'; setMsg('窒息…(盤面からはみ出しました)'); Sound.stop(); Sound.se('fail'); if (onJudge) onJudge(false); return; }
  st.hist.push(snap);
  Sound.se('land');
  st.phase = 'chain'; st.idx++; st.piece = null;
  const my = st;
  const res = await runChain();
  if (!res || st !== my) return; // 待機中にやり直された
  spawn(); judge(res);
}
const G = 160;        // 落下加速度(マス/秒²)。大きいほど速い
const POP_MS = 400;   // 点滅して消えるまで
const GAP_MS = 80;    // 着地後、次の消去判定までの間

// 重力を適用し、移動するぷよのリストを返す
function planFall(b) {
  const before = cloneBoard(b); applyGravity(b);
  const moves = [];
  for (let x = 0; x < COLS; x++) {
    const f = [], t = [];
    for (let y = ROWS - 1; y >= 0; y--) {
      if (before[y][x] && before[y][x] !== WALL) f.push(y);
      if (b[y][x] && b[y][x] !== WALL) t.push(y);
    }
    f.forEach((y0, i) => { if (t[i] !== y0) moves.push({ x, y0, y1: t[i], c: b[t[i]][x] }); });
  }
  return moves;
}
// 加速しながら落ちるアニメーション。やり直されたら false
async function fall(my) {
  const final = cloneBoard(st.board), moves = planFall(final);
  if (!moves.length) return true;
  const stat = cloneBoard(final); moves.forEach(m => { stat[m.y1][m.x] = 0; });
  st.board = stat;
  const t0 = performance.now();
  for (let done = false; !done;) {
    await new Promise(r => requestAnimationFrame(r));
    if (st !== my) return false;
    const t = (performance.now() - t0) / 1000;
    done = true;
    st.anim = moves.map(m => {
      const y = Math.min(m.y1, m.y0 + 0.5 * G * t * t);
      if (y < m.y1) done = false;
      return { x: m.x, y, c: m.c };
    });
  }
  st.anim = []; st.board = final;
  return true;
}
async function runChain() {
  const my = st, steps = [];
  const wait = async ms => { await sleep(ms); return st === my; }; // 待機中にやり直されたら false
  st.chain = 0; render();
  if (!await fall(my)) return null;            // 設置直後の落下(待ちなし)
  for (let g = findGroups(st.board); g.length; g = findGroups(st.board)) {
    st.chain++; Sound.se('chain', st.chain);
    const s = groupStats(st.board, g); // 消す前に色数・個数を記録
    steps.push(s.colors);
    for (const c in s.counts) st.cleared[c] += s.counts[c];
    st.blink = g.flat(); st.blinkT0 = performance.now(); // 点滅
    if (!await wait(POP_MS)) return null;
    st.blink = null;
    clearGroups(st.board, g); render();
    if (!await fall(my)) return null;
    if (!await wait(GAP_MS)) return null;
  }
  return { chain: st.chain, steps, cleared: st.cleared, board: st.board, pending: st.prob.tsumo.slice(st.idx) };
}
function judge(res) {
  const ok = goalMet(st.prob.goal, res);
  if (ok) { st.phase = 'done'; setMsg('🎉 クリア!'); Sound.stop(); Sound.se('clear'); }
  else if (st.board[1][2]) { st.phase = 'done'; setMsg('窒息…(左から3列目の12段目にぷよが残りました)'); Sound.stop(); Sound.se('fail'); }
  else if (st.idx >= st.prob.tsumo.length) { st.phase = 'done'; setMsg('残念…手数切れ'); Sound.stop(); Sound.se('fail'); }
  else if (!fits(st.board, st.piece)) { st.phase = 'done'; setMsg('窒息…'); Sound.stop(); Sound.se('fail'); }
  else st.phase = 'play';
  render();
  if (onJudge && st.phase === 'done') onJudge(ok);
}
function undo() {
  if (st.phase === 'chain' || !st.hist.length) return;
  if (vsActive && st.phase === 'done') return; // 対戦中は結果が出たあとに戻せない
  const h = st.hist.pop(), was = st.phase;
  st.board = h.board; st.idx = h.idx; st.cleared = h.cleared; st.chain = 0; st.phase = was === 'paused' ? 'paused' : 'play';
  spawn(); setMsg(''); render();
  if (st.phase === 'play') Sound.play();
}

// ---- READY / ポーズ ----
function startGame() {
  if (vsBanner) return;
  if (mode === 'play' && st.phase === 'ready') { st.phase = 'play'; st.lockT = st.softT = 0; Sound.se('start'); Sound.play(); }
}
function pause() {
  if (mode === 'play' && st.phase === 'play' && !vsActive) { /* 対戦中はポーズ不可 */ st.phase = 'paused'; keys.down = false; Sound.pause(); Sound.se('pause'); }
}
function resume() { if (st.phase === 'paused') { st.phase = 'play'; Sound.play(); Sound.se('pause'); } }
function togglePause() { st.phase === 'paused' ? resume() : pause(); }
function syncOverlay() {
  const ph = mode === 'play' ? st.phase : '';
  const bn = mode === 'play' && !!vsBanner;
  $('ov').hidden = !(bn || ph === 'ready' || ph === 'paused');
  $('ovReady').hidden = bn || ph !== 'ready';
  $('ovPause').hidden = bn || ph !== 'paused';
  $('ovVs').hidden = !bn;
  if (bn) { $('ovVsText').textContent = vsBanner; $('ovVsText').style.fontSize = vsBanner.length <= 2 ? '72px' : '24px'; }
}

// ---- ゲームループ(落下処理) ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100); last = now;
  const p = st.piece;
  if (mode === 'play' && st.phase === 'play' && p) {
    if (canFall(p)) {
      st.lockT = 0;
      // 自由落下とソフトドロップは別々のタイマーで数える(切り替え時に溜まった分が一気に出ないように)
      if (keys.down) {
        st.softT += dt; st.fallT = 0;
        while (st.softT >= SOFT_MS && canFall(p)) { p.y++; st.softT -= SOFT_MS; }
      } else {
        st.softT = 0; st.fallT += dt;
        while (st.fallT >= FALL_MS && canFall(p)) { p.y++; st.fallT -= FALL_MS; }
      }
    } else {
      st.fallT = 0; st.lockT += dt;
      if (st.lockT >= (keys.down ? LOCK_SOFT_MS : LOCK_MS)) lock();
    }
  }
  draw();
  requestAnimationFrame(frame);
}

// ---- 描画 ----
// ---- 描画: ぷよはグラデーション+目、同色の隣り合うぷよは「くっつき」で結ぶ ----
function ball(px, py, r, base) {
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  let g = ctx.createRadialGradient(px, py, r * .5, px, py, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.34)');
  ctx.fillStyle = g; ctx.fill();
  g = ctx.createRadialGradient(px - r * .35, py - r * .45, 0, px - r * .35, py - r * .45, r * .85); g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fill();
}
function eyes(px, py) {
  const k = CELL / 36;
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px + s * 6 * k, py + 2 * k, 4.6 * k, 5.6 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1e33'; ctx.beginPath(); ctx.arc(px + s * 5.6 * k, py + 3.4 * k, 2.4 * k, 0, Math.PI * 2); ctx.fill();
  }
}
function puyo(x, y, c) {
  const px = x * CELL + CELL / 2, py = (y + OFF) * CELL + CELL / 2, r = CELL / 2 - 2;
  if (c === WALL) { // 壁: 石のブロック
    const s = CELL - 3, x0 = px - s / 2, y0 = py - s / 2, g = ctx.createLinearGradient(0, y0, 0, y0 + s);
    g.addColorStop(0, '#8089a0'); g.addColorStop(1, '#474d60');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(x0 + 3, y0 + s - 2); ctx.lineTo(x0 + s - 2, y0 + s - 2); ctx.lineTo(x0 + s - 2, y0 + 3); ctx.stroke();
    return;
  }
  ball(px, py, r, CSS[c]);
  if (c === IRON) { ctx.strokeStyle = '#8a90a2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r - 1, 0, Math.PI * 2); ctx.stroke(); }
  else if (c !== OJAMA) eyes(px, py);
}
function link(x, y, c, dx, dy) { // (x,y) から右/下の隣へ橋をかける
  const px = (x + .5) * CELL, py = (y + OFF + .5) * CELL, t = CELL * .5;
  ctx.fillStyle = CSS[c];
  if (dx) ctx.fillRect(px + CELL * .36, py - t / 2, CELL * .28 + (dx - 1) * CELL, t); else ctx.fillRect(px - t / 2, py + CELL * .36, t, CELL * .28 + (dy - 1) * CELL);
}
function paintField() {
  const w = COLS * CELL, h = VROWS * CELL, y0 = (OFF + ROWS - VROWS) * CELL, g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, '#1f2550'); g.addColorStop(1, '#10142d');
  ctx.fillStyle = g; ctx.fillRect(0, y0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = 0; y < VROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y0 + y * CELL, CELL, CELL);
  const cx = 2.5 * CELL, cy = y0 + .5 * CELL, d = CELL * .2; // 出現位置(3列目)のバツ印
  ctx.strokeStyle = 'rgba(255,90,90,.5)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(160,175,255,.4)'; ctx.lineWidth = 2; ctx.strokeRect(1, y0 + 1, w - 2, h - 2);
  ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(160,175,255,.3)'; ctx.strokeRect(1, OFF * CELL + 1, w - 2, CELL - 2); ctx.restore(); // 13段目
}
function paintBoard(b, hide) {
  const hid = hide || new Set(), shown = (x, y) => !hid.has(x + ',' + y);
  b.forEach((row, y) => row.forEach((c, x) => { if (c && shown(x, y)) { ctx.globalAlpha = y === 0 ? .55 : 1; puyo(x, y, c); ctx.globalAlpha = 1; } })); // 13段目は半透明
  b.forEach((row, y) => row.forEach((c, x) => {
    if (!c || c > 5 || y < 1 || !shown(x, y)) return;
    if (x + 1 < COLS && b[y][x + 1] === c && shown(x + 1, y)) link(x, y, c, 1, 0);
    if (y + 1 < ROWS && b[y + 1][x] === c && shown(x, y + 1)) link(x, y, c, 0, 1);
  }));
}
function draw() {
  syncOverlay();
  if (mode === 'edit') return drawEditor();
  ctx.clearRect(0, 0, cv.width, cv.height);
  paintField();
  const blink = st.blink && Math.floor((performance.now() - st.blinkT0) / 60) % 2;
  paintBoard(st.board, new Set(blink ? st.blink.map(([x, y]) => x + ',' + y) : []));
  (st.anim || []).forEach(a => puyo(a.x, a.y, a.c));
  const p = st.piece;
  if (p && st.phase === 'play') {
    // 次のマスへ落ちるまでの進行度で、なめらかに表示
    const frac = canFall(p) ? Math.min((keys.down ? st.softT / SOFT_MS : st.fallT / FALL_MS), 1) : 0;
    const cs = pieceCells(p);
    cs.forEach(([x, y, c]) => puyo(x, y + frac, c));
    const [a, b2] = cs;
    if (a[2] === b2[2]) { const [p1, p2] = a[0] < b2[0] || a[1] < b2[1] ? [a, b2] : [b2, a]; link(p1[0], p1[1] + frac, p1[2], p2[0] - p1[0], p2[1] - p1[1]); }
  }
}
const dotHTML = c => `<i class="dot" role="img" aria-label="${LETTER_NAMES[c]}" title="${LETTER_NAMES[c]}" style="background:${CSS[COLORS[c]]}"></i>`;
const goalHTML = g => g.color ? goalText(g).replace(LETTER_NAMES[g.color] + 'ぷよ', dotHTML(g.color) + 'ぷよ') : goalText(g); // 色名は丸の表示に置き換える
function info() {
  const g = st.prob.goal;
  $('goal').innerHTML = goalHTML(g);
  $('ovTitle').textContent = st.prob.title + (st.prob.difficulty ? `  ${starsOf(st.prob.difficulty)} ${DIFF_NAMES[st.prob.difficulty]}` : '');
  $('diff').textContent = st.prob.difficulty ? `${starsOf(st.prob.difficulty)} ${DIFF_NAMES[st.prob.difficulty]}` : ''; $('ovGoal').innerHTML = goalHTML(g);
  if (g.type === 'colorall') {
    const inTsumo = st.prob.tsumo.slice(st.idx).reduce((n, t) => n + t.filter(c => c === g.color).length, 0);
    $('prog').innerHTML = `${dotHTML(g.color)}ぷよ 残り${countColor(st.board, g.color) + inTsumo}匹` + (inTsumo ? `(ツモ内${inTsumo}匹を含む)` : '');
  } else if (g.type === 'ojamaall') $('prog').textContent = `お邪魔ぷよ 残り${st.board.flat().filter(c => c === OJAMA).length}匹`;
  else if (g.type === 'count') $('prog').innerHTML = `${dotHTML(g.color)}ぷよ ${st.cleared[COLORS[g.color]]}/${g.n}匹`;
  else $('prog').textContent = '';
  $('left').textContent = st.prob.tsumo.length - st.idx;
  $('chain').textContent = st.chain;
  $('next').innerHTML = st.prob.tsumo.slice(st.idx + 1).map(t =>
    `<span class="pair"><i class="dot" style="background:${CSS[COLORS[t[1]]]}"></i><i class="dot" style="background:${CSS[COLORS[t[0]]]}"></i></span>`
  ).join('') || '(なし)';
}
function render() { draw(); info(); }

// ---- イベント ----
document.addEventListener('keydown', e => {
  if (mode !== 'play' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (st.phase === 'ready') {
    if (k !== ' ' && k !== 'Enter') return;
    if (!e.repeat) startGame();
  }
  else if (k === 'Escape' || k === 'p' || k === 'P') { if (!e.repeat) togglePause(); }
  else if (k === 'ArrowLeft') move(-1);
  else if (k === 'ArrowRight') move(1);
  else if (k === 'ArrowUp' || k === 'z' || k === 'Z') { if (!e.repeat) rotate(-1); } // 左回転(反時計回り)
  else if (k === 'x' || k === 'X') { if (!e.repeat) rotate(1); }                    // 右回転(時計回り)
  else if (k === 'ArrowDown') { if (!e.repeat) setDown(true); }
  else if (k === ' ') { if (!e.repeat) hardDrop(); }
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', e => { if (e.key === 'ArrowDown') keys.down = false; });
$('bL').onclick = () => move(-1);
$('bR').onclick = () => move(1);
$('bRotL').onclick = () => rotate(-1);
$('bRotR').onclick = () => rotate(1);
$('bPause').onclick = togglePause;
$('ovStart').onclick = startGame;
$('pResume').onclick = resume;
$('pUndo').onclick = undo;
$('pRetry').onclick = () => loadProblem(st.prob);
window.addEventListener('blur', () => { keys.down = false; }); // フォーカスが外れると keyup が届かず、↓が押しっぱなしになるのを防ぐ
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button, input[type=checkbox], input[type=range]'); if (b) b.blur(); });
$('bDrop').onclick = hardDrop;
$('bDown').onpointerdown = () => setDown(true);
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('bDown').addEventListener(ev, () => { keys.down = false; }));
$('bUndo').onclick = undo;
$('bReset').onclick = () => loadProblem(st.prob);
$('sel').onchange = () => { mode === 'edit' ? editorSelect() : load($('sel').value); $('sel').blur(); };
fillSetSelect();
fillSelect();
load(0);
requestAnimationFrame(frame);
