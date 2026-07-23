# 千ノ国パスポート アーキテクチャ依存関係ルール

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md` §14の提出物。domain層の依存関係ルールと、そのCI強制状況・既知の限界を記録する。

## ルール

**domain層(`src/modules/*/domain/`)は、Supabase・Next.js・Stripeへの依存を一切持たない。**

具体的には、domain層のファイルは以下をimportしてはならない:

- `next`または`next/*`(Next.jsのランタイムAPI。`NextRequest`/`NextResponse`/`cookies()`等)
- `@supabase/*`(Supabase SDK)
- `stripe`(Stripe SDK)
- `@/lib/supabase-server`(Supabaseクライアント生成ラッパー)
- `@/lib/stripe`(Stripeクライアント生成ラッパー)

このルールにより、domain層のファイルは:
- DBモック基盤が無い本リポジトリでも、`vitest`で完全に自動テスト可能であること
- 将来DB(Supabase)やフレームワーク(Next.js)を変更する場合でも、domain層のロジックは変更不要であること

が保証される。

## CIでの強制: `src/modules/architecture-rules.test.ts`

PR14で追加。`src/modules/*/domain/`配下の全`.ts`ファイル(`*.test.ts`を除く)を再帰的に走査し、各ファイルの`import`/`export ... from`/動的`import()`の指定子(specifier)が上記の禁止パターンに一致しないことを検証する。通常の`npx vitest run`(CI含む)で実行される。

検証対象ファイル数は本書作成時点で17件(2025年時点でのモジュール一覧は`docs/MODULE_BOUNDARIES.md`参照)。

## 既知の限界: 直接importのみを検証(推移的な依存は未検証)

本テストは各ファイル**自身が持つ直接import**のみを検査する。「importしたファイルが、さらに別の禁止対象をimportしている」という**推移的な依存関係**までは解決しない。

### 実際に発生した違反とその修正(PR14)

PR14でこのテストを追加する過程で、以下の実際の違反が見つかった:

- `src/modules/gacha/domain/draw-policy.ts`(domain層)が`src/lib/gacha-rate-tiers.ts`から`pickTierRates()`をimportしていた。
- しかし`src/lib/gacha-rate-tiers.ts`自体は、同じファイル内に`getGachaRateTiers()`(`createSupabaseServerClient()`を直接呼び出す関数)を含んでいた。
- つまり`draw-policy.ts`は、直接のimport指定子(`"@/lib/gacha-rate-tiers"`)だけを見ると禁止パターンに一致しないにもかかわらず、**推移的にはSupabaseへ依存していた**。

この違反は、直接import検証のみのテストでは検知できない種類のものだった。そのため、テストを追加する前に実体を修正する(`pickTierRates()`等を`src/modules/gacha/domain/rate-tiers.ts`という完全にdomain層で完結するファイルへ移設する)アプローチを取った。

### 現状の残存リスク

- `src/modules/castle/domain/commission-engine.ts`は`src/lib/agent-rank.ts`をimportしている。`agent-rank.ts`は現時点で外部依存ゼロの純粋ファイルであることを目視で確認済みだが、**将来誰かがこのファイルにDB呼び出しを追加しても、本テストは検知できない**。
- 同様に、他のdomainファイルが将来`src/lib/*`配下の一見無害なユーティリティをimportし、そのユーティリティが後からDB依存処理を持つようになった場合も、本テストは検知できない。

### 恒久対応の候補(未実施)

真に推移的な依存関係を検証するには、以下のいずれかが必要:

1. TypeScriptのコンパイラAPI(`ts-morph`等)でimportグラフを構築し、`src/modules/*/domain/`から到達可能な全ファイルを解決した上で、そのいずれかが禁止パターンに一致するかを検証する。
2. ESLintの`import/no-restricted-paths`やdependency-cruiser等の専用ツールを導入し、モジュール境界のルールをlintレベルで強制する。

いずれも今回のモジュール化のスコープ(既存挙動を壊さない範囲での段階的改善)を超える追加投資が必要なため、今回は見送り、代わりに「新規にdomain層へファイルを追加する際はimport先の依存を目視で確認する」運用ルールを`src/modules/architecture-rules.test.ts`のコメントと本書に明記するに留めた。

## 依存方向の全体像

`docs/MODULE_BOUNDARIES.md`の「依存方向の要約図」を参照。
