// ===== エディタモード =====
if (typeof APP_VER === 'undefined' || APP_VER !== '24') { const m = 'main.js が古い(または読み込めていません)。全ファイルを最新版にそろえてください'; if (typeof showFatal === 'function') showFatal(m); throw new Error(m); }
const NAMES = { R: '赤', G: '緑', B: '青', Y: '黄', P: '紫' };
let ed = null;       // 編集中の問題 {title, board, tsumo, goal, src}
let brush = 'R';     // 選択中のぷよ('O'=お邪魔)
let painting = false;

// ---- モード切替 ----
function setMode(m) { // m: 'play' | 'edit' | 'vs'(対戦タブ。ゲーム自体は play モードで動く)
  if (vsActive && m !== 'vs') { vsNote('対戦中はタブを切り替えられません'); return; }
  mode = m === 'edit' ? 'edit' : 'play';
  document.body.classList.toggle('mode-edit', m === 'edit');
  document.body.classList.toggle('mode-vs', m === 'vs');
  $('tPlay').classList.toggle('on', m === 'play');
  $('tEdit').classList.toggle('on', m === 'edit');
  $('tVs').classList.toggle('on', m === 'vs');
  if (m !== 'edit') pause(); // 途中のプレイに戻るときはポーズ状態から
  if (m === 'edit') {
    Sound.pause();
    const v = $('sel').value;
    if (!ed || (!edDirty() && v !== '')) editorLoad(v || 0); // 未保存の編集が残っていればそれを続ける
    else $('sel').value = ed.src === null ? '' : ed.src;
  }
  vsTab(m === 'vs');
  draw();
}
$('tVs').onclick = () => setMode('vs');
$('tPlay').onclick = () => setMode('play');
$('tEdit').onclick = () => setMode('edit');

// ---- 問題データの出し入れ ----
const blankProblem = () => ({ title: '新しい問題', board: Array(VROWS).fill('.'.repeat(COLS)), tsumo: [['R', 'G']], goal: { type: 'chain', n: 2 } });
function editorLoad(i) { edSet(problems[i], +i); }
function edSet(p, src) {
  ed = { title: p.title, difficulty: p.difficulty || 0, board: parseBoard(p.board), tsumo: p.tsumo.map(t => [...t]), goal: { ...p.goal }, src };
  $('edTitle').value = ed.title; $('edDiff').value = ed.difficulty;
  $('edGoal').value = ed.goal.type; $('edN').value = ed.goal.n || 2;
  $('edCmp').value = goalCmp(ed.goal) || 'exact'; $('edColor').value = ed.goal.color || 'R';
  readGoal();
  buildTsumo(); edCheck();
  ed.snap = JSON.stringify(edProblem());
  $('sel').value = src === null ? '' : src;
  draw();
}
const edProblem = () => ({ title: ed.title.trim() || '無題', board: boardToStrings(ed.board), tsumo: ed.tsumo.map(t => [...t]), goal: { ...ed.goal }, ...(ed.difficulty ? { difficulty: ed.difficulty } : {}) });
function validProblem(p) {
  return p && Array.isArray(p.board) && (p.board.length === VROWS || p.board.length === ROWS) &&
    p.board.every(r => typeof r === 'string' && r.length === COLS && /^[.RGBYPOWIH]+$/.test(r)) &&
    Array.isArray(p.tsumo) && p.tsumo.every(t => Array.isArray(t) && /^[RGBYP]$/.test(t[0]) && /^[RGBYP]$/.test(t[1])) &&
    validGoal(p.goal);
}
const edMsg = s => { $('edmsg').textContent = s; };

// 盤面のチェック(浮きぷよ・すでに連結している箇所)
function edCheck() {
  const b = ed.board, w = [];
  const t = cloneBoard(b); applyGravity(t); // 壁の上に乗っているぷよは浮いていない扱い
  const floating = JSON.stringify(t) !== JSON.stringify(b);
  if (floating) w.push('宙に浮いているぷよがあります(プレイ時は初手の設置後に落ちます)');
  if (findGroups(b).length) w.push('すでに4つ以上つながっている箇所があります');
  const g = ed.goal;
  if (g.type === 'colorall' && !b.flat().includes(COLORS[g.color]) && !ed.tsumo.some(t => t.includes(g.color))) w.push('指定した色のぷよが盤面にもツモにもありません');
  if (g.type === 'ojamaall' && !b.flat().includes(OJAMA)) w.push('お邪魔ぷよが盤面にありません');
  edMsg(w.join(' / '));
}

// ---- フォーム ----
const swatches = [['R'], ['G'], ['B'], ['Y'], ['P'], ['O'], ['I'], ['W'], ['.']];
swatches.forEach(([k]) => {
  const b = document.createElement('button');
  b.className = 'sw' + (k === brush ? ' on' : '');
  if (k === '.') { b.textContent = '消'; b.style.background = '#fff'; b.style.fontSize = '12px'; }
  else b.style.background = CSS[COLORS[k]];
  if (k === 'W') { b.textContent = '壁'; b.style.color = '#fff'; b.style.fontSize = '12px'; b.style.borderRadius = '6px'; b.title = '壁(落ちない・消えない)'; }
  if (k === 'I') { b.textContent = '鉄'; b.style.color = '#fff'; b.style.fontSize = '12px'; b.title = '鉄ぷよ(落ちるが消えない)'; }
  b.onclick = () => { brush = k; [...$('palette').children].forEach(c => c.classList.toggle('on', c === b)); };
  $('palette').append(b);
});
$('edDiff').onchange = e => { ed.difficulty = +e.target.value; };
$('edTitle').oninput = e => { ed.title = e.target.value; };
// フォームの内容を ed.goal に反映
function readGoal() {
  const t = $('edGoal').value;
  const n = Math.min(t === 'colors' ? 5 : 99, Math.max(1, +$('edN').value || 1));
  const cmp = $('edCmp').value;
  ed.goal = t === 'allclear' || t === 'ojamaall' ? { type: t } : t === 'colorall' ? { type: t, color: $('edColor').value } : t === 'count' ? { type: t, color: $('edColor').value, n, cmp } : { type: t, n, cmp };
  $('edN').style.display = $('edCmp').style.display = t === 'allclear' || t === 'colorall' || t === 'ojamaall' ? 'none' : '';
  $('edColorPick').style.display = t === 'count' || t === 'colorall' ? '' : 'none';
  [...$('edColorPick').children].forEach(c => c.classList.toggle('on', c.dataset.k === $('edColor').value));
}
['edGoal', 'edColor', 'edCmp'].forEach(id => { $(id).onchange = readGoal; });
$('edN').oninput = readGoal;

// 色を赤・緑…の丸ボタンで選ぶ(漢字の選択肢の代わり)
function colorPick(val, on) {
  const box = document.createElement('span'); box.className = 'pick';
  for (const k in NAMES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw sm' + (k === val ? ' on' : ''); b.style.background = CSS[COLORS[k]];
    b.title = NAMES[k]; b.setAttribute('aria-label', NAMES[k]);
    b.onclick = () => { [...box.children].forEach(c => c.classList.toggle('on', c === b)); on(k); };
    box.append(b);
  }
  return box;
}
// クリア条件の色(隠した select と丸ボタンを連動させる)
for (const k in NAMES) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'sw sm'; b.style.background = CSS[COLORS[k]]; b.dataset.k = k; b.title = NAMES[k]; b.setAttribute('aria-label', NAMES[k]);
  b.onclick = () => { $('edColor').value = k; readGoal(); };
  $('edColorPick').append(b);
}
function buildTsumo() {
  const box = $('tsumoList'); box.innerHTML = '';
  ed.tsumo.forEach((t, i) => {
    const row = document.createElement('div'); row.className = 'trow';
    const del = document.createElement('button'); del.textContent = '×';
    del.onclick = () => { ed.tsumo.splice(i, 1); buildTsumo(); };
    row.append(`${i + 1}手目 軸`, colorPick(t[0], v => { t[0] = v; }), ' 子', colorPick(t[1], v => { t[1] = v; }), del);
    box.append(row);
  });
}
$('edAdd').onclick = () => { ed.tsumo.push(['R', 'G']); buildTsumo(); };

// ---- 盤面のペイント ----
function cellAt(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) * cv.width / r.width / CELL);
  const y = Math.floor((e.clientY - r.top) * cv.height / r.height / CELL) - OFF;
  return x >= 0 && x < COLS && y >= 0 && y < ROWS ? [x, y] : null;
}
function paint(e, erase) {
  const c = cellAt(e);
  if (!c) return;
  ed.board[c[1]][c[0]] = erase || brush === '.' ? 0 : COLORS[brush];
  edCheck(); draw();
}
let erasing = false;
cv.addEventListener('pointerdown', e => {
  if (mode !== 'edit') return;
  painting = true; erasing = e.button === 2;
  cv.setPointerCapture(e.pointerId); paint(e, erasing);
});
cv.addEventListener('pointermove', e => { if (painting) paint(e, erasing); });
cv.addEventListener('pointerup', () => { painting = false; });
cv.addEventListener('contextmenu', e => { if (mode === 'edit') e.preventDefault(); });

function drawEditor() {
  if (!ed) return;
  edState();
  ctx.clearRect(0, 0, cv.width, cv.height);
  paintField();
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * CELL, OFF * CELL); ctx.lineTo(x * CELL, (OFF + ROWS) * CELL); }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, (OFF + y) * CELL); ctx.lineTo(COLS * CELL, (OFF + y) * CELL); }
  ctx.stroke();
  paintBoard(ed.board);
}

// ---- 未保存の検出・状態表示 ----
const edDirty = () => !!ed && JSON.stringify(edProblem()) !== ed.snap;
const edDiscardOk = () => !edDirty() || confirm('未保存の変更があります。破棄しますか?');
let lastState = '';
function edState() {
  const s = sets[curSet], dirty = edDirty();
  const where = ed.src === null ? '新規(未保存)' : `${ed.src + 1}/${problems.length}問目`;
  const t = `${s.name} ▸ ${where}${s.builtin ? ' 【組み込み・保存は自作セットへ】' : ''}${dirty ? ' ● 未保存の変更あり' : ' ✓ 保存済み'}`;
  if (t === lastState) return;
  lastState = t; $('edState').textContent = t; $('edState').style.color = dirty ? '#b45309' : '#15803d';
}
window.addEventListener('beforeunload', e => { if (edDirty()) { e.preventDefault(); e.returnValue = ''; } });

// ---- セットの切り替え・管理 ----
const refreshTargets = () => {
  const t = $('edTarget'), v = t.value; t.innerHTML = '';
  sets.forEach((s, i) => { if (!s.builtin) t.add(new Option(s.name, i)); });
  if ([...t.options].some(o => o.value === v)) t.value = v;
};
const refreshSets = () => { fillSetSelect(); refreshTargets(); };
function switchSet(i) {
  selectSet(i); refreshTargets();
  if (mode === 'edit') editorLoad(0); else { ed = null; load(0); }
}
function editorSelect() { // 問題セレクトの変更(エディタ中)
  if (!edDiscardOk()) { $('sel').value = ed.src === null ? '' : ed.src; return; }
  editorLoad($('sel').value);
}
$('setSel').onchange = () => {
  if (!edDiscardOk()) { $('setSel').value = curSet; return; }
  switchSet(+$('setSel').value); $('setSel').blur();
};
function uniqueName(name, self) {
  let n = name, k = 2;
  while (sets.some(s => s !== self && s.name === n)) n = `${name} (${k++})`;
  return n;
}
const customOnly = () => sets[curSet].builtin ? (edMsg('組み込みセットは変更できません'), true) : false;
$('setNew').onclick = () => {
  if (!edDiscardOk()) return;
  const name = prompt('新しいセットの名前', '自作セット');
  if (!name || !name.trim()) return;
  sets.push({ name: uniqueName(name.trim()), problems: [blankProblem()] });
  saveSets(); switchSet(sets.length - 1);
  edMsg('セットを作りました(空の問題を1つ入れてあります)');
};
$('setRename').onclick = () => {
  if (customOnly()) return;
  const s = sets[curSet], name = prompt('セットの名前', s.name);
  if (!name || !name.trim()) return;
  s.name = uniqueName(name.trim(), s); saveSets(); refreshSets();
};
$('setDel').onclick = () => {
  if (customOnly()) return;
  const s = sets[curSet];
  if (!confirm(`セット「${s.name}」(${s.problems.length}問)を削除しますか?\n元に戻せません。必要なら先に「セット書き出し」をしてください。`)) return;
  sets.splice(curSet, 1); saveSets(); switchSet(Math.max(0, curSet - 1));
};

// ---- ファイルの書き出し・読み込み ----
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('setExport').onclick = () => {
  const s = sets[curSet];
  download(s.name, JSON.stringify({ format: 'nazopuyo-set', v: 1, name: s.name, problems: s.problems }, null, 1));
  edMsg(`「${s.name}」を書き出しました`);
};
$('setExportAll').onclick = () => {
  const list = sets.filter(s => !s.builtin).map(s => ({ name: s.name, problems: s.problems }));
  if (!list.length) return edMsg('自作セットがありません');
  download('nazopuyo-backup', JSON.stringify({ format: 'nazopuyo-backup', v: 1, sets: list }, null, 1));
  edMsg(`自作セット${list.length}個をバックアップしました`);
};
$('setImport').onclick = () => $('setFile').click();
$('setFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt);
    const raw = Array.isArray(d) ? [{ problems: d }] : d && Array.isArray(d.sets) ? d.sets
      : d && Array.isArray(d.problems) ? [d] : validProblem(d) ? [{ problems: [d] }] : null;
    if (!raw) throw new Error('なぞぷよのファイルではありません');
    let skipped = 0; const added = [];
    for (const r of raw) {
      const ps = (r.problems || []).filter(p => { const ok = validProblem(p) && p.tsumo.length > 0; if (!ok) skipped++; return ok; })
        .map(p => ({ title: String(p.title || '無題'), board: p.board, tsumo: p.tsumo, goal: p.goal, ...(p.difficulty >= 1 && p.difficulty <= 5 ? { difficulty: p.difficulty | 0 } : {}) }));
      if (ps.length) added.push({ name: r.name || f.name.replace(/\.json$/i, ''), problems: ps });
    }
    if (!added.length) throw new Error('読み込める問題がありません');
    if (!edDiscardOk()) return;
    added.forEach(s => sets.push({ name: uniqueName(String(s.name)), problems: s.problems }));
    saveSets(); switchSet(sets.length - 1);
    edMsg(`${added.length}セット(${added.reduce((n, s) => n + s.problems.length, 0)}問)を読み込みました` + (skipped ? `。形式が不正な${skipped}問は除外しました` : ''));
  }).catch(err => edMsg('読み込めません: ' + err.message));
};

// ---- 問題の保存・削除・整理 ----
$('edNew').onclick = () => { if (edDiscardOk()) edSet(blankProblem(), null); };
$('edGrav').onclick = () => { applyGravity(ed.board); edCheck(); draw(); };
$('edClear').onclick = () => { ed.board = createBoard(); edCheck(); draw(); };
$('edTest').onclick = () => {
  if (!ed.tsumo.length) return edMsg('ツモを1つ以上追加してください');
  setMode('play'); loadProblem(edProblem()); // 浮いたぷよは初手の設置後に落ちる
};
function saveProblem(asNew) {
  const p = edProblem();
  if (!p.tsumo.length) return edMsg('ツモを1つ以上追加してください');
  if (asNew) { p.title += ' (コピー)'; ed.title = p.title; $('edTitle').value = p.title; }
  const overwrite = !asNew && !sets[curSet].builtin && ed.src !== null;
  if (sets[curSet].builtin) { // 組み込みは上書きせず、最初の自作セット(なければ「自作」)に入れる
    let ti = sets.findIndex(s => !s.builtin);
    if (ti < 0) { sets.push({ name: '自作', problems: [] }); ti = sets.length - 1; }
    selectSet(ti);
  }
  if (overwrite) problems[ed.src] = p; else { problems.push(p); ed.src = problems.length - 1; }
  const ok = saveSets();
  refreshSets(); fillSelect(); $('sel').value = ed.src;
  ed.snap = JSON.stringify(edProblem());
  edMsg(ok ? `「${sets[curSet].name}」に保存しました(このブラウザに保存)` : '保存に失敗しました。「セット書き出し」でファイルに残してください');
}
$('edSave').onclick = () => saveProblem(false);
$('edDup').onclick = () => saveProblem(true);
$('edDel').onclick = () => {
  if (sets[curSet].builtin || ed.src === null) return edMsg('削除できるのは保存済みの自作問題だけです');
  if (problems.length <= 1) return edMsg('セットの最後の1問は削除できません(セットごと削除してください)');
  if (!confirm(`「${problems[ed.src].title}」を削除しますか?`)) return;
  const i = ed.src;
  problems.splice(i, 1); saveSets(); refreshSets(); fillSelect();
  editorLoad(Math.min(i, problems.length - 1));
  edMsg('削除しました');
};
function edShift(d) {
  if (sets[curSet].builtin || ed.src === null) return edMsg('並べ替えできるのは保存済みの自作問題だけです');
  const i = ed.src, j = i + d;
  if (j < 0 || j >= problems.length) return;
  [problems[i], problems[j]] = [problems[j], problems[i]];
  ed.src = j; saveSets(); fillSelect(); $('sel').value = j;
}
$('edUp').onclick = () => edShift(-1);
$('edDown').onclick = () => edShift(1);
function edCopyTo(move) {
  const ti = +$('edTarget').value;
  if (!sets[ti] || sets[ti].builtin) return edMsg('コピー先のセットがありません。先にセットを作ってください');
  if (move) {
    if (sets[curSet].builtin || ed.src === null) return edMsg('移動できるのは保存済みの自作問題だけです');
    if (ti === curSet) return edMsg('同じセットです');
    if (problems.length <= 1) return edMsg('セットの最後の1問は移動できません');
  }
  sets[ti].problems.push(edProblem()); // 編集中の内容をそのまま入れる
  if (move) problems.splice(ed.src, 1);
  saveSets(); refreshSets();
  if (move) { selectSet(ti); editorLoad(problems.length - 1); }
  else { fillSelect(); $('sel').value = ed.src === null ? '' : ed.src; }
  edMsg(`「${sets[ti].name}」に${move ? '移動' : 'コピー'}しました`);
}
$('edCopy').onclick = () => edCopyTo(false);
$('edMove').onclick = () => edCopyTo(true);
$('edExport').onclick = () => { $('json').value = JSON.stringify(edProblem(), null, 1); };
$('edImport').onclick = () => {
  if (!edDiscardOk()) return;
  try {
    const p = JSON.parse($('json').value);
    if (!validProblem(p)) throw new Error('形式が正しくありません');
    edSet({ title: p.title || '無題', ...p }, null); edMsg('読み込みました');
  } catch (e) { edMsg('読み込めません: ' + e.message); }
};

refreshTargets();
