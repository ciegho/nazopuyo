# 問題の投稿サーバー(Cloudflare Workers)

GitHub Pages だけでは「みんなが投稿した問題を保存して共有」できないので、無料の Cloudflare Workers + KV を使います。
(アカウント作成は無料。クレジットカード不要で始められます)

## 手順(ダッシュボードだけで完結)
1. Cloudflare にログイン → **Workers & Pages** → **Create** → **Create Worker** → 名前を付けて Deploy
2. **Edit code** を開き、`worker.js` の中身を全部貼り付けて Deploy
3. **Storage & Databases → KV** で名前空間を1つ作る(名前は何でも可)
4. Worker の **Settings → Bindings → Add → KV namespace** で、変数名を **`PROBLEMS`**、作った名前空間を選んで保存
5. **Settings → Variables and Secrets** に追加
   - `ADMIN_TOKEN` … 削除用の合言葉(Secret。長くて推測されにくい文字列に)
   - `ALLOWED_ORIGIN` … 公開サイトのURL(例 `https://ユーザー名.github.io`)。入れると他サイトからの投稿を断れます
6. Worker の URL(例 `https://nazopuyo-api.xxxx.workers.dev`)を、アプリの **`config.js` の `api`** に書く

## 運用メモ
- 投稿は **1分に1件/IPまで**、サイズ・形式はサーバー側でも検査します(JSONの形式、盤面の文字、ツモ、クリア条件)。
  ただし「クリアできるか」はブラウザ側(クリアチェック)の確認で、サーバーは検算しません。変な問題が来たら削除してください。
- 不適切な投稿の削除: `curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" https://<WorkerのURL>/problems/<問題のid>`
  (id は `GET /problems` の結果に入っています)
- 最新300件を保持します(KVの1つの値にまとめて保存。無料枠で十分動きます)。
- 同時に複数人が投稿すると、まれに片方が消えることがあります(KVの仕様)。趣味の規模なら問題になりません。
