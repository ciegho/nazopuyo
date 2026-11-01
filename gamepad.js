// ===== ゲームパッド対応(PS4/PS5 など。ブラウザの標準マッピングを使用) =====
if (typeof APP_VER === 'undefined' || APP_VER !== '24') { const m = 'main.js が古い(または読み込めていません)。全ファイルを最新版にそろえてください'; if (typeof showFatal === 'function') showFatal(m); throw new Error(m); }

// ボタン番号(PS4: 0=✕ 1=○ 2=□ 3=△ 4=L1 5=R1 7=R2 8=Share 9=Options 13=十字下 14=十字左 15=十字右)。好みで変えてください
const PAD = { rotL: [0, 2], rotR: [1, 3], drop: [5, 7], undo: [4], retry: [8], pause: [9], start: [0, 1, 9] };
const PAD_DAS = 170, PAD_ARR = 55; // 左右の長押しリピート: 最初の待ち / 以降の間隔(ms)

let padPrev = {}, padDir = 0, padNext = 0, padDown = false, padSeen = null;
const padStat = t => { const el = document.getElementById('padStat'); if (el) el.textContent = t; };
const padOf = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g && g.connected && g.buttons.length >= 10);

function padFrame(now) {
  const g = padOf();
  if (!!g !== padSeen) { padSeen = !!g; padStat(g ? '🎮 コントローラ接続中' : '🎮 未接続(ボタンを押すと認識されます)'); }
  if (g) {
    const down = {};
    g.buttons.forEach((b, i) => { down[i] = !!b && (b.pressed || b.value > 0.6); });
    const hit = list => list.some(i => down[i] && !padPrev[i]);
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    const left = down[14] || ax < -0.55, right = down[15] || ax > 0.55, soft = down[13] || ay > 0.65;
    if (mode === 'play' && !document.hidden) padAct(now, hit, left, right, soft);
    padPrev = down;
  }
  requestAnimationFrame(padFrame);
}
function padAct(now, hit, left, right, soft) {
  const ph = st.phase;
  if (ph === 'ready') { if (hit(PAD.start)) startGame(); return; }
  if (ph !== 'play') {
    padDir = 0; if (padDown) { setDown(false); padDown = false; }
    if (vsActive) return;
    if (ph === 'paused' && (hit(PAD.pause) || hit([0]))) resume();
    else if (hit(PAD.undo)) undo();
    else if (hit(PAD.retry)) loadProblem(st.prob);
    return;
  }
  const d = left && !right ? -1 : right && !left ? 1 : 0;
  if (d !== padDir) { padDir = d; if (d) { move(d); padNext = now + PAD_DAS; } }
  else if (d && now >= padNext) { move(d); padNext = now + PAD_ARR; }
  if (soft && !padDown) { setDown(true); padDown = true; }
  else if (!soft && padDown) { setDown(false); padDown = false; }
  if (hit(PAD.rotL)) rotate(-1);
  if (hit(PAD.rotR)) rotate(1);
  if (hit(PAD.drop)) hardDrop();
  if (!vsActive && hit(PAD.pause)) togglePause();
  if (!vsActive && hit(PAD.undo)) undo();
}
window.addEventListener('gamepaddisconnected', () => { pause(); });
requestAnimationFrame(padFrame);
