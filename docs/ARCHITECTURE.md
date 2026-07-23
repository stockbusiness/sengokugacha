# 千ノ国パスポート アーキテクチャ概要

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md`が要求する最終成果物。モジュール化(PR1〜PR14)完了時点のアーキテクチャ全体像を記録する。

## 全体方針: モジュラーモノリス(部分適用)

本プロジェクトは単一のNext.jsアプリケーション(モノリス)のまま、内部の関心事を`src/modules/<モジュール名>/`単位で分割する「モジュラーモノリス」を目指している。ただし、指示書が明示的に禁止する「フルリライト・ビッグバン移行」を避けるため、今回のモジュール化(Phase 0〜6、PR1〜14)では**domain層(DB非依存の純粋関数・型・エラークラス)のみ**を新構造へ移設し、DB/外部API呼び出しを伴うapplication層・infrastructure層・presentation層は既存の`src/lib/*.ts`・`src/app/api/**/route.ts`にそのまま残している。

```
src/
├── modules/
│   ├── agency/domain/        代理店ランク解決・階層平坦化・APIキーハッシュ
│   ├── castle/domain/        城主契約状態遷移・報酬計算エンジン
│   ├── commerce/domain/      外部注文状態遷移・区画割当算出・Stripe inbox冪等判定
│   ├── conquest/domain/      国制覇判定・地方コンプ実績/石高ボーナス
│   ├── gacha/domain/         排出率ティア選択・排出スロット判定・イベント期間判定・貢献ポイント計算
│   ├── integrations/domain/  HMAC連携のevent envelope検証
│   ├── passport/domain/      国家建設率計算
│   └── architecture-rules.test.ts  domain層の依存関係ルールをCIで検証(§14)
├── shared/
│   ├── auth/          セッションJWTの署名・検証(session.ts等3ファイルの重複を統合)
│   ├── database/      Supabaseクライアント型・取得ヘルパー
│   ├── errors/         共通エラークラス・HTTPステータスマッピング
│   ├── http/           タイムアウト付きfetchラッパー
│   ├── observability/  ロガーインターフェース・ログの機密情報マスキング
│   └── time/            タイムゾーン対応の日付フォーマット
├── lib/                (既存) DB/外部API呼び出しを伴うアプリケーションロジック。
│                        各domainモジュールの純粋関数をimport+re-exportし、既存の
│                        import経路(@/lib/*)を変更せずに使い続けられるようにしている。
└── app/                (既存) Next.js App Router。UI・APIルート。
```

## モジュール一覧と対応する既存ファイル

指示書§3が定義する10モジュール(`identity, passport, agency, gacha, conquest, commerce, entitlements, wallet, castle, integrations`)のうち、**domain層の純粋関数抽出が完了しているのは7モジュール**。残り3モジュール(`identity`, `entitlements`, `wallet`)はdomain層を持たない(理由は`docs/MODULE_BOUNDARIES.md`参照)。

| モジュール | domain層 | 対応する既存lib/APIファイル(application/infrastructure相当) |
|---|---|---|
| `gacha` | `src/modules/gacha/domain/` | `src/lib/gacha.ts`, `src/lib/gacha-rate-tiers.ts`, `src/lib/gacha-animations.ts` |
| `conquest` | `src/modules/conquest/domain/` | `src/lib/conquest-rules.ts`, `src/lib/regions.ts` |
| `agency` | `src/modules/agency/domain/` | `src/lib/agents.ts`, `src/lib/agency-sso.ts`, `src/lib/agency-events.ts` |
| `passport` | `src/modules/passport/domain/` | `src/lib/passport.ts`, `src/lib/common-user-hub.ts` |
| `castle` | `src/modules/castle/domain/` | `src/lib/castle-lord-contracts.ts`, `src/lib/castle-commissions.ts`, `src/lib/castle-plots.ts`, `src/lib/castle-notifications.ts`, `src/lib/castle-kpi.ts` |
| `commerce` | `src/modules/commerce/domain/` | `src/lib/external-orders.ts`, `src/lib/external-order-notifications.ts`, `src/lib/purchases.ts`, `src/lib/purchase-grants.ts`, `src/app/api/stripe/webhook/route.ts` |
| `integrations` | `src/modules/integrations/domain/` | `src/lib/sen-no-kuni-hub-auth.ts`, `src/lib/integration-inbox.ts`, `src/lib/integration-outbox.ts`, `src/app/api/integrations/*/route.ts` |
| `identity`(domain層なし) | — | `src/lib/session.ts`, `src/lib/admin-session.ts`, `src/lib/agent-session.ts`(JWT署名・検証部分のみ`src/shared/auth/`へ統合済み) |
| `entitlements`(domain層なし) | — | `src/lib/entitlements.ts`, `src/lib/shopping-order-events.ts`, `src/lib/atomic-balance.ts` |
| `wallet`(未着手) | — | 独立したウォレット台帳への移行自体が指示書のスコープ外(既存のkokudaka/gacha_tickets列を維持) |

## レイヤーごとの責務(現状)

- **domain**(`src/modules/*/domain/`): DB・Next.js・Stripe等への依存を一切持たない純粋関数・型・エラークラス。`src/modules/architecture-rules.test.ts`でCI検証(詳細は`docs/DEPENDENCY_RULES.md`)。
- **application/infrastructure**(現状は`src/lib/*.ts`に同居): Supabase呼び出し・外部API呼び出し・冪等性制御・監査ログ記録など。今回のモジュール化では意図的に分離していない(理由: 本リポジトリにDB統合テスト基盤が無く、大規模な移動はリグレッションリスクが高いため。詳細は`docs/REFACTORING_COMPLETION_REPORT.md`「未対応事項」参照)。
- **presentation**(`src/app/**`): Next.js App RouterのAPIルート・ページコンポーネント。

## 関連ドキュメント

- `docs/MODULE_BOUNDARIES.md`: 各モジュールの責務境界・許可されるimport方向
- `docs/DEPENDENCY_RULES.md`: §14の依存関係ルールとCI強制の詳細・既知の限界
- `docs/REFACTORING_COMPLETION_REPORT.md`: Phase0〜6・PR1〜14の実施内容・検証結果・未対応事項
- `docs/BASELINE_TEST_RESULTS.md`: Phase 0(既存挙動のベースライン)・各PRで追加した自動テストの一覧
