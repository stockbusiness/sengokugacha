# 千ノ国パスポート モジュール化 Phase 0: 既存挙動のベースライン

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md` §5(Phase 0: 既存挙動のテスト固定)の提出物。モジュール分割着手前に、現状の挙動を記録する。

## 前提: 自動テストの範囲

本リポジトリにはDBモック基盤が無く(P0-2 PR-Gで確認済みの制約)、Supabaseへの実際の呼び出しを含む処理は自動テスト化できない。そのため:

- **DBに依存しない純粋関数**は、通常どおりvitestで自動テスト化し、以下の各セクションに実行結果を記載する。
- **DBに依存するフロー**(LINEログイン、Stripe決済、HMAC認証等のほとんど)は、自動テストの対象にはできないため、本書でソースコードから読み取った現状の動作を記録する(仕様書として固定し、モジュール分割後にこの記述と食い違う変更が入っていないかをレビューで確認する)。

本書はモジュール化の各PRが進むごとに更新する(現時点ではPR2「ガチャ・国取り」・PR5「代理店・共通ID」分の自動テストが完了)。

## ガチャ・国取り(PR2で自動テスト化、PR3/PR4でdomain層へ移設済み)

| 対象 | テストファイル | 内容 |
|---|---|---|
| 排出率ティア選択 | `src/lib/gacha-rate-tiers.test.ts`(既存) | `pickTierRates()`: 制圧数に応じたティア境界の選択、空リスト時のフォールバック |
| 排出スロット判定 | `src/modules/gacha/domain/draw-policy.test.ts` | `pickSlot()`: 乱数値に応じたrare/mid/common境界(`Math.random()`をモック) |
| イベント期間判定 | `src/modules/gacha/domain/draw-limit.test.ts` | `isEventWindowActive()`: 開始/終了未指定時は無制限、期間内外の判定(`vi.useFakeTimers()`で現在時刻を固定) |
| 美濃国解放判定 | `src/modules/gacha/domain/draw-limit.test.ts` | `didJustUnlockMino()`: しきい値到達時のみtrue、既に超えていた場合・未設定時はfalse |
| 国家貢献ポイント計算 | `src/modules/gacha/domain/rarity.test.ts` | `calcContributionPoints()`: スロット別基礎点+新規カードボーナスの加算 |
| 国制覇判定(所持武将) | `src/modules/conquest/domain/conquest-policy.test.ts` | `isConquestSatisfied()`: 必須武将の充足判定 |
| 地方コンプ実績スラグ | `src/modules/conquest/domain/region-completion.test.ts` | `regionCompleteAchievementType()`: 既知/未知地方の変換 |
| 地方コンプ石高ボーナス | `src/modules/conquest/domain/region-completion.test.ts` | `getRegionKokudakaBonus()`: 制圧国数に比例した加算 |
| 城解放条件 | `src/lib/castle-unlock.test.ts`(既存) | `isCastleUnlocked()`: 主要国制圧・地方コンプ条件、誤ロック防止のフォールバック |
| 連続ログインボーナス | `src/lib/login-streak.test.ts`(既存) | `getStreakBonusDraws()`: 7日/30日しきい値 |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **ガチャ券不足**: `drawPaidGacha()`が`consumeGachaTicket()`(Postgres関数`consume_gacha_ticket`、原子的UPDATE)を呼び、残高不足時は`insufficient_gacha_tickets`例外→`InsufficientTicketsError`に変換(`src/lib/gacha.ts`)。
- **日次上限**: `getTodaysDrawCount()`が当日0時(サーバーローカル時刻、`new Date().setHours(0,0,0,0)`)以降の`gacha_logs`件数を数え、`getEffectiveFreeLimit()`/`getEffectivePaidLimit()`の上限と比較する。タイムゾーンはサーバーローカルであり、日本時間とずれる可能性がある既知の制約(`04_SYSTEM_ANALYSIS_REFERENCE.md`でも指摘済み、Phase 1で追加した`formatDateInTimezone()`により将来修正可能な土台のみ用意済み、今回は未修正)。
- **武将重複数**: `addWarlordToUser()`が既存行があれば`count`をインクリメント、無ければ新規作成。
- **演出失敗時の継続**: `selectAnimationForDraw()`の失敗を`.catch()`で捕捉し`null`を返す。ガチャ抽選自体は成功として扱われる。
- **国制覇の反映**: `maybeConquerProvince()`が`conquest_rules`優先、無ければ「その国の武将を全部所持」でフォールバック判定し、`user_provinces`をupsertする。

## 代理店・共通ID(PR5で自動テスト化済み)

| 対象 | テストファイル | 内容 |
|---|---|---|
| 代理店ランク解決 | `src/lib/agents.test.ts` | `resolveRank()`: `role_label`優先、`role_level`フォールバック、いずれも不明なら`アドバイザー`既定値 |
| 代理店階層の平坦化 | `src/lib/agents.test.ts` | `flattenHierarchy()`: ネストしたツリーを親→子の順に平坦化、`external_id`欠落ノードのスキップ、`agent_code`/`parent_code`へのフォールバック |
| 国家建設率計算 | `src/lib/passport.test.ts` | `calcNationBuildingRate()`: 各比率の重み付け平均(国盗り40%・図鑑30%・ログイン継続15%・任務15%)、ログイン継続日数の30日キャップ |

### DB/JWT依存のため自動テスト対象外(ソースコードから記録)

- **LINEログイン・新規登録**: `findOrCreateUserByLineId()`(`src/lib/passport.ts`)が`users.line_user_id`で検索し、無ければ`referring_agent_id`/`referral_session_key`を新規登録時のみ設定して`insert`する。既存ユーザーの`display_name`・紹介者は上書きしない(ファーストタッチ確定方式)。
- **共通ID/紹介連携の同期**: `syncCommonUserHub()`が`common_user_id`未解決時のみ`resolveCommonUserId()`を呼び、新規ユーザーかつ`referral_session_key`がある場合のみ`confirmReferral()`を呼ぶ。いずれもfail-open(失敗してもログイン処理は継続)。
- **代理店同期(`upsertAgentFromSync`)**: `external_id`をキーにupsertし、`parent_external_id`が未解決でもエラーにせず保存、後から親が届いた時点で子の`parent_agent_id`を再解決する(自己参照解決ロジック)。
- **代理店SSO検証**: `verifyAgencySsoToken()`(`src/lib/agency-sso.ts`)がRS256署名・issuer・audience・有効期限をJWKS経由で検証し、`jti`のワンタイム利用を`agency_sso_used_jti`のunique制約(23505)で検知する。無効化済み代理店(`status='inactive'`)はログイン不可。
- **HMAC認証(新規千ノ国連携)**: `verifySenNoKuniHubRequest()`がタイムスタンプ許容誤差5分以内、`HMAC-SHA256(timestamp + "." + raw_body)`の一致、nonceのワンタイム利用(unique制約)を検証する(署名検証はP0-2で完了済み、既存のvitestテストは無し。契約書v1.1 DRAFTで署名対象文字列の全システム合意が未確定のため、現行実装を安易に変更しない方針、詳細は`docs/IMPLEMENTATION_STATUS_P0_2.md`参照)。

## 決済・権利(未着手)

対応するモジュール化PR8「commerceとentitlementワークフローのテスト」着手時に本書へ追記する。

## 検証結果

- `rm -rf .next && npx tsc --noEmit`: エラーなし
- `npm run lint`: 既存の`<img>`警告2件のみ(本作業と無関係)
- `npx vitest run`: 111/111 pass(モジュール化PR2で2ファイル・17テスト、PR5で2ファイル・10テストを追加)
- `npm run build`: 成功
