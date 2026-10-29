// 問題の自動生成+「正解が1通り」の検証。使い方: node tools/gen.js [シード] → problems_gen.js を出力
// 流れ: ①連鎖を逆向きに組み立てる → ②上のぷよを取り除いてツモにする → ③全手順を総当たりして正解が1通りか確認
const fs = require('fs'), path = require('path'), L = require('../logic.js');
const { COLS, ROWS, applyGravity, findGroups, clearGroups, groupStats, goalMet, goalText, boardToStrings, fits, lockPiece, cloneBoard, createBoard } = L;
let seed = +process.argv[2] || 20260101;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
const LET = ' RGBYP', MAXH = 9;
const SHAPES = [[[0,0],[1,0],[2,0],[3,0]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[2,0],[1,1]], [[0,0],[1,0],[1,1],[2,1]], [[1,0],[2,0],[0,1],[1,1]], [[0,0],[1,0],[2,0],[0,1]], [[0,0],[1,0],[2,0],[2,1]]];
const rotShape = (s, r) => { for (let i = 0; i < r; i++) { s = s.map(([x, y]) => [-y, x]); const mx = Math.min(...s.map(c => c[0])), my = Math.min(...s.map(c => c[1])); s = s.map(([x, y]) => [x - mx, y - my]); } return s; };
const toBoard = cols => { const b = createBoard(); cols.forEach((c, x) => c.forEach((v, h) => { b[ROWS - 1 - h][x] = v; })); return b; };

function resolve(b) { // アプリと同じ連鎖処理(固定直後の重力→消去の繰り返し)
  const cleared = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, steps = [], groups = []; let chain = 0;
  applyGravity(b);
  for (let g = findGroups(b); g.length; g = findGroups(b)) {
    chain++; const s = groupStats(b, g); steps.push(s.colors); groups.push(g.length);
    for (const c in s.counts) cleared[c] += s.counts[c];
    clearGroups(b, g); applyGravity(b);
  }
  return { chain, steps, groups, cleared };
}
function insert(cols, shape, x0, h0, color) { // 連鎖の1段を「逆向き」に差し込む(上のぷよは押し上げられる)
  const P = {};
  for (const [dx, dh] of shape) (P[x0 + dx] = P[x0 + dx] || []).push(h0 + dh);
  const out = cols.map(c => [...c]);
  for (const xs in P) {
    const x = +xs, hs = new Set(P[x]), total = cols[x].length + hs.size;
    if (Math.max(...hs) >= total || total > MAXH) return null;
    let ei = 0; out[x] = Array.from({ length: total }, (_, h) => hs.has(h) ? color : cols[x][ei++]);
  }
  return out;
}
const verify = (cols, k) => { const b = toBoard(cols); if (findGroups(b).length !== 1) return false; const r = resolve(b); return r.chain === k && r.groups.every(n => n === 1); };
const onTop = (a, b) => b.every((c, x) => c.slice(0, a[x].length).join() === a[x].join()); // 既存のぷよを押し上げず、一番上に載っているか
const topDiff = (a, b) => { const g = {}; b.forEach((c, x) => { if (c.length > a[x].length) g[x] = c.length - a[x].length; }); return g; };
function skeleton(k, withFill) {
  let cols = Array.from({ length: COLS }, () => []), prev = 0, g1cells = [];
  for (let step = 0; step < k; step++) {
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      const sh = rotShape(pick(SHAPES), ri(4)), w = Math.max(...sh.map(c => c[0])) + 1, color = pick([1, 2, 3, 4, 5].filter(c => c !== prev));
      const x0 = ri(COLS - w + 1), h0 = ri(6), nx = insert(cols, sh, x0, h0, color);
      if (nx && verify(nx, step + 1)) { if (step === k - 1) g1cells = sh.map(([dx, dh]) => [x0 + dx, h0 + dh]); cols = nx; prev = color; ok = true; } // 最後に組むグループ=最初に消える引き金
    }
    if (!ok) return null;
  }
  for (let i = withFill ? ri(5) : 0; i > 0; i--) { // 目くらまし用の余分なぷよを上に置く(N=4では置かない)
    const x = ri(COLS); if (cols[x].length >= MAXH) continue;
    const nx = cols.map(c => [...c]); nx[x].push(ri(5) + 1); if (verify(nx, k)) cols = nx;
  }
  const g1 = {}; // 引き金グループのうち、列の一番上に出ているぷよの数(ここにツモが載って連鎖が始まる)
  cols.forEach((c, x) => { let run = 0; for (let h = c.length - 1; h >= 0 && g1cells.some(([cx, ch]) => cx === x && ch === h); h--) run++; if (run) g1[x] = run; });
  return { cols, g1 };
}
function peel(cols, N, g1) { // 上から2個ずつ取り除いて、N手分のツモにする
  const c = cols.map(a => [...a]), moves = [];
  for (let j = 0; j < N; j++) {
    const opts = [];
    for (let x = 0; x < COLS; x++) if (c[x].length >= 2) opts.push(['v', x]);
    for (let x = 0; x < COLS - 1; x++) if (c[x].length && c[x + 1].length) opts.push(['h', x]);
    if (!opts.length) return null;
    const use = j === 0 ? opts.filter(([t, x]) => t === 'v' ? g1[x] > 0 : (g1[x] > 0 || g1[x + 1] > 0)) : opts; // 最後の手は、連鎖の引き金になるぷよを含める
    if (!use.length) return null;
    const [t, x] = pick(use), flip = ri(2);
    if (j === 0) { if (t === 'v') g1[x] = Math.max(0, g1[x] - 2); else { g1[x] = Math.max(0, (g1[x] || 0) - 1); g1[x + 1] = Math.max(0, (g1[x + 1] || 0) - 1); } }
    if (t === 'v') { const lo = c[x].splice(-2, 2), [d, u] = lo; moves.unshift(flip ? { a: u, c: d, x, rot: 2 } : { a: d, c: u, x, rot: 0 }); }
    else { const A = c[x].pop(), B = c[x + 1].pop(); moves.unshift(flip ? { a: B, c: A, x: x + 1, rot: 3 } : { a: A, c: B, x, rot: 1 }); }
  }
  return { cols: c, moves };
}
function place(b, m) { // 即落下で置く(アプリの hardDrop と同じ)
  const p = { x: m.x, y: 0, rot: m.rot, a: m.a, c: m.c };
  if (!fits(b, p)) return false;
  while (fits(b, { ...p, y: p.y + 1 })) p.y++;
  return lockPiece(b, p);
}
function options(b, a, c) { // 置き方の一覧(結果が同じ置き方は1つにまとめる)
  const seen = new Set(), out = [];
  for (let rot = 0; rot < 4; rot++) for (let x = 0; x < COLS; x++) {
    const nb = cloneBoard(b);
    if (!place(nb, { x, rot, a, c })) continue;
    const key = nb.map(r => r.join('')).join('');
    if (!seen.has(key)) { seen.add(key); out.push({ nb, x, rot }); }
  }
  return out;
}
// 勝てる手順の数を数える(2以上で打ち切り)。途中で勝てる/最後の手以外で勝てる場合は 9 を返す
function slowCount(b, ts, goal, idx, cleared, st) {
  let wins = 0;
  for (const o of options(b, ...ts[idx])) {
    const r = resolve(o.nb); st.nodes++;
    if (idx === 0 && r.chain > 0) st.decoys++;
    const cl = {}; for (const c in cleared) cl[c] = cleared[c] + r.cleared[c];
    const res = { chain: r.chain, steps: r.steps, cleared: cl, board: o.nb, pending: ts.slice(idx + 1) };
    if (goalMet(goal, res)) { if (idx < ts.length - 1) return 9; wins++; }
    else if (!o.nb[1][2] && idx + 1 < ts.length) wins += slowCount(o.nb, ts, goal, idx + 1, cl, st);
    if (wins >= 2) return wins;
  }
  return wins;
}

// ---- 高速版の探索(探索専用。論理は logic.js と同じ: 13段目は連結しない・固定後に重力) ----
const W = COLS, H = ROWS, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const flat = b => { const a = new Int8Array(H * W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = b[y][x]; return a; };
const freeF = (a, x, y) => x >= 0 && x < W && y < H && (y < 0 || a[y * W + x] === 0);
function gravityF(a) { for (let x = 0; x < W; x++) { let w = H - 1; for (let y = H - 1; y >= 0; y--) { const v = a[y * W + x]; if (v) { if (w !== y) { a[w * W + x] = v; a[y * W + x] = 0; } w--; } } } }
const stk = new Int16Array(H * W), ord = new Int16Array(H * W), seenF = new Int32Array(H * W); let stamp = 0;
function resolveF(a) {
  const cleared = [0, 0, 0, 0, 0, 0], steps = []; let chain = 0;
  gravityF(a);
  for (;;) {
    stamp++; let ol = 0, mask = 0;
    for (let i = W; i < H * W; i++) {
      const c = a[i]; if (!c || seenF[i] === stamp) continue;
      const start = ol; let sp = 0; stk[sp++] = i; seenF[i] = stamp;
      while (sp) {
        const j = stk[--sp], x = j % W, y = (j / W) | 0; ord[ol++] = j;
        if (x > 0 && a[j - 1] === c && seenF[j - 1] !== stamp) { seenF[j - 1] = stamp; stk[sp++] = j - 1; }
        if (x < W - 1 && a[j + 1] === c && seenF[j + 1] !== stamp) { seenF[j + 1] = stamp; stk[sp++] = j + 1; }
        if (y > 1 && a[j - W] === c && seenF[j - W] !== stamp) { seenF[j - W] = stamp; stk[sp++] = j - W; }
        if (y < H - 1 && a[j + W] === c && seenF[j + W] !== stamp) { seenF[j + W] = stamp; stk[sp++] = j + W; }
      }
      if (ol - start >= 4) { mask |= 1 << c; cleared[c] += ol - start; } else ol = start;
    }
    if (!ol) break;
    chain++; steps.push(mask.toString(2).split('1').length - 1);
    for (let k = 0; k < ol; k++) a[ord[k]] = 0;
    gravityF(a);
  }
  return { chain, steps, cleared };
}
function placeF(a, x, rot, ca, cc) {
  const dx = DX[rot], dy = DY[rot]; let y = 0;
  if (!freeF(a, x, y) || !freeF(a, x + dx, y + dy)) return false;
  while (freeF(a, x, y + 1) && freeF(a, x + dx, y + dy + 1)) y++;
  if (y >= 0) a[y * W + x] = ca; if (y + dy >= 0) a[(y + dy) * W + x + dx] = cc;
  return true;
}
function fastCount(P, ts, goal, st) { // 勝てる手順の数(2以上で打ち切り。最後の手以外で勝てるなら 9)
  const exact = L.goalCmp(goal) === 'exact', ok = (v, n) => exact ? v === n : v >= n, col = goal.color ? L.COLORS[goal.color] : 0;
  const pend = ts.map((_, i) => ts.slice(i + 1).some(t => t.includes(col)));
  function rec(a, idx, cleared) {
    let wins = 0; const seen = new Set();
    for (let rot = 0; rot < 4; rot++) for (let x = 0; x < W; x++) {
      const b = a.slice();
      if (!placeF(b, x, rot, ts[idx][0], ts[idx][1])) continue;
      const key = b.toString(); if (seen.has(key)) continue; seen.add(key);
      const r = resolveF(b); st.nodes++;
      if (idx === 0 && r.chain > 0) st.decoys++;
      const cl = cleared.map((v, i) => v + r.cleared[i]);
      const w = goal.type === 'chain' ? ok(r.chain, goal.n) : goal.type === 'colors' ? r.steps.some(k => ok(k, goal.n))
        : goal.type === 'count' ? ok(cl[col], goal.n) : goal.type === 'colorall' ? !b.includes(col) && !pend[idx] : b.every(v => !v);
      if (w) { if (idx < ts.length - 1) return 9; wins++; }
      else if (!b[W + 2] && idx + 1 < ts.length) wins += rec(b, idx + 1, cl);
      if (wins >= 2) return wins;
    }
    return wins;
  }
  return rec(flat(P), 0, [0, 0, 0, 0, 0, 0]);
}

const STAT = { sk: 0, peel: 0, groups: 0, place: 0, early: 0, chain: 0, r0: 0, r2: 0, r9: 0, ok: 0 };
function make(N, k) {
  const sk = skeleton(k, N < 4); if (!sk) { STAT.sk++; return null; }
  const pl = peel(sk.cols, N, sk.g1); if (!pl) { STAT.peel++; return null; }
  const P = toBoard(pl.cols);
  if (findGroups(P).length || pl.cols.some(c => c.length > MAXH)) { STAT.groups++; return null; }
  const ts = pl.moves.map(m => [m.a, m.c]); // 軸・子の色番号
  // 想定手順を実際に置いて、最後の手で k 連鎖になるか確認
  const b = cloneBoard(P); let last = null, cleared = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let j = 0; j < N; j++) {
    if (!place(b, pl.moves[j])) { STAT.place++; return null; }
    last = resolve(b); for (const c in cleared) cleared[c] += last.cleared[c];
    if (j < N - 1 && last.chain) { STAT.early++; return null; }
  }
  if (last.chain !== k) { STAT.chain++; return null; }
  const letters = ts.map(([a, c]) => [LET[a], LET[c]]);
  const cand = [{ type: 'chain', n: k }];
  if (Math.max(...last.steps) >= 2) cand.push({ type: 'colors', n: Math.max(...last.steps) });
  for (let c = 1; c <= 5; c++) {
    if (cleared[c] >= 6) cand.push({ type: 'count', color: LET[c], n: cleared[c] });
    if (L.countColor(b, LET[c]) === 0 && L.countColor(P, LET[c]) > 0 && !ts.slice(0, -1).some(t => t.includes(c)) === false) { /* 何もしない */ }
    if (L.countColor(b, LET[c]) === 0 && L.countColor(P, LET[c]) > 0) cand.push({ type: 'colorall', color: LET[c] });
  }
  if (b.every(r => r.every(v => !v))) cand.push({ type: 'allclear' });
  const order = rnd() < 0.55 ? [cand[0], ...cand.slice(1).sort(() => rnd() - .5)] : cand.slice().sort(() => rnd() - .5);
  for (const goal of order.slice(0, 3)) {
    const st = { nodes: 0, decoys: 0 };
    const wc = fastCount(P, ts, goal, st); STAT[wc === 1 ? 'ok' : wc === 9 ? 'r9' : wc >= 2 ? 'r2' : 'r0']++;
    if (wc === 1) {
      const cells = P.flat().filter(v => v).length;
      const raw = 1.5 * (N - 2) + 0.9 * (k - 1) + (goal.type === 'chain' ? 0 : 0.6) + Math.min(st.decoys, 10) * 0.15 + cells * 0.03;
      return { board: boardToStrings(P), tsumo: letters, goal, raw, N, answer: pl.moves.map(m => [m.x, m.rot]) };
    }
  }
  return null;
}

if (require.main === module && !process.env.NOGEN) {
  // 使い方: node tools/gen.js [シード] [手数(例 2,3,4)] [制限秒] ... 成功した問題は tools/pool.json に溜まり、毎回 problems_gen.js を作り直す
  const POOL = path.join(__dirname, 'pool.json');
  const pool = fs.existsSync(POOL) ? JSON.parse(fs.readFileSync(POOL, 'utf8')) : [];
  const QUOTA = { 2: 16, 3: 16, 4: 12 }, KS = { 2: [2, 2, 3], 3: [2, 3, 3, 4], 4: [3, 4, 4, 5] };
  const Ns = (process.argv[3] || '2,3,4').split(',').map(Number), limit = (+process.argv[4] || 60) * 1000;
  const keys = new Set(pool.map(p => p.board.join('|') + JSON.stringify(p.tsumo)));
  for (const N of Ns) {
    const t0 = Date.now(); let n = pool.filter(p => p.N === N).length, tries = 0;
    while (n < QUOTA[N] && Date.now() - t0 < limit) {
      tries++; const p = make(N, pick(KS[N]));
      if (!p) continue;
      const key = p.board.join('|') + JSON.stringify(p.tsumo);
      if (keys.has(key)) continue;
      keys.add(key); pool.push(p); n++;
      fs.writeFileSync(POOL, JSON.stringify(pool));
      console.error(`${N}手 ${n}/${QUOTA[N]} (試行${tries}回) ${goalText(p.goal)}`);
    }
  }
  // 難しさ(★1〜5)は、全問題の中での順位で割り当てる
  const sorted = [...pool].sort((a, b) => a.raw - b.raw);
  sorted.forEach((p, i) => { p.difficulty = 1 + Math.floor(i / sorted.length * 5); });
  const sets = [2, 3, 4].map(N => {
    const ps = pool.filter(p => p.N === N).sort((a, b) => a.raw - b.raw);
    return { name: `${N}手で解く`, problems: ps.map((p, i) => ({ title: `${N}手 #${String(i + 1).padStart(2, '0')}`, board: p.board, tsumo: p.tsumo, goal: p.goal, difficulty: p.difficulty, answer: p.answer })) };
  }).filter(s => s.problems.length);
  const body = sets.map(s => `  { name: ${JSON.stringify(s.name)}, problems: [\n${s.problems.map(p => '    ' + JSON.stringify(p)).join(',\n')}\n  ] }`).join(',\n');
  fs.writeFileSync(path.join(__dirname, '..', 'problems_gen.js'), `// 自動生成(tools/gen.js)。すべて「正解が1通り」であることをプログラムで総当たり検証済み。\n// difficulty: 1〜5 / answer: 想定解 [[軸の列(0〜5), 向き(0=子が上,1=右,2=下,3=左)], ...]\nconst GEN_SETS = [\n${body}\n];\n`);
  console.error('done', pool.length, sets.map(x => `${x.name}:${x.problems.length}`).join(' '));
}
module.exports = { STAT, make, fastCount, slowCount, flat, resolveF, resolve, toBoard };
