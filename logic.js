// ===== ロジック(画面に依存しない) =====
// 盤面は13行。y=0 が13段目(幽霊ぷよの段)、y=1 が12段目(一番上の見える段)、y=12 が1段目。14段目以上のぷよは消える
const COLS = 6, VROWS = 12, ROWS = 13;
const COLORS = { R: 1, G: 2, B: 3, Y: 4, P: 5, O: 6, W: 7, I: 8, H: 7 }; // O=お邪魔, W=壁, I=鉄ぷよ (H=旧名の壁。読み込み用)
const OJAMA = 6;
const WALL = 7; // 壁: 落ちない・消えない
const IRON = 8; // 鉄ぷよ: 落ちるが消えない
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const createBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const cloneBoard = b => b.map(r => [...r]);
const LETTERS = '.RGBYPOWI';
// 12行(1〜12段目)の文字列。13段目にぷよがあるときだけ、先頭に13段目を足した13行にする
const boardToStrings = b => (b[0].some(c => c) ? b : b.slice(1)).map(r => r.map(c => LETTERS[c]).join(''));
const isEmpty = b => b.every(r => r.every(c => c === 0 || c === WALL || c === IRON)); // 壁・鉄ぷよは消せないので数えない

// 文字列配列 → 盤面。'.'=空
function parseBoard(rows) {
  const b = createBoard();
  const off = Math.max(0, ROWS - rows.length); // 12行なら13段目は空。13行なら先頭が13段目
  rows.forEach((r, i) => [...r].forEach((ch, x) => { b[i + off][x] = COLORS[ch] || 0; }));
  return b;
}

// 壁は動かない。壁で区切られた各区間の中で、ぷよ(鉄ぷよ含む)を下に詰める
function applyGravity(b) {
  for (let x = 0; x < COLS; x++) {
    let top = ROWS; // いまの区間の下端(この行は含まない)
    for (let y = ROWS - 1; y >= -1; y--) {
      if (y !== -1 && b[y][x] !== WALL) continue;
      const seg = [];
      for (let k = top - 1; k > y; k--) if (b[k][x]) seg.push(b[k][x]);
      for (let k = top - 1, i = 0; k > y; k--, i++) b[k][x] = seg[i] || 0;
      top = y;
    }
  }
}

function findGroups(b) {
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups = [];
  for (let y = 1; y < ROWS; y++) for (let x = 0; x < COLS; x++) { // 13段目(y=0)のぷよは連結・消去の対象外
    const c = b[y][x];
    if (!c || c === OJAMA || c === WALL || c === IRON || seen[y][x]) continue;
    const group = [], stack = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      group.push([cx, cy]);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= COLS || ny < 1 || ny >= ROWS) continue;
        if (seen[ny][nx] || b[ny][nx] !== c) continue;
        seen[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
    if (group.length >= 4) groups.push(group);
  }
  return groups;
}

// グループを消し、隣接するお邪魔ぷよも消す
function clearGroups(b, groups) {
  for (const g of groups) for (const [x, y] of g) {
    b[y][x] = 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < COLS && ny >= 1 && ny < ROWS && b[ny][nx] === OJAMA) b[ny][nx] = 0;
    }
  }
}

// アニメーションなしで連鎖を最後まで処理(テスト用)
function resolveChain(b) {
  let chain = 0;
  applyGravity(b);
  for (let g = findGroups(b); g.length; g = findGroups(b)) {
    chain++; clearGroups(b, g); applyGravity(b);
  }
  return chain;
}

// ツモ: {x,y:軸の位置(yは盤面の行、負なら盤面の上), rot:0上/1右/2下/3左(子の位置), a:軸の色, c:子の色}
function pieceCells(p) {
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.rot];
  return [[p.x, p.y, p.a], [p.x + dx, p.y + dy, p.c]];
}
// そのツモが盤面の壁・床・ぷよと重ならないか
function fits(b, p) {
  return pieceCells(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !b[y][x]));
}
// ツモを盤面に固定。14段目(y<0)にはみ出したぷよは消える。常に true
function lockPiece(b, p) {
  const cs = pieceCells(p);
  cs.forEach(([x, y, c]) => { if (y >= 0) b[y][x] = c; });
  return true;
}

// ===== クリア条件 =====
// goal: {type:'chain', n} / {type:'colors', n} / {type:'count', color:'R', n} / {type:'colorall', color:'R'} / {type:'allclear'}
//       cmp: 'exact'(ちょうど) | 'atleast'(以上)  省略時は GOAL_CMP_DEFAULT
const LETTER_NAMES = { R: '赤', G: '緑', B: '青', Y: '黄', P: '紫' };
const GOAL_CMP_DEFAULT = { chain: 'exact', colors: 'atleast', count: 'atleast' };
const goalCmp = g => g.cmp || GOAL_CMP_DEFAULT[g.type];

function goalText(g) {
  const ex = goalCmp(g) === 'exact';
  switch (g.type) {
    case 'chain': return ex ? `${g.n}連鎖するべし` : `${g.n}連鎖以上するべし`;
    case 'colors': return ex ? `ちょうど${g.n}色同時に消すべし` : `${g.n}色同時に消すべし`;
    case 'count': return `${LETTER_NAMES[g.color]}ぷよ${g.n}匹${ex ? 'ちょうど' : ''}消すべし`;
    case 'colorall': return `${LETTER_NAMES[g.color]}ぷよを全て消すべし`;
    case 'ojamaall': return 'お邪魔ぷよを全て消すべし';
    case 'allclear': return 'ぷよを全て消すべし';
  }
  return '';
}
function validGoal(g) {
  if (!g) return false;
  if (g.type === 'allclear' || g.type === 'ojamaall') return true;
  if (g.type === 'colorall') return /^[RGBYP]$/.test(g.color);
  if (!(g.n >= 1) || (g.cmp && g.cmp !== 'exact' && g.cmp !== 'atleast')) return false;
  if (g.type === 'chain') return true;
  if (g.type === 'colors') return g.n <= 5;
  return g.type === 'count' && /^[RGBYP]$/.test(g.color);
}
// 消えるグループの色数・色ごとの個数(お邪魔は含まない)。消す前の盤面で呼ぶ
function groupStats(b, groups) {
  const counts = {};
  for (const gr of groups) { const c = b[gr[0][1]][gr[0][0]]; counts[c] = (counts[c] || 0) + gr.length; }
  return { colors: Object.keys(counts).length, counts };
}
// 盤面にある指定色のぷよの数
const countColor = (b, letter) => b.reduce((n, r) => n + r.filter(c => c === COLORS[letter]).length, 0);
// res: {chain:連鎖数, steps:[各連鎖で同時に消えた色数], cleared:{色番号:累計消去数}, board, pending:[これから置くツモ]}
function goalMet(g, res) {
  const ok = (a, n) => goalCmp(g) === 'exact' ? a === n : a >= n;
  switch (g.type) {
    case 'chain': return ok(res.chain, g.n);
    case 'colors': return res.steps.some(k => ok(k, g.n));
    case 'count': return ok(res.cleared[COLORS[g.color]] || 0, g.n);
    case 'colorall': // 盤面にその色がなく、これから置くツモにも含まれない
      return countColor(res.board, g.color) === 0 && !(res.pending || []).some(t => t.includes(g.color));
    case 'ojamaall': return !res.board.some(r => r.includes(OJAMA)); // 盤面(13段目も含む)にお邪魔ぷよが1つもない
    case 'allclear': return isEmpty(res.board);
  }
  return false;
}

if (typeof module !== 'undefined') module.exports = { goalCmp, cloneBoard, countColor, VROWS, applyGravity, findGroups, clearGroups, COLORS, COLS, ROWS, parseBoard, resolveChain, goalText, goalMet, groupStats, validGoal, boardToStrings, pieceCells, fits, lockPiece, createBoard };
