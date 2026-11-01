// ===== クリアチェック用の探索(ブラウザ/Node 両対応。盤面のルールは logic.js と同じ) =====
// 使い方: const r = await Solver.check(問題, { onProgress, maxWins, timeMs })  → { wins, early, solutions, ... }
//   wins  = 最後のツモでクリアできる置き方の数(結果が同じ置き方は1つにまとめる) / early = 途中のツモでクリアできる数(手数が余る)
const Solver = (() => {
  const W = 6, H = 13, OJ = 6, WALL = 7, IRON = 8, LETTERS = '.RGBYPOWI';
  const parse = rows => { // 12行(13段目は空)または13行(先頭が13段目)の文字列 → 平らな配列
    const a = new Int8Array(H * W), off = Math.max(0, H - rows.length);
    rows.forEach((r, i) => { for (let x = 0; x < W; x++) a[(i + off) * W + x] = r[x] === 'H' ? WALL : Math.max(0, LETTERS.indexOf(r[x])); });
    return a;
  };
  const stk = new Int16Array(H * W), ord = new Int16Array(H * W), seen = new Int32Array(H * W); let stamp = 0;
  function gravity(a) { // 壁は動かない。壁で区切られた区間ごとに下へ詰める
    for (let x = 0; x < W; x++) {
      let top = H;
      for (let y = H - 1; y >= -1; y--) {
        if (y !== -1 && a[y * W + x] !== WALL) continue;
        let w = top - 1;
        for (let k = top - 1; k > y; k--) { const v = a[k * W + x]; if (v) { if (w !== k) { a[w * W + x] = v; a[k * W + x] = 0; } w--; } }
        top = y;
      }
    }
  }
  const bits = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };
  function resolve(a) { // 固定直後の重力 → 消去 → 重力 … を繰り返す。13段目は連結しない。お邪魔は隣のぷよが消えると消える
    const cleared = [0, 0, 0, 0, 0, 0, 0, 0, 0], steps = []; let chain = 0;
    gravity(a);
    for (;;) {
      stamp++; let ol = 0, mask = 0;
      for (let i = W; i < H * W; i++) {
        const c = a[i]; if (c < 1 || c > 5 || seen[i] === stamp) continue;
        const start = ol; let sp = 0; stk[sp++] = i; seen[i] = stamp;
        while (sp) {
          const j = stk[--sp], x = j % W, y = (j / W) | 0; ord[ol++] = j;
          if (x > 0 && a[j - 1] === c && seen[j - 1] !== stamp) { seen[j - 1] = stamp; stk[sp++] = j - 1; }
          if (x < W - 1 && a[j + 1] === c && seen[j + 1] !== stamp) { seen[j + 1] = stamp; stk[sp++] = j + 1; }
          if (y > 1 && a[j - W] === c && seen[j - W] !== stamp) { seen[j - W] = stamp; stk[sp++] = j - W; }
          if (y < H - 1 && a[j + W] === c && seen[j + W] !== stamp) { seen[j + W] = stamp; stk[sp++] = j + W; }
        }
        if (ol - start >= 4) { mask |= 1 << c; cleared[c] += ol - start; } else ol = start;
      }
      if (!ol) break;
      chain++; steps.push(bits(mask));
      for (let k = 0; k < ol; k++) a[ord[k]] = 0;
      for (let k = 0; k < ol; k++) {
        const j = ord[k], x = j % W, y = (j / W) | 0;
        if (x > 0 && a[j - 1] === OJ) a[j - 1] = 0;
        if (x < W - 1 && a[j + 1] === OJ) a[j + 1] = 0;
        if (y > 1 && a[j - W] === OJ) a[j - W] = 0;
        if (y < H - 1 && a[j + W] === OJ) a[j + W] = 0;
      }
      gravity(a);
    }
    return { chain, steps, cleared };
  }
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const free = (a, x, y) => x >= 0 && x < W && y < H && (y < 0 || a[y * W + x] === 0);
  function place(a, x, rot, ca, cc) { // 13段目から真下に落として固定(アプリの即落下と同じ)。14段目にはみ出したぷよは消える
    const dx = DX[rot], dy = DY[rot]; let y = 0;
    if (!free(a, x, y) || !free(a, x + dx, y + dy)) return false;
    while (free(a, x, y + 1) && free(a, x + dx, y + dy + 1)) y++;
    if (y >= 0) a[y * W + x] = ca; if (y + dy >= 0) a[(y + dy) * W + x + dx] = cc;
    return true;
  }
  function makeGoal(g) {
    const def = { chain: 'exact', colors: 'atleast', count: 'atleast' }, exact = (g.cmp || def[g.type]) === 'exact';
    const ok = (v, n) => exact ? v === n : v >= n, col = g.color ? LETTERS.indexOf(g.color) : 0;
    return (r, cl, b, pendHas) => {
      switch (g.type) {
        case 'chain': return ok(r.chain, g.n);
        case 'colors': return r.steps.some(k => ok(k, g.n));
        case 'count': return ok(cl[col], g.n);
        case 'colorall': return !b.includes(col) && !pendHas;
        case 'ojamaall': return !b.includes(OJ);
        case 'allclear': return b.every(v => v === 0 || v === WALL || v === IRON);
      }
      return false;
    };
  }
  function* rec(c, a, idx, cl) {
    const keys = new Set();
    for (let rot = 0; rot < 4; rot++) for (let x = 0; x < W; x++) {
      const b = a.slice();
      if (!place(b, x, rot, c.ts[idx][0], c.ts[idx][1])) continue;
      const key = b.toString(); if (keys.has(key)) continue; keys.add(key);
      c.path.push({ x, rot });
      const r = resolve(b); c.nodes++; if ((c.nodes & 1023) === 0) yield;
      const cl2 = cl.map((v, i) => v + r.cleared[i]);
      if (c.win(r, cl2, b, c.pend[idx])) {
        if (idx === c.ts.length - 1) { c.wins++; if (c.sols.length < 3) c.sols.push(c.path.slice()); }
        else { c.early++; if (!c.esol.length) c.esol.push(c.path.slice()); } // 途中でクリアした時点で終わり
      } else if (!b[W + 2] && idx + 1 < c.ts.length) yield* rec(c, b, idx + 1, cl2); // 3列目の12段目が埋まったら窒息
      c.path.pop();
      if (c.wins + c.early >= c.maxWins || c.cancel) return;
    }
  }
  function check(problem, opts = {}) {
    const col = problem.goal.color ? LETTERS.indexOf(problem.goal.color) : 0;
    const c = { ts: problem.tsumo.map(t => [LETTERS.indexOf(t[0]), LETTERS.indexOf(t[1])]), nodes: 0, wins: 0, early: 0, sols: [], esol: [], path: [], maxWins: opts.maxWins || 30, cancel: false, win: makeGoal(problem.goal) };
    c.pend = c.ts.map((_, i) => col > 0 && c.ts.slice(i + 1).some(t => t.includes(col)));
    const t0 = Date.now(), limit = opts.timeMs || 25000; let timedOut = false;
    const p = new Promise(res => {
      const gen = rec(c, parse(problem.board), 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const done = () => res({ wins: c.wins, early: c.early, solutions: c.sols, earlySolution: c.esol[0] || null, nodes: c.nodes, ms: Date.now() - t0, capped: c.wins + c.early >= c.maxWins, timedOut, cancelled: c.cancel });
      (function step() {
        const s = Date.now();
        for (;;) { if (gen.next().done) return done(); if (Date.now() - s > 12) break; }
        if (c.cancel) return done();
        if (Date.now() - t0 > limit) { timedOut = true; return done(); }
        if (opts.onProgress) opts.onProgress(c.nodes);
        setTimeout(step, 0);
      })();
    });
    p.cancel = () => { c.cancel = true; };
    return p;
  }
  const ROT_TEXT = ['縦(子が上)', '横(子が右)', '縦(子が下)', '横(子が左)'];
  const describe = (m, i) => `${i + 1}手目: 左から${m.x + 1}列目(軸)に ${ROT_TEXT[m.rot]}`;
  return { check, describe, parse, resolve, place, gravity };
})();
if (typeof module !== 'undefined') module.exports = Solver;
