# 千ノ国ウォレット相当の内部実装まとめ

`docs/sengoku-no-kuni-5-system-policy-diff-report.md` 1-5章で報告した通り、方針書が構想する「千ノ国ウォレット」は独立した台帳システムとしては存在しない。本リポジトリ内で残高相当のカラムを直接増減しているだけであり、外部サービスから呼べるAPIも存在しない。

**戦国パスポート・代理店システム外部開発者向け連携ガイド(`docs/sengoku-passport-external-developer-guide.md`)に相当する文書は作れない**(そもそも別サービスとして切り出されたAPIが無いため)。本書は代わりに、内部でどこがどう残高を操作しているかの実態を、将来ウォレットを分離する際の参照用にまとめたもの。

---

## 1. 残高の実体

台帳(付与+取消-調整=残高)ではなく、`users`テーブルの3つのカラムを直接加減算しているだけ。

| カラム | 意味 | 独立テーブルの有無 |
|---|---|---|
| `users.kokudaka` | 石高(購入して貯める通貨) | 無し |
| `users.gacha_tickets` | ガチャ券 | 無し |
| `users.contribution_points` | 国家貢献ポイント(OVE移行予定ポイントとして表示) | 無し。`commission_ledger`のような真の台帳は代理店報酬にしか存在しない |

## 2. 付与(加算)の発生箇所

| トリガー | 実装 |
|---|---|
| Stripe決済確定(kokudaka/gacha_ticket購入) | `src/app/api/stripe/webhook/route.ts` `grantPurchase()`。`purchases.grant_amount`をそのまま加算 |
| ログインボーナス・任務達成等の活動 | `src/lib/user-activity.ts` `recordContribution()`。`contribution_points`を加算し、活動ログにも記録(こちらのみ履歴が残る) |

## 3. 取消(減算)の発生箇所

| トリガー | 実装 | 履歴の有無 |
|---|---|---|
| 管理画面からのkokudaka/gacha_ticket購入の返金 | `src/app/api/admin/purchases/[id]/refund/route.ts`。`purchase.grant_amount`を減算(0未満にはならない) | **無し**(単純な引き算のみ、取消イベントは記録されない) |
| 上記返金時の`contribution_points`・`agent_sales` | **一切取り消されない**(既知の未対応事項、`sengoku-no-kuni-5-system-policy-diff-report.md` 5章で報告済み・未修正) | 該当なし |

## 4. 「仮押さえ」に相当する概念

kokudaka/gacha_ticket/contribution_pointsには仮押さえの概念は無い(即時確定のみ)。仮押さえに相当する仕組みが存在するのは**土地区画(`plot_reservations`)のみ**で、`status='pending'`の予約に期限を持たせ、期限切れは`releaseExpiredReservation()`で解放する設計になっている(ウォレット残高とは無関係)。

## 5. クーポン

存在しない(方針書が構想する「保有・仮押さえ・利用確定」のクーポン機能は未実装)。

## 6. 外部サービスからの操作方法

**無い。** 上記はすべて本リポジトリ内のサーバーサイド関数呼び出しであり、ネットワークAPIとして公開されていない。戦国楽市楽座等の外部サービスがkokudaka等を直接付与・取消したい場合、現状は以下のいずれかになる。

- 戦国パスポート自身のStripe Checkout経由で購入させる(外部サービスからは呼べない)
- 新規に管理画面API相当の内部専用エンドポイントを設計・実装する(未着手)

---

*関連ドキュメント: `docs/sengoku-no-kuni-5-system-policy-diff-report.md`、`docs/sengoku-passport-external-developer-guide.md`*
