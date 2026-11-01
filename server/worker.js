// ===== 問題の投稿API(Cloudflare Workers + KV)。サーバーを自分で用意しなくても動きます =====
// 設定(ダッシュボードで): KV の名前空間を変数名 PROBLEMS で連結 / 秘密の変数 ADMIN_TOKEN(削除用) / 任意で ALLOWED_ORIGIN(例 https://ユーザー名.github.io)
//   GET  /problems          → { problems: [...新しい順...] }
//   POST /problems          → 問題を1件投稿(1分に1件まで)
//   DELETE /problems/<id>   → 管理者だけ(Authorization: Bearer <ADMIN_TOKEN>)
const MAX_KEEP = 300, MAX_BODY = 8000, COOLDOWN_S = 60;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function validGoal(g) {
  if (!g || typeof g !== 'object') return null;
  if (g.type === 'allclear' || g.type === 'ojamaall') return { type: g.type };
  if (g.type === 'colorall') return /^[RGBYP]$/.test(g.color) ? { type: g.type, color: g.color } : null;
  const n = Number(g.n), cmp = g.cmp === 'exact' || g.cmp === 'atleast' ? g.cmp : undefined;
  if (!int(n, 1, 99)) return null;
  if (g.type === 'chain') return { type: g.type, n, ...(cmp ? { cmp } : {}) };
  if (g.type === 'colors') return n <= 5 ? { type: g.type, n, ...(cmp ? { cmp } : {}) } : null;
  if (g.type === 'count') return /^[RGBYP]$/.test(g.color) ? { type: g.type, color: g.color, n, ...(cmp ? { cmp } : {}) } : null;
  return null;
}
function validate(p) { // 通れば整えた問題を、だめなら理由の文字列を返す
  if (!p || typeof p !== 'object') return '形式が不正です';
  const title = clean(p.title, 30);
  if (!title) return 'タイトルがありません';
  if (!Array.isArray(p.board) || ![12, 13].includes(p.board.length) || !p.board.every(r => typeof r === 'string' && /^[.RGBYPOWI]{6}$/.test(r))) return '盤面が不正です';
  if (!p.board.some(r => /[RGBYPOWI]/.test(r))) return '盤面が空です';
  if (!Array.isArray(p.tsumo) || p.tsumo.length < 1 || p.tsumo.length > 6 || !p.tsumo.every(t => Array.isArray(t) && t.length === 2 && /^[RGBYP]$/.test(t[0]) && /^[RGBYP]$/.test(t[1]))) return 'ツモが不正です(1〜6手)';
  const goal = validGoal(p.goal);
  if (!goal) return 'クリア条件が不正です';
  const out = { title, board: p.board, tsumo: p.tsumo.map(t => [t[0], t[1]]), goal, author: clean(p.author, 12) || '名無し', comment: clean(p.comment, 60) };
  if (int(p.difficulty, 1, 5)) out.difficulty = p.difficulty;
  if (Array.isArray(p.answer) && p.answer.length === p.tsumo.length && p.answer.every(a => Array.isArray(a) && int(a[0], 0, 5) && int(a[1], 0, 3))) out.answer = p.answer.map(a => [a[0], a[1]]);
  return out;
}

export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' };
    const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const readIndex = async () => { try { return JSON.parse((await env.PROBLEMS.get('index')) || '[]'); } catch (e) { return []; } };

    if (path === '/problems' && req.method === 'GET') return json({ problems: await readIndex() }, 200, { 'Cache-Control': 'public, max-age=30' });

    if (path === '/problems' && req.method === 'POST') {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: 'データが大きすぎます' }, 413);
      let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: 'JSONを読めません' }, 400); }
      const p = validate(body);
      if (typeof p === 'string') return json({ error: p }, 400);
      const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
      if (await env.PROBLEMS.get('rl:' + ip)) return json({ error: '投稿は1分に1件までです。少し待ってからもう一度どうぞ' }, 429);
      const index = await readIndex(), sig = JSON.stringify([p.board, p.tsumo, p.goal]);
      if (index.some(q => JSON.stringify([q.board, q.tsumo, q.goal]) === sig)) return json({ error: '同じ問題がすでに投稿されています' }, 409);
      p.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      p.created = new Date().toISOString();
      await env.PROBLEMS.put('index', JSON.stringify([p, ...index].slice(0, MAX_KEEP)));
      await env.PROBLEMS.put('rl:' + ip, '1', { expirationTtl: COOLDOWN_S });
      return json({ ok: true, id: p.id }, 201);
    }

    if (path.startsWith('/problems/') && req.method === 'DELETE') {
      if (!env.ADMIN_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: '権限がありません' }, 401);
      const id = decodeURIComponent(path.slice('/problems/'.length)), index = await readIndex();
      await env.PROBLEMS.put('index', JSON.stringify(index.filter(q => q.id !== id)));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },
};
