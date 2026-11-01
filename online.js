// ===== オンライン: 「みんなの投稿」の取得と、問題の投稿 =====
// 投稿先は config.js で設定(api=Cloudflare Worker / githubRepo=GitHub Issue)。どちらも空なら投稿ボタンは使えません。
const Online = (() => {
  const cfg = (typeof NAZO_CONFIG !== 'undefined' && NAZO_CONFIG) || {};
  const api = String(cfg.api || '').replace(/\/+$/, ''), repo = String(cfg.githubRepo || '').trim();
  const CACHE = 'nazopuyo.online.cache', COOL = 'nazopuyo.lastPost';
  const text = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
  let set = null;

  function tidy(p) { // 受け取った問題を検査して、使う項目だけにする(外部のデータは信用しない)
    if (!p || typeof p !== 'object' || !validProblem(p) || p.tsumo.length < 1 || p.tsumo.length > 6) return null;
    const goal = {}; for (const k of ['type', 'n', 'color', 'cmp']) if (p.goal[k] !== undefined) goal[k] = p.goal[k];
    const out = { title: text(p.title, 30) || '無題', board: p.board.map(String), tsumo: p.tsumo.map(t => [t[0], t[1]]), goal, author: text(p.author, 12) || '名無し', comment: text(p.comment, 60), id: text(p.id, 40) };
    if (Number.isInteger(p.difficulty) && p.difficulty >= 1 && p.difficulty <= 5) out.difficulty = p.difficulty;
    return out;
  }
  function apply(list) {
    const ps = (Array.isArray(list) ? list : []).map(tidy).filter(Boolean);
    if (!ps.length) return 0;
    if (!set) { set = { name: 'みんなの投稿', builtin: true, online: true, problems: [] }; sets.push(set); }
    set.problems.splice(0, set.problems.length, ...ps);
    if (typeof refreshSets === 'function') refreshSets(); else fillSetSelect();
    if (sets[curSet] === set) fillSelect();
    return ps.length;
  }
  async function load() {
    if (!api) return false;
    try {
      const r = await fetch(api + '/problems', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), n = apply(j.problems);
      try { localStorage.setItem(CACHE, JSON.stringify(j.problems || [])); } catch (e) { /* 無視 */ }
      return n >= 0;
    } catch (e) { return false; }
  }
  function init() {
    if (!api) return;
    try { apply(JSON.parse(localStorage.getItem(CACHE) || '[]')); } catch (e) { /* 無視 */ } // まず前回の一覧を出す
    load();
  }
  async function post(problem, meta) {
    const r = await fetch(api + '/problems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...problem, author: meta.author, comment: meta.comment }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `投稿に失敗しました(${r.status})`);
    try { localStorage.setItem(COOL, String(Date.now())); } catch (e) { /* 無視 */ }
    return j;
  }
  const waitSec = () => { try { return Math.max(0, 60 - Math.floor((Date.now() - (+localStorage.getItem(COOL) || 0)) / 1000)); } catch (e) { return 0; } };
  function issueUrl(problem, meta) { // api が無いとき: 投稿内容を入れた GitHub の Issue 作成ページ
    const json = JSON.stringify({ ...problem, author: meta.author, comment: meta.comment });
    const body = `投稿者: ${meta.author}\nコメント: ${meta.comment || '(なし)'}\n\n\`\`\`json\n${json}\n\`\`\`\n`;
    return `https://github.com/${repo}/issues/new?title=${encodeURIComponent('問題投稿: ' + problem.title)}&body=${encodeURIComponent(body)}`;
  }
  return { api, repo, hasApi: !!api, canPost: !!(api || repo), init, load, post, issueUrl, waitSec, count: () => set ? set.problems.length : 0 };
})();
Online.init();
