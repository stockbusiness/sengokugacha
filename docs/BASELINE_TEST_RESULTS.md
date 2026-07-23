# 千ノ国パスポート モジュール化 Phase 0: 既存挙動のベースライン

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md` §5(Phase 0: 既存挙動のテスト固定)の提出物。モジュール分割着手前に、現状の挙動を記録する。

## 前提: 自動テストの範囲

本リポジトリにはDBモック基盤が無く(P0-2 PR-Gで確認済みの制約)、Supabaseへの実際の呼び出しを含む処理は自動テスト化できない。そのため:

- **DBに依存しない純粋関数**は、通常どおりvitestで自動テスト化し、以下の各セクションに実行結果を記載する。
- **DBに依存するフロー**(LINEログイン、Stripe決済、HMAC認証等のほとんど)は、自動テストの対象にはできないため、本書でソースコードから読み取った現状の動作を記録する(仕様書として固定し、モジュール分割後にこの記述と食い違う変更が入っていないかをレビューで確認する)。

本書はモジュール化の各PRが進むごとに更新する(現時点ではPR2「ガチャ・国取り」分の自動テストが完了)。

## ガチャ・国取り(PR2で自動テスト化済み)

| 対象 | テストファイル | 内容 |
|---|---|---|
| 排出率ティア選択 | `src/lib/gacha-rate-tiers.test.ts`(既存) | `pickTierRates()`: 制圧数に応じたティア境界の選択、空リスト時のフォールバック |
| 排出スロット判定 | `src/lib/gacha.test.ts` | `pickSlot()`: 乱数値に応じたrare/mid/common境界(`Math.random()`をモック) |
| イベント期間判定 | `src/lib/gacha.test.ts` | `isEventWindowActive()`: 開始/終了未指定時は無制限、期間内外の判定(`vi.useFakeTimers()`で現在時刻を固定) |
| 美濃国解放判定 | `src/lib/gacha.test.ts` | `didJustUnlockMino()`: しきい値到達時のみtrue、既に超えていた場合・未設定時はfalse |
| 国家貢献ポイント計算 | `src/lib/gacha.test.ts` | `calcContributionPoints()`: スロット別基礎点+新規カードボーナスの加算 |
| 国制覇判定(所持武将) | `src/lib/conquest-rules.test.ts`(既存) | `isConquestSatisfied()`: 必須武将の充足判定 |
| 地方コンプ実績スラグ | `src/lib/regions.test.ts` | `regionCompleteAchievementType()`: 既知/未知地方の変換 |
| 地方コンプ石高ボーナス | `src/lib/regions.test.ts` | `getRegionKokudakaBonus()`: 制圧国数に比例した加算 |
| 城解放条件 | `src/lib/castle-unlock.test.ts`(既存) | `isCastleUnlocked()`: 主要国制圧・地方コンプ条件、誤ロック防止のフォールバック |
| 連続ログインボーナス | `src/lib/login-streak.test.ts`(既存) | `getStreakBonusDraws()`: 7日/30日しきい値 |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **ガチャ券不足**: `drawPaidGacha()`が`consumeGachaTicket()`(Postgres関数`consume_gacha_ticket`、原子的UPDATE)を呼び、残高不足時は`insufficient_gacha_tickets`例外→`InsufficientTicketsError`に変換(`src/lib/gacha.ts`)。
- **日次上限**: `getTodaysDrawCount()`が当日0時(サーバーローカル時刻、`new Date().setHours(0,0,0,0)`)以降の`gacha_logs`件数を数え、`getEffectiveFreeLimit()`/`getEffectivePaidLimit()`の上限と比較する。タイムゾーンはサーバーローカルであり、日本時間とずれる可能性がある既知の制約(`04_SYSTEM_ANALYSIS_REFERENCE.md`でも指摘済み、Phase 1で追加した`formatDateInTimezone()`により将来修正可能な土台のみ用意済み、今回は未修正)。
- **武将重複数**: `addWarlordToUser()`が既存行があれば`count`をインクリメント、無ければ新規作成。
- **演出失敗時の継続**: `selectAnimationForDraw()`の失敗を`.catch()`で捕捉し`null`を返す。ガチャ抽選自体は成功として扱われる。
- **国制覇の反映**: `maybeConquerProvince()`が`conquest_rules`優先、無ければ「その国の武将を全部所持」でフォールバック判定し、`user_provinces`をupsertする。

## 決済・権利、代理店・共通ID、HMAC(未着手)

対応するモジュール化PR(PR5「agencyとidentityのベースラインテスト」、PR8「commerceとentitlementワークフローのテスト」)着手時に本書へ追記する。

## 検証結果

- `rm -rf .next && npx tsc --noEmit`: エラーなし
- `npm run lint`: 既存の`<img>`警告2件のみ(本作業と無関係)
- `npx vitest run`: 101/101 pass(モジュール化PR2で2ファイル・17テスト追加)
- `npm run build`: 成功
