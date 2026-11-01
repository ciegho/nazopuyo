// ===== エディタ: クリアチェック・解答の再生・投稿・やり直し/左右反転 =====
(() => {
  const chk = { snap: null, res: null, run: null };
  const snapNow = () => ed ? JSON.stringify(edProblem()) : '';
  const badge = (t, c) => { $('chkBadge').textContent = t; $('chkBadge').className = 'badge ' + c; };
  const pubMsg = (t, ng) => { $('pubMsg').textContent = t; $('pubMsg').style.color = ng ? 'var(--warn)' : 'var(--ok)'; };
  const solvable = () => chk.snap && chk.snap === snapNow() && chk.res && chk.res.wins + chk.res.early > 0;

  // ---- クリアチェック ----
  function show(res) {
    const total = res.wins + res.early;
    let b, cls = 'ok', msg;
    if (res.cancelled) { badge('中止', 'idle'); $('chkOut').textContent = ''; $('chkPlay').hidden = true; return; }
    if (!total) { b = res.timedOut ? '⚠ 時間切れ' : '❌ クリア不可'; cls = res.timedOut ? 'warn' : 'ng'; msg = res.timedOut ? '時間内に解を見つけられませんでした。手数を減らすと確認できます。' : 'どの置き方でも、クリア条件を満たせません。盤面・ツモ・条件を見直してください。'; }
    else if (res.early) { b = '⚠ 手数が余る'; cls = 'warn'; msg = `最後のツモを使う前にクリアできる置き方が${res.early}通りあります(手数が余っています)。`; }
    else if (res.wins === 1) { b = '✅ 唯一解'; msg = '正解は1通りです。'; }
    else { b = '⚠ 複数解'; cls = 'warn'; msg = `正解が${res.wins}通り${res.capped ? '以上' : ''}あります。`; }
    const sol = res.solutions[0] || res.earlySolution;
    const lines = [msg];
    if (sol) lines.push('解答の例', ...sol.map((m, i) => Solver.describe(m, i)));
    if (res.timedOut && total) lines.push('※時間切れのため、数は途中までの結果です');
    lines.push(`(${res.nodes.toLocaleString()}通りを${(res.ms / 1000).toFixed(1)}秒で確認)`);
    badge(b, cls); $('chkOut').textContent = lines.join('\n'); $('chkPlay').hidden = !sol;
  }
  $('chkRun').onclick = async () => {
    if (chk.run) { chk.run.cancel(); return; }
    if (!ed) return;
    const p = edProblem();
    if (!p.tsumo.length) return edMsg('ツモを1つ追加してください');
    if (p.tsumo.length > 5) return edMsg('クリアチェックは5手までです(手数が多いと時間がかかりすぎます)');
    $('chkRun').textContent = '■ 中止'; badge('調べています…', 'run'); $('chkOut').textContent = ''; $('chkPlay').hidden = true;
    const snap = JSON.stringify(p), pr = Solver.check(p, { maxWins: 30, timeMs: 25000, onProgress: n => badge(`調べています… ${n.toLocaleString()}`, 'run') });
    chk.run = pr; const res = await pr; chk.run = null;
    $('chkRun').textContent = '✔ クリアチェック';
    if (snap !== snapNow()) { badge('未チェック(変更あり)', 'idle'); return; } // 調べている間に編集された
    chk.snap = snap; chk.res = res; show(res); updatePost();
  };
  $('chkPlay').onclick = async () => { // 解答の例を、テストプレイ画面で自動再生する
    const res = chk.res, sol = res && (res.solutions[0] || res.earlySolution);
    if (!sol || chk.snap !== snapNow()) return;
    setMode('play'); if (mode !== 'play') return;
    loadProblem(edProblem()); startGame();
    const my = st, sleepMs = ms => new Promise(r => setTimeout(r, ms));
    for (const m of sol) {
      for (let i = 0; i < [0, 1, 2, 1][m.rot]; i++) { rotate(m.rot === 3 ? -1 : 1); await sleepMs(180); }
      for (let g = 0; g < 8 && st.piece && st.piece.x !== m.x; g++) { move(st.piece.x < m.x ? 1 : -1); await sleepMs(180); }
      await sleepMs(250); if (st !== my) return;
      hardDrop();
      for (let t = 0; t < 200 && st === my && st.phase === 'chain'; t++) await sleepMs(100);
      await sleepMs(300); if (st !== my) return;
    }
  };

  // ---- 投稿 ----
  const dest = Online.hasApi ? '投稿先: 「みんなの投稿」(オンライン。全員が遊べるようになります)' : Online.repo ? `投稿先: GitHub(${Online.repo})の Issue。管理者が確認して追加します` : 'このサイトは投稿先が未設定です(config.js を設定すると投稿できます)';
  $('pubDest').textContent = dest; $('pubReload').hidden = !Online.hasApi;
  try { $('pubName').value = localStorage.getItem('nazopuyo.name') || ''; } catch (e) { /* 無視 */ }
  let pubBusy = false;
  function updatePost() {
    const ok = solvable(), t = $('pubMsg').textContent;
    $('pubPost').disabled = !(ok && Online.canPost);
    if (!pubBusy && (!t || /クリアチェック/.test(t))) pubMsg(ok ? '' : 'クリアチェックで「クリアできる」と確認できると投稿できます', true);
  }
  $('pubPost').onclick = async () => {
    if (!solvable()) return;
    const p = edProblem(), meta = { author: ($('pubName').value.trim() || '名無し').slice(0, 12), comment: $('pubNote').value.trim().slice(0, 60) };
    try { localStorage.setItem('nazopuyo.name', meta.author); } catch (e) { /* 無視 */ }
    if (/^(新しい問題|無題)$/.test(p.title)) return pubMsg('タイトルを付けてください', true);
    const sol = chk.res.solutions[0];
    if (sol && sol.length === p.tsumo.length) p.answer = sol.map(m => [m.x, m.rot]);
    if (!Online.hasApi) { window.open(Online.issueUrl(p, meta), '_blank', 'noopener'); return pubMsg('GitHubの投稿画面を開きました。「Submit new issue」を押すと投稿できます'); }
    const wait = Online.waitSec();
    if (wait) return pubMsg(`あと${wait}秒お待ちください(連続投稿の制限)`, true);
    if (!confirm('この問題を「みんなの投稿」に公開します。公開後は自分では取り消せません。よろしいですか?')) return;
    pubBusy = true; $('pubPost').disabled = true; pubMsg('投稿しています…');
    try { await Online.post(p, meta); pubMsg('投稿しました!一覧への反映には最大1分ほどかかります'); setTimeout(() => Online.load(), 2000); }
    catch (e) { pubMsg(e.message === 'Failed to fetch' ? '通信に失敗しました。ネットワークを確認してください' : e.message, true); }
    pubBusy = false; updatePost();
  };
  $('pubReload').onclick = async () => { const ok = await Online.load(); pubMsg(ok ? `「みんなの投稿」を更新しました(${Online.count()}問)` : '読み込めませんでした', !ok); };

  // ---- 盤面のやり直し/やり直しの取り消し/左右反転 ----
  const hist = { u: [], r: [], ed: null };
  const snapB = () => JSON.stringify(ed.board);
  const push = () => { if (mode !== 'edit' || !ed) return; hist.u.push(snapB()); if (hist.u.length > 100) hist.u.shift(); hist.r.length = 0; };
  const restore = s => { ed.board = JSON.parse(s); edCheck(); draw(); };
  cv.addEventListener('pointerdown', push, true); // ペイントの直前の状態を保存
  for (const id of ['edClear', 'edGrav']) $(id).addEventListener('click', push, true);
  $('edUndo').onclick = () => { if (!ed || !hist.u.length) return; hist.r.push(snapB()); restore(hist.u.pop()); };
  $('edRedo').onclick = () => { if (!ed || !hist.r.length) return; hist.u.push(snapB()); restore(hist.r.pop()); };
  $('edMirror').onclick = () => { if (!ed) return; push(); ed.board = ed.board.map(r => r.slice().reverse()); edCheck(); draw(); };
  document.addEventListener('keydown', e => {
    if (mode !== 'edit' || !(e.ctrlKey || e.metaKey) || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { $('edUndo').onclick(); e.preventDefault(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { $('edRedo').onclick(); e.preventDefault(); }
  });

  // 変更があったらチェック結果を無効にする / 別の問題に切り替えたら履歴を捨てる
  setInterval(() => {
    if (!ed) return;
    if (hist.ed !== ed) { hist.ed = ed; hist.u.length = hist.r.length = 0; }
    if (chk.snap && chk.snap !== snapNow()) { chk.snap = null; chk.res = null; badge('未チェック(変更あり)', 'idle'); $('chkOut').textContent = ''; $('chkPlay').hidden = true; }
    if (!chk.snap && !chk.run && $('chkBadge').textContent === '') badge('未チェック', 'idle');
    updatePost();
  }, 400);
  badge('未チェック', 'idle'); pubMsg('クリアチェックで「クリアできる」と確認できると投稿できます', true);
})();
