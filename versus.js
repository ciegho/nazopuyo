// ===== オンライン対戦(WebRTC P2P・サーバー不要。接続コードを手動で交換する) =====
if (typeof APP_VER === 'undefined' || APP_VER !== '21') { const m = 'main.js が古い(または読み込めていません)。全ファイルを最新版にそろえてください'; if (typeof showFatal === 'function') showFatal(m); throw new Error(m); }

const VS_T = { step: 1000, next: 800, retry: 900, grace: 1500 }; // カウント1回/次の問題まで/失敗後のやり直し/判定の猶予(ms)
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const vs = { role: null, pc: null, ch: null, open: false, oppName: '相手', active: false, mid: 0, probs: [], N: 0, solved: 0, oppSolved: 0,
  t0: 0, doneMs: null, oppDoneMs: null, decided: false, grace: null, timer: null, result: '', msg: '' };
let vsOn = false; // 対戦タブを表示中か
let myName = 'プレイヤー';
try { myName = localStorage.getItem('nazopuyo.name') || myName; } catch (e) { /* 無視 */ }
$('vsName').value = myName;
$('vsName').oninput = e => {
  myName = e.target.value.trim().slice(0, 12) || 'プレイヤー';
  try { localStorage.setItem('nazopuyo.name', myName); } catch (err) { /* 無視 */ }
};
const fmt = v => Number.isFinite(v) ? `${Math.floor(v / 60000)}:${String(Math.floor(v / 1000) % 60).padStart(2, '0')}.${Math.floor(v / 100) % 10}` : '未完了';

// ---- 接続コード(SDPを圧縮して文字列にする) ----
const b64 = u8 => { let s = ''; u8.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pack(desc) {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp });
  if (typeof CompressionStream === 'function') {
    const z = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'Z.' + b64(new Uint8Array(await new Response(z).arrayBuffer()));
  }
  return 'P.' + b64(new TextEncoder().encode(json));
}
async function unpack(code) {
  code = code.replace(/\s+/g, '');
  const kind = code.slice(0, 2), body = code.slice(2);
  let json;
  if (kind === 'Z.') {
    if (typeof DecompressionStream !== 'function') throw new Error('このブラウザは圧縮コードを読めません(Chrome/Edgeの最新版を使ってください)');
    const z = new Blob([unb64(body)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    json = await new Response(z).text();
  } else if (kind === 'P.') json = new TextDecoder().decode(unb64(body));
  else throw new Error('接続コードの形式が違います');
  const d = JSON.parse(json);
  if (!d || (d.t !== 'offer' && d.t !== 'answer') || typeof d.s !== 'string') throw new Error('接続コードが不正です');
  return { type: d.t, sdp: d.s };
}
function gathered(pc) { // ICE候補の収集が終わるまで待つ(コードに候補を全部含めるため)
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const f = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', f); res(); } };
    pc.addEventListener('icegatheringstatechange', f);
    setTimeout(res, 6000);
  });
}

// ---- 通信(ここだけ差し替えれば中継サーバー方式にもできる) ----
const send = o => { if (vs.ch && vs.ch.readyState === 'open') vs.ch.send(JSON.stringify(o)); };
function newPc() {
  const pc = new RTCPeerConnection(ICE);
  pc.onconnectionstatechange = () => { if (pc === vs.pc && pc.connectionState === 'failed') onLost('接続に失敗しました(ネットワークによってはつながらないことがあります)'); };
  return pc;
}
function setupChannel(ch) {
  vs.ch = ch;
  ch.onopen = () => { if (ch !== vs.ch) return; vs.open = true; vs.msg = ''; send({ t: 'hello', name: myName }); ui(); };
  ch.onclose = () => { if (ch === vs.ch) onLost('相手との接続が切れました'); };
  ch.onmessage = e => { if (ch === vs.ch) onMsg(e.data); };
}
function vsClose() {
  clearTimeout(vs.grace); clearInterval(vs.timer);
  const { ch, pc } = vs;
  vs.ch = vs.pc = null; vs.role = null; vs.open = false; vs.active = false; vsActive = false; vs.mid++;
  vs.result = ''; vs.oppName = '相手'; $('vsOut').value = ''; $('vsIn').value = '';
  try { ch && ch.close(); } catch (e) { /* 無視 */ }
  try { pc && pc.close(); } catch (e) { /* 無視 */ }
}
function onLost(text) {
  if (!vs.role) return;
  const was = vs.active && !vs.decided;
  if (vs.active) endMatchUI();
  vsClose();
  vs.msg = text;
  if (was) vs.result = '相手が切断しました\nあなたの勝ち扱いです';
  vsBannerSync(); ui();
}
function onMsg(raw) {
  let m; try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'hello') vs.oppName = String(m.name || '相手').slice(0, 12);
  else if (m.t === 'start' && vs.role === 'guest' && !vs.active) {
    const ps = (Array.isArray(m.problems) ? m.problems : []).slice(0, 100).filter(p => validProblem(p) && p.tsumo.length)
      .map(p => ({ title: String(p.title || '無題'), board: p.board, tsumo: p.tsumo, goal: p.goal }));
    if (ps.length) begin(ps);
  }
  else if (m.t === 'prog' && vs.active) vs.oppSolved = Math.max(0, Math.min(vs.N, m.solved | 0));
  else if (m.t === 'done' && vs.role === 'host' && vs.active && Number.isFinite(+m.ms)) { vs.oppDoneMs = +m.ms; arbitrate(); }
  else if (m.t === 'result' && vs.role === 'guest' && vs.active) showResult(m);
  ui();
}

// ---- 部屋の作成・参加 ----
const noRtc = () => typeof RTCPeerConnection !== 'function' && (vs.msg = 'このブラウザはWebRTCに対応していません', ui(), true);
$('vsHost').onclick = async () => {
  if (noRtc()) return;
  vsClose(); vs.role = 'host'; vs.msg = '接続コードを作っています…'; ui();
  try {
    vs.pc = newPc(); setupChannel(vs.pc.createDataChannel('g'));
    await vs.pc.setLocalDescription(await vs.pc.createOffer());
    await gathered(vs.pc);
    $('vsOut').value = await pack(vs.pc.localDescription);
    vs.msg = '';
  } catch (e) { vs.msg = 'エラー: ' + e.message; }
  ui();
};
$('vsJoin').onclick = () => {
  if (noRtc()) return;
  vsClose(); vs.role = 'guest'; vs.msg = ''; ui();
  vs.pc = newPc(); vs.pc.ondatachannel = e => setupChannel(e.channel);
};
$('vsApply').onclick = async () => {
  const pc = vs.pc;
  if (!pc) return;
  try {
    const desc = await unpack($('vsIn').value);
    if (vs.role === 'host') {
      if (desc.type !== 'answer') throw new Error('これは参加者のコードではありません(ホストのコードを貼っていませんか?)');
      await pc.setRemoteDescription(desc); vs.msg = '接続中…';
    } else {
      if (desc.type !== 'offer') throw new Error('これはホストのコードではありません');
      await pc.setRemoteDescription(desc);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      $('vsOut').value = await pack(pc.localDescription);
      vs.msg = '出てきた「自分のコード」をホストに送ってください';
    }
  } catch (e) { vs.msg = 'エラー: ' + e.message; }
  ui();
};
$('vsCopy').onclick = () => {
  const t = $('vsOut'); t.select && t.select();
  if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => { vs.msg = 'コピーしました'; ui(); }, () => {});
};
$('vsLeave').onclick = () => { vsClose(); vsBannerSync(); ui(); };

// ---- 対戦の進行 ----
function vsBannerSync() { // 盤面に重ねる表示(対戦中は空)
  if (!vsOn) vsBanner = '';
  else if (!vs.active) vsBanner = vs.result || '対戦待ち…';
}
function vsTab(on) {
  vsOn = on;
  if (on) fillVsSets();
  vsBannerSync(); ui();
}
function vsNote(s) { vs.msg = s; ui(); }
function fillVsSets() {
  const s = $('vsSetSel'), v = s.value; s.innerHTML = '';
  sets.forEach((x, i) => s.add(new Option(x.name + ` (${x.problems.length}問)`, i)));
  s.value = v !== '' ? v : curSet;
  if (!$('vsCount').value) $('vsCount').value = sets[+s.value].problems.length;
}
$('vsSetSel').onchange = () => { $('vsCount').value = sets[+$('vsSetSel').value].problems.length; };
$('vsStart').onclick = () => {
  if (vs.role !== 'host' || !vs.open || vs.active) return;
  let ps = sets[+$('vsSetSel').value].problems.filter(p => validProblem(p) && p.tsumo.length);
  if ($('vsShuffle').checked) ps = ps.map(p => [Math.random(), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  ps = ps.slice(0, Math.max(1, Math.min(100, +$('vsCount').value || ps.length)));
  if (!ps.length) { vs.msg = '出題できる問題がありません'; return ui(); }
  ps = ps.map(p => ({ title: String(p.title || '無題'), board: p.board, tsumo: p.tsumo, goal: p.goal }));
  send({ t: 'start', problems: ps });
  begin(ps);
};
async function begin(probs) {
  clearTimeout(vs.grace);
  vs.probs = probs; vs.N = probs.length; vs.solved = 0; vs.oppSolved = 0;
  vs.doneMs = vs.oppDoneMs = null; vs.decided = false; vs.result = ''; vs.msg = '';
  const mid = ++vs.mid;
  vs.active = true; vsActive = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 入力欄にフォーカスが残ると操作できない
  if (!vsOn) setMode('vs');
  ui();
  for (const n of [3, 2, 1]) {
    vsBanner = String(n); Sound.se('move');
    await sleep(VS_T.step);
    if (vs.mid !== mid) return;
  }
  vsBanner = ''; vs.t0 = performance.now();
  loadProblem(probs[0]); // vsActive が true なので自動で開始される
  clearInterval(vs.timer); vs.timer = setInterval(() => { if (vs.doneMs == null) $('vsTime').textContent = fmt(performance.now() - vs.t0); }, 100);
}
// 1問の結果(main.js の judge / lock から呼ばれる)
async function vsJudge(ok) {
  if (!vs.active || !vs.t0) return;
  const mid = vs.mid, my = st;
  if (ok) {
    vs.solved++; send({ t: 'prog', solved: vs.solved }); ui();
    if (vs.solved >= vs.N) return vsFinish();
    await sleep(VS_T.next);
    if (vs.mid === mid && vs.active) loadProblem(vs.probs[vs.solved]);
  } else { // 失敗: 同じ問題をやり直す(時間は進み続ける)
    await sleep(VS_T.retry);
    if (vs.mid === mid && vs.active && st === my) loadProblem(vs.probs[vs.solved]);
  }
}
onJudge = vsJudge;
function vsFinish() {
  vs.doneMs = Math.round(performance.now() - vs.t0);
  clearInterval(vs.timer); $('vsTime').textContent = fmt(vs.doneMs);
  vsBanner = '判定中…';
  if (vs.role === 'host') arbitrate(); else send({ t: 'done', ms: vs.doneMs });
}
// 判定はホストが行う。先に終えた側の通知から猶予時間だけ待ち、両方そろえば経過時間の短いほうが勝ち
function arbitrate() {
  if (vs.decided) return;
  if (vs.doneMs != null && vs.oppDoneMs != null) return decide();
  clearTimeout(vs.grace); vs.grace = setTimeout(decide, VS_T.grace);
}
function decide() {
  if (vs.decided || !vs.active) return;
  vs.decided = true; clearTimeout(vs.grace);
  const h = vs.doneMs, g = vs.oppDoneMs;
  const winner = h != null && (g == null || h < g) ? 'host' : g != null && (h == null || g < h) ? 'guest' : 'draw';
  const res = { t: 'result', winner, hostMs: h, guestMs: g };
  send(res); showResult(res);
}
function endMatchUI() {
  vs.active = false; vsActive = false; vs.mid++;
  clearInterval(vs.timer); clearTimeout(vs.grace);
  loadProblem(st.prob); // 進行中の盤面を止めて待機状態に戻す
}
function showResult(res) {
  const host = vs.role === 'host';
  const me = host ? res.hostMs : res.guestMs, op = host ? res.guestMs : res.hostMs;
  const win = res.winner === vs.role;
  const head = res.winner === 'draw' ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE...';
  vs.result = `${head}\nあなた ${fmt(me)}\n${vs.oppName} ${fmt(op)}`;
  endMatchUI(); vsBannerSync();
  Sound.se(res.winner === 'draw' ? 'pause' : win ? 'clear' : 'fail');
  ui();
}

function ui() {
  const guestWait = vs.role === 'guest' && vs.open && !vs.active ? 'ホストが開始するのを待っています' : '';
  $('vsStatus').textContent = !vs.role ? '未接続' : vs.open ? `接続中 ✓ 相手: ${vs.oppName}` : vs.role === 'host' ? '相手の接続待ち…' : '接続準備中…';
  $('vsHint').textContent = vs.role === 'host'
    ? '① 「自分のコード」を相手に送る ② 相手から返ってきたコードを「相手のコード」に貼って「適用」'
    : '① ホストのコードを「相手のコード」に貼って「適用」 ② 出てきた「自分のコード」をホストに送る';
  $('vsConn').hidden = vs.open;
  $('vsHost').hidden = $('vsJoin').hidden = !!vs.role;
  $('vsCodes').hidden = !vs.role;
  $('vsLeave').hidden = !vs.role || vs.active;
  $('vsHostOpts').hidden = !(vs.role === 'host' && vs.open && !vs.active);
  $('vsProg').hidden = !(vs.active || vs.result);
  $('vsMy').textContent = `${vs.solved}/${vs.N}問クリア`;
  $('vsOpp').textContent = `${vs.oppName} ${vs.oppSolved}/${vs.N}問クリア`;
  $('vsMsg').textContent = vs.msg || guestWait;
}
