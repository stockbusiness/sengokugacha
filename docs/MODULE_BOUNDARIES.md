# 千ノ国パスポート モジュール境界

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md`が要求する最終成果物。各モジュールの責務範囲と、許可されるimport方向を記録する。

## 基本ルール

1. **domain層は他モジュールのdomain層を直接importしない**(現時点で実際に他モジュールのdomainをimportしている例は無いことを確認済み)。共通で使う純粋ロジックは`src/shared/`側に置く。
2. **domain層は同一モジュール内のapplication/infrastructure層(=現状は対応する`src/lib/*.ts`)を絶対にimportしない**(依存の向きが逆転するため)。逆に、`src/lib/*.ts`側が対応するdomainモジュールをimportして再エクスポートする、という一方向の依存のみを許可する。
3. **domain層は`src/shared/*`をimportしてよい**が、現状ではどのdomainファイルも`shared/*`を利用していない(セッションJWTは`identity`に相当する`src/lib/session.ts`等がshared/authを直接利用しており、domain層を経由していない)。
4. 上記1・3の「他モジュールのdomain」「shared」への依存は将来必要になった時点で追加してよいが、2(domain→lib方向の依存)は`src/modules/architecture-rules.test.ts`が一部を機械的に検出する(詳細は`docs/DEPENDENCY_RULES.md`)。

## モジュール別の責務

### gacha(`src/modules/gacha/domain/`)

| ファイル | 責務 |
|---|---|
| `draw-policy.ts` | 排出スロット(rare/mid/common)の乱数判定(`pickSlot`) |
| `rate-tiers.ts` | 制圧数に応じた排出率ティア選択(`pickTierRates`)、デフォルトティア定義 |
| `draw-limit.ts` | イベント期間判定、美濃国解放判定 |
| `rarity.ts` | 国家貢献ポイント計算 |
| `errors.ts` | ガチャ関連のドメインエラークラス(上限超過・対象国無し・券不足) |

DB依存の抽選実行(`drawFreeGacha`/`drawPaidGacha`/`performDraw`)、日次上限・武将重複数のDB参照は`src/lib/gacha.ts`に残置。排出率のDB取得(`getGachaRateTiers`)は`src/lib/gacha-rate-tiers.ts`に残置。

### conquest(`src/modules/conquest/domain/`)

| ファイル | 責務 |
|---|---|
| `conquest-policy.ts` | 必須武将の充足判定による国制覇判定(`isConquestSatisfied`) |
| `region-completion.ts` | 地方コンプ実績スラグ変換・石高ボーナス計算 |

国制覇条件のDB CRUD(`getActiveConquestRule`等)は`src/lib/conquest-rules.ts`、地方進捗のDB集計(`getRegionProgress`)は`src/lib/regions.ts`に残置。

### agency(`src/modules/agency/domain/`)

| ファイル | 責務 |
|---|---|
| `rank-resolution.ts` | 代理店ランク解決(`resolveRank`、3段階: アドバイザー/ディレクター/エージェント) |
| `hierarchy.ts` | 代理店階層の平坦化(`flattenHierarchy`) |
| `api-key.ts` | APIキーのSHA-256ハッシュ化 |

**既知の重複**: `src/lib/agent-rank.ts`に別概念の`AgentRank`(4段階、「代理店候補」を含む、城主プランの権限判定用)が存在する。両者はPR6で意図的に統合していない(ファイル名を`rank-resolution.ts`とし衝突を回避)。将来的な統合要否は別途判断すること。

代理店の同期・SSO検証・APIキー検証等のDB/JWT依存処理は`src/lib/agents.ts`・`src/lib/agency-sso.ts`に残置。

### passport(`src/modules/passport/domain/`)

| ファイル | 責務 |
|---|---|
| `nation-building-rate.ts` | 国家建設率の加重平均計算 |

LINEログイン・新規登録・共通ID同期・パスポートデータ取得等のDB依存処理は`src/lib/passport.ts`に残置。

### castle(`src/modules/castle/domain/`)

| ファイル | 責務 |
|---|---|
| `contract-state.ts` | 城主契約の9状態遷移マトリクス、operator/manager権限判定 |
| `commission-engine.ts` | 土地販売報酬の計算(要件書8.7 TC1〜TC7)、返金時の反対仕訳計算 |

契約状態のDB更新・履歴記録(`transitionContract`)、報酬元帳への書込(`postLandSaleCommission`)は`src/lib/castle-lord-contracts.ts`・`src/lib/castle-commissions.ts`に残置。`commission-engine.ts`は`src/lib/agent-rank.ts`(DB非依存の純粋関数のみで構成)に依存している。

### commerce(`src/modules/commerce/domain/`)

| ファイル | 責務 |
|---|---|
| `order-state.ts` | 外部注文(ショップ経由購入)の状態遷移マトリクス、operator/manager権限判定 |
| `order-assignment.ts` | 複数区画注文の割当状況算出 |

注文のDB更新・区画割当・権利付与(`transitionExternalOrder`/`assignPlotToOrderItem`/`grantExternalOrderRights`)は`src/lib/external-orders.ts`、Stripe署名検証・DB書込・`runPurchaseGrant()`呼び出しは`src/app/api/stripe/webhook/route.ts`に残置。Stripe event inboxの冪等判定は、モジュール化(PR12)時点ではDB非依存の純粋関数`stripe-inbox.ts`として抽出していたが、モジュール化後バグ修正Phase A-3(§6)で並行実行安全性を確保するため単一のPostgres原子的claim関数(`claim_stripe_webhook_event`等、マイグレーション`20260808000004`)へロジックを統合し、`stripe-inbox.ts`は削除した。

### integrations(`src/modules/integrations/domain/`)

| ファイル | 責務 |
|---|---|
| `event-envelope.ts` | HMAC連携(`/api/integrations/sen-no-kuni-hub`)のevent_version検証・event_id解決・source_system_key整合性判定 |
| `sen-no-kuni-hub-signature.ts` | HMAC署名v1/v2判定・canonical string構築・v1停止判定(モジュール化後バグ修正Phase A-3 §7) |

HMAC署名検証(`verifySenNoKuniHubRequest`)、inboxの原子的claim(`claimInboxEvent`)、イベント種別ごとのディスパッチはそれぞれ`src/lib/sen-no-kuni-hub-auth.ts`・`src/lib/integration-inbox.ts`・`src/app/api/integrations/sen-no-kuni-hub/route.ts`に残置。

### identity・entitlements・wallet(domain層なし)

- **identity**: セッション(`src/lib/session.ts`/`admin-session.ts`/`agent-session.ts`)はほぼ全体がCookie読み書き(`next/headers`依存)であり、DB非依存の純粋関数はJWT署名・検証部分のみ。この部分は`src/shared/auth/`へ統合済み(モジュール専用のdomain層ではなく共有インフラとして配置、詳細は`docs/ARCHITECTURE.md`)。
- **entitlements**: `src/lib/entitlements.ts`・`shopping-order-events.ts`・`atomic-balance.ts`を全て確認したが、DB呼び出しに直結しない純粋関数は存在しなかった(PR8で確認済み)。
- **wallet**: 独立したウォレット台帳への全面移行自体が指示書のスコープ外(既存のkokudaka/gacha_tickets列を維持する方針)。

## 依存方向の要約図

```
src/app/**  ──imports──>  src/lib/*.ts  ──imports──>  src/modules/*/domain/*.ts
                                                              │
                                                              └─imports──> src/modules/<同一モジュール>/domain/* のみ
                                                                            (他モジュールのdomain・shared/*への依存は現状0件)

src/lib/session.ts 等  ──imports──>  src/shared/auth/*
```

`src/lib/*.ts`は対応するdomainモジュールを`import`して`export`で再エクスポートすることで、既存の外部import経路(`@/lib/*`)を変更せずに済ませている(PR3/PR4/PR6/PR7/PR9/PR10/PR11/PR12/PR14で一貫して採用したパターン)。
