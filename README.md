# 戦国パスポート (戦国経済圏OS)

戦国経済圏OSの中核となる「戦国パスポート」LIFFアプリ。仕様の全体像は
`01_project_overview.pdf`〜`06_chatgpt_image_guide_v1.0.md` を参照。

現時点の実装範囲(04_mvp_spec_v1.2.md 7章「開発優先順位」の 1〜2 に対応):

- Supabase 用マイグレーション(`supabase/migrations/`)
- Next.js (App Router) 雛形
- LINEログイン(LIFF)による戦国パスポート登録・表示画面

## セットアップ

### 1. 環境変数

`.env.example` を `.env.local` にコピーし、値を埋める。

```bash
cp .env.example .env.local
```

| 変数 | 説明 |
|---|---|
| `NEXT_PUBLIC_LIFF_ID` | LINE Developers コンソールで発行したLIFF ID |
| `LINE_LOGIN_CHANNEL_ID` | LIFFの発行元であるLINEログインチャネルID(IDトークン検証の`aud`照合に使用) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトURL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key(サーバー専用。クライアントに露出させない) |
| `SESSION_SECRET` | セッションCookie署名用シークレット(`openssl rand -base64 32` 等で生成) |

### 2. Supabase マイグレーション適用

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### 3. 開発サーバー起動

```bash
npm install
npm run dev
```

LIFFはLINEアプリ内WebView(またはLIFF対応ブラウザ)からのアクセスを前提とする。
ローカル開発時は `ngrok` 等でHTTPS公開したURLをLIFFのエンドポイントURLに設定して確認する。

## 実装メモ

- 認証は LINEログインのIDトークンをサーバー側(`/api/auth/line`)で検証してから
  `users` テーブルへ upsert し、署名付きJWTをhttpOnly Cookieに保存する方式(Supabase Auth は未使用)。
- 全テーブルでRLSを有効化し、ポリシーは定義していない(anon/authenticatedからは常に拒否)。
  アプリからのアクセスはすべて service role key を使うサーバー側コードのみを経由する。
- 武将・国マスタデータの投入、ガチャ抽選ロジック等は未実装(7章の開発優先順位3以降)。
