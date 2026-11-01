// ===== 公開先の設定(投稿・みんなの問題) =====
const NAZO_CONFIG = {
  // 投稿・一覧の取得先。server/README.md の手順で作った Cloudflare Worker の URL。例: 'https://nazopuyo-api.xxxx.workers.dev'
  api: '',
  // api が空のとき、GitHub の Issue で投稿を受け付ける(管理者が確認して取り込む)。例: 'ユーザー名/nazopuyo'
  githubRepo: '',
};
