// ===== タッチ操作(スマホ・タブレット) =====
if (typeof APP_VER === 'undefined' || APP_VER !== '21') { const m = 'main.js が古い(または読み込めていません)。全ファイルを最新版にそろえてください'; if (typeof showFatal === 'function') showFatal(m); throw new Error(m); }

// ←/→ボタン: 押している間は繰り返し移動(クリックでは1マスだけだった)
function holdRepeat(id, dir) {
  const b = $(id); let t = null, r = null;
  const stop = () => { clearTimeout(t); clearInterval(r); t = r = null; };
  b.onclick = null;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); stop(); move(dir);
    t = setTimeout(() => { r = setInterval(() => move(dir), 55); }, 170);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, stop));
}
holdRepeat('bL', -1); holdRepeat('bR', 1);

// 盤面のジェスチャー: 左右にドラッグ=移動 / タップ=回転(左半分=左回転・右半分=右回転) / 下にドラッグ=ゆっくり落下 / 下にはじく=即落下
let tg = null;
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play' || e.pointerType === 'mouse') return;
  cv.setPointerCapture(e.pointerId);
  tg = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, t0: performance.now(), acc: 0, moved: false, soft: false };
});
cv.addEventListener('pointermove', e => {
  if (!tg || e.pointerId !== tg.id) return;
  const step = cv.getBoundingClientRect().width / COLS * 0.85;
  tg.acc += e.clientX - tg.lx; tg.lx = e.clientX;
  while (Math.abs(tg.acc) >= step) { const d = tg.acc > 0 ? 1 : -1; move(d); tg.acc -= d * step; tg.moved = true; }
  const dx = e.clientX - tg.x0, dy = e.clientY - tg.y0;
  if (dy > 28 && dy > Math.abs(dx)) { if (!tg.soft) { tg.soft = true; setDown(true); } tg.moved = true; }
  else if (tg.soft && dy < 14) { tg.soft = false; setDown(false); }
});
function endTouch(e) {
  if (!tg || e.pointerId !== tg.id) return;
  const dt = performance.now() - tg.t0, dx = e.clientX - tg.x0, dy = e.clientY - tg.y0;
  if (tg.soft) setDown(false);
  if (e.type === 'pointerup') {
    if (!tg.moved && dt < 350 && Math.hypot(dx, dy) < 14) { const r = cv.getBoundingClientRect(); rotate(e.clientX < r.left + r.width / 2 ? -1 : 1); }
    else if (dy > 90 && dy / Math.max(dt, 1) > 0.45 && dy > Math.abs(dx) * 1.5) hardDrop(); // 速く(約450px/秒以上)下にはじいたとき
  }
  tg = null;
}
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
document.addEventListener('gesturestart', e => e.preventDefault()); // iOS: ピンチ拡大を防ぐ
document.addEventListener('contextmenu', e => { if (mode !== 'edit' && e.target.closest && e.target.closest('.pad, .acts, #stage')) e.preventDefault(); }); // 長押しメニューを出さない
