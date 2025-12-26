# Batch TB: ユーザーテスト計画

> Newsletter System MVP のユーザーテスト計画

*作成日: 2025-12-26*
*ステータス: 実行準備完了*

---

## 概要

### 目的

Newsletter System MVP の実装が「実用的で使いやすいか」を検証するセルフテスト。

### テスト範囲

| タスク | 内容 | ステータス |
|------|---------|--------|
| TB-1 | テストシナリオ作成 | このドキュメント |
| TB-2 | 購読者視点のフロー | シーケンス + 埋め込みフォーム |
| TB-3 | 管理者視点の操作 | キャンペーン + コンタクトリスト + 分析 |
| TB-4 | モバイル対応 | **対象外** |
| TB-5 | フィードバック収集と改善 | ハイブリッドアプローチ |
| Extra | mail-tester.com 評価 | 配信性チェック |

### テスト条件

| 項目 | 値 |
|------|-------|
| テスター | 自身（オーナー） |
| 環境 | 本番環境 (edgeshift.tech) |
| メールアドレス | 個人メールアドレス |
| タイミング | 08:00 JST に登録開始 |

---

## テストシナリオ

### TB-2: 購読者視点のフロー

#### 2-1: シーケンスメールテスト（5ステップ）

**目的:** delay_days/delay_time スケジューリングと Click Tracking の検証。

**シーケンス基本設定:**

```
名前: Test Sequence - Batch TB
説明: User testing for delay_days/delay_time scheduling verification
デフォルト送信時刻: 09:00
ステータス: 有効
```

**ステップ 1 設定:**
```
件名: EdgeShiftへようこそ - サーバーレス開発の旅を始めましょう
Delay Days: 0
Delay Time: 09:00
本文:
EdgeShift Newsletter へのご登録ありがとうございます。

このニュースレターでは、Cloudflare Workers、エッジコンピューティング、モダンなサーバーレスアーキテクチャに関する実践的な知見をお届けします。

まずはこちらの記事から始めてみてください：

📖 はじめてのCloudflare Workers
https://edgeshift.tech/articles/a

🚀 エッジでのデータベース活用術
https://edgeshift.tech/articles/b

次回は、実際のプロジェクト事例をご紹介します。

Best regards,
EdgeShift チーム
```

**ステップ 2 設定:**
```
件名: EdgeShift実践ガイド - プロジェクト事例のご紹介
Delay Days: 0
Delay Time: 09:15
本文:
EdgeShiftをご購読いただきありがとうございます。

本日は、実際にCloudflare Workersで構築されたプロジェクト事例をご紹介します。

この事例では、従来のサーバーレスアーキテクチャと比較して、レイテンシを75%削減し、コストを60%削減することに成功しました。

📊 事例詳細はこちら
https://edgeshift.tech/page-c

次回は、開発効率を上げるためのベストプラクティスをお届けします。

Best regards,
EdgeShift チーム
```

**ステップ 3 設定:**
```
件名: EdgeShift開発Tips - 生産性を向上させる5つの方法
Delay Days: 0
Delay Time: 09:30
本文:
EdgeShiftをご購読いただきありがとうございます。

サーバーレス開発で生産性を向上させるための実践的なTipsをまとめました：

1. ローカル開発環境の最適化
2. テスト駆動開発のアプローチ
3. CI/CDパイプラインの構築
4. モニタリングとロギング戦略
5. パフォーマンス最適化の手法

詳細はこちらの記事をご覧ください：
https://edgeshift.tech/page-d

次回からは、より高度なトピックをお届けします。

Best regards,
EdgeShift チーム
```

**ステップ 4 設定:**
```
件名: EdgeShift Weekly - 今週のハイライトとコミュニティ動向
Delay Days: 1
Delay Time: (空白のまま - デフォルト09:00を使用)
本文:
EdgeShift Newsletter 購読者の皆様へ

今週のサーバーレス・エッジコンピューティング業界のハイライトをお届けします。

🌟 今週の注目トピック:
- Cloudflare Workers の新機能発表
- D1データベースのパフォーマンス改善
- コミュニティで話題のプロジェクト紹介

📰 詳細記事はこちら
https://edgeshift.tech/step4

来週は、実践的なワークショップのご案内をお送りします。

Best regards,
EdgeShift チーム
```

**ステップ 5 設定:**
```
件名: EdgeShift特別企画 - 無料ワークショップのご案内
Delay Days: 1
Delay Time: 14:00
本文:
EdgeShift Newsletter 購読者限定のお知らせです。

来月、Cloudflare Workersを使った実践的なアプリケーション開発ワークショップを開催します。

【ワークショップ内容】
- リアルタイムAPIの構築
- D1データベースの活用
- 認証・認可の実装
- デプロイとモニタリング

参加費：無料（先着50名様）

📝 詳細・お申し込みはこちら
https://edgeshift.tech/step5

ご参加お待ちしております。

Best regards,
EdgeShift チーム
```

**テスト手順:**

1. 管理画面で上記設定のシーケンスを作成
2. Tiptap エディタで装飾（太字、リンク）を追加
3. 08:00 JST に個人メールで登録
4. ステップ 1-3 が同日 09:00, 09:15, 09:30 に届くことを確認
5. ステップ 4 が翌日 09:00 に届くことを確認
6. ステップ 5 が翌日 14:00 に届くことを確認
7. 全リンク (A-F) をクリックし、分析UIで確認

**検証ポイント:**

- [ ] delay_days=0 で同一JST日付内に複数配信される
- [ ] delay_time でステップ間の時刻差が生じる
- [ ] delay_days=1 で翌日に正しく配信される
- [ ] デフォルト時刻 vs 指定時刻が正しく動作する
- [ ] Click Tracking が各リンクを個別に記録する
- [ ] 同一リンクを複数回クリックした場合、click_events に複数記録される
- [ ] Batch 3D のスケジュール機能が無効化されていない

#### 2-2: 埋め込みフォームテスト

**目的:** 埋め込みフォーム機能と theme/size オプションの検証。

**埋め込みフォーム設定:**

```
ページ名: Test Embed Form
Slug: test-embed
Page Type: embed
Theme: light (デフォルト)
Size: full (デフォルト)
Email Label: メールアドレス
Email Placeholder: example@email.com
Button Text: 登録する
Success Message: 登録が完了しました。確認メールをご確認ください。
```

**テストURL:**
```
Light + Full: https://edgeshift.tech/newsletter/embed/test-embed?theme=light&size=full
Dark + Compact: https://edgeshift.tech/newsletter/embed/test-embed?theme=dark&size=compact
```

**テスト手順:**

1. `/admin/signup-pages/new` で `page_type: embed` のページを作成
2. フォームラベル、プレースホルダー、ボタンテキストをカスタマイズ
3. `/newsletter/embed/test-embed` に直接アクセス
4. クエリパラメータの組み合わせをテスト:
   - `?theme=light&size=full`
   - `?theme=dark&size=compact`
5. 埋め込みフォームから購読を送信
6. Double Opt-in メールを受信し、確認が機能することを検証
7. 管理画面で埋め込みコード生成機能を確認

**検証ポイント:**

- [ ] page_type 分岐（landing/embed）が正しく動作する
- [ ] テーマ切り替え（light/dark）が正しく反映される
- [ ] サイズ切り替え（compact/full）が正しく反映される
- [ ] 埋め込みフォーム経由の購読が正常に完了する
- [ ] 埋め込みコード生成UIが正しく動作する

#### 2-3: Unsubscribe検証

**目的:** 購読解除後に配信が停止されることを検証。

**Unsubscribe リンク:**
```
メール下部の "Unsubscribe" リンクをクリック
URL形式: https://edgeshift.tech/api/newsletter/unsubscribe/{token}
確認ページ: https://edgeshift.tech/newsletter/unsubscribed
```

**テスト手順:**

1. テスト用購読者でメール内の Unsubscribe リンクをクリック
2. Unsubscribe 確認ページに遷移することを確認
3. 管理画面で購読者のステータスが `unsubscribed` に変更されたことを確認
4. 新規キャンペーンを作成・配信
5. unsubscribed ユーザーに配信されないことを確認（delivery_logs に記録されない）
6. 既存のシーケンスメールも停止されることを確認（翌日のステップ 4-5 が届かない）

**検証ポイント:**

- [ ] Unsubscribe リンクが機能する
- [ ] ステータスが `unsubscribed` に更新される
- [ ] キャンペーン配信で unsubscribed ユーザーが除外される
- [ ] シーケンスメールで unsubscribed ユーザーが除外される
- [ ] Unsubscribe 後も管理画面で購読者データが参照できる

---

### TB-3: 管理者視点の操作

#### 3-1: キャンペーン配信テスト

**目的:** キャンペーンの作成、配信、トラッキングの検証。

**キャンペーン 1: Click Tracking テスト**

```
キャンペーン名: Test Campaign - Click Tracking
件名: EdgeShift月刊レポート - 2025年12月号
配信先: 全購読者 (または Test Contact List)
配信方法: 即時配信

本文:
EdgeShift Newsletter 購読者の皆様へ

12月の月刊レポートをお届けします。今月は特に、エッジコンピューティングの実践的な活用事例が増加しました。

【今月のハイライト】

🏠 ポートフォリオサイト構築ガイド
Cloudflare Pagesを使った高速なポートフォリオサイトの構築方法を解説しています。
→ 記事を読む: https://edgeshift.tech/

🚀 実践プロジェクト集
実際に運用中のプロジェクト事例をご紹介。設計から運用まで、実践的な知見が詰まっています。
→ プロジェクト一覧: https://edgeshift.tech/projects

💬 お問い合わせフォーム実装ガイド
Workers + D1 を使った問い合わせフォームの実装例を公開しました。
→ 実装ガイド: https://edgeshift.tech/contact

📚 開発リソース
GitHubリポジトリで実際のコードを公開中。ぜひご活用ください。
→ GitHubはこちら: https://github.com/kuma8088

【次回予告】
来月は、パフォーマンス最適化の実践的なテクニックを特集します。

ご質問やフィードバックがございましたら、お気軽にお問い合わせください。

Best regards,
EdgeShift チーム

---
EdgeShift - Building at the Edge
https://edgeshift.tech
---
```

**キャンペーン 2: mail-tester.com 用**

```
キャンペーン名: Test Campaign - mail-tester
件名: EdgeShift Newsletter: Cloudflare Workers でサーバーレス API を構築する
配信先: mail-tester.com の一時アドレス
配信方法: 即時配信

本文:
EdgeShift Newsletter をご購読いただき、ありがとうございます。

今回は、Cloudflare Workers を使用してスケーラブルかつコスト効率の高い API を構築する方法についてご紹介します。エッジコンピューティングが Web 開発の領域を変革し続ける中、サーバーレスアーキテクチャの理解は現代の開発者にとって不可欠なスキルとなっています。

Cloudflare Workers は、ユーザーにより近いエッジでコードを実行することで、サーバーレスコンピューティングへの独自のアプローチを提供します。これにより、特にグローバルに分散したアプリケーションにおいて、レイテンシが大幅に削減され、ユーザーエクスペリエンスが向上します。

本記事では、以下の内容を取り上げます:

1. 最初の Cloudflare Worker のセットアップ
2. データベース操作のための Cloudflare D1 への接続
3. 認証とレート制限の実装
4. 本番デプロイのベストプラクティス

Workers、D1、KV ストレージの組み合わせにより、従来のサーバーインフラストラクチャを管理することなく、フルスタックアプリケーションを構築するための強力なプラットフォームが実現します。

詳細な記事はこちらからお読みいただけます:
https://edgeshift.tech/articles/cloudflare-workers-guide

ご質問やフィードバックがございましたら、お気軽にお問い合わせください。サーバーレスアーキテクチャに関するご経験をぜひお聞かせください。

よろしくお願いいたします。
EdgeShift チーム

---
EdgeShift - Building at the Edge
https://edgeshift.tech
---
```

**テスト手順:**

1. 管理画面で上記内容のキャンペーンを作成
2. Tiptap エディタで装飾（太字、リンク）を追加
3. コンタクトリストを選択（または全購読者）
4. プレビュー機能で表示を確認
5. 即時配信または5分後配信を実行
6. メールを受信し、複数のリンク (A-D) をクリック
7. 同じリンクを複数回クリック（重複カウント処理の確認）
8. `/admin/campaigns/detail?id=xxx` で統計を確認

**検証ポイント:**

- [ ] Tiptap エディタで編集可能
- [ ] プレビュー機能が動作する
- [ ] 即時/予約配信が動作する
- [ ] 開封トラッキングが記録される
- [ ] Click Tracking が各リンクを個別に記録する
- [ ] 分析UIが統計を正確に表示する

#### 3-2: コンタクトリストテスト

**目的:** コンタクトリストのCRUDとリスト指定配信の検証。

**コンタクトリスト設定:**

```
リスト名: Test Contact List
説明: ユーザーテスト用のコンタクトリスト（Batch TB）
```

**追加するメンバー:**
```
あなたの個人メールアドレス（登録した購読者）
```

**テスト手順:**

1. `/admin/contact-lists` で新規リストを作成
2. 名前と説明を入力
3. 個人メール（購読者）をリストに追加
4. リスト詳細でメンバー表示を確認
5. 「テスト購読者リスト」を選択してキャンペーンを作成
6. 配信実行し、リストメンバーのみが受信することを確認
7. リスト詳細でメンバー数を確認
8. キャンペーン統計でリスト指定配信の結果を確認

**検証ポイント:**

- [ ] リストの作成/編集/削除が動作する
- [ ] メンバーの追加/削除が動作する
- [ ] リスト指定配信が正しい宛先に届く
- [ ] リスト詳細画面が正確に表示される

---

### Extra: mail-tester.com 評価

**目的:** メール配信性とスパムスコアの評価。

**テスト手順:**

1. mail-tester.com にアクセスし、一時的なテストメールアドレスを取得
2. TB-3-1 の「キャンペーン 2: mail-tester.com 用」を使用して配信
3. mail-tester.com で評価結果を確認

**検証ポイント:**

- [ ] スパムスコア（目標: 10点満点中8点以上）
- [ ] SPF / DKIM / DMARC が正しく設定されている
- [ ] HTML 構造に問題がない
- [ ] ブラックリストに登録されていない
- [ ] 問題が見つかった場合、TB-5 の改善項目として記録

---

### TB-5: フィードバック収集と改善

**目的:** UX フィードバックを収集し、問題に対処する。

**アプローチ:** ハイブリッド

| 問題の規模 | アクション |
|------------|--------|
| 小規模（< 15分で修正可能） | 即座に修正し、ログに記録 |
| 大規模（> 15分かかる） | 記録のみ、別タスクとして作成 |

**評価基準:**

1. **編集UX（Tiptap、フォーム）**
   - ツールバーは直感的か？
   - 設定項目が多すぎないか？
   - プレビュー機能は十分か？

2. **閲覧コンテンツ（分析、統計）**
   - 表示される指標は意思決定に役立つか？
   - クリック詳細の粒度は適切か？
   - シーケンス統計は実用的か？

**記録方法:**

1. 気づいた点を Obsidian のデイリーノートに即座に記録
   - 問題の説明
   - なぜ気になったか
   - 改善のアイデア
   - 該当する場合はスクリーンショット

2. 即座に対処した場合は「修正済み」とマーク

3. TB-5 終了時にノートをレビューし:
   - 残っている項目については GitHub Issue を作成
   - または newsletter_system_expansion.md に記録

---

## 既知の制限事項

### 登録直後の即時送信

**現状:** 未実装

**動作:**
- `delay_days=0` は「登録直後」ではなく「同一JST日付の指定時刻」を意味する
- 14:00 JST に登録し、`delay_days=0, delay_time="09:00"` の場合、メールは送信されない（09:00 は既に過ぎている）

**テスト時の回避策:**
- 最初のステップの delay_time より前に登録する（例: 09:00 送信のために 08:00 に登録）

**今後の開発:**
- `delay_minutes` カラムまたは `send_immediately` フラグを追加
- newsletter_system_mvp.md に MVP 拡張として記録済み

---

## テストスケジュール

| 日 | 時刻 | アクティビティ |
|-----|------|----------|
| 1日目 | 07:30 | 管理画面でテスト用シーケンスとキャンペーンを準備 |
| 1日目 | 08:00 | 個人メールで登録 |
| 1日目 | 09:00-09:30 | ステップ 1-3 を受信、リンクをクリック |
| 1日目 | 10:00 | 分析を確認、埋め込みフォームをテスト |
| 1日目 | 11:00 | コンタクトリストとキャンペーン配信をテスト |
| 1日目 | 14:00 | mail-tester.com 評価 |
| 2日目 | 09:00 | ステップ 4 を受信、デフォルト時刻を確認 |
| 2日目 | 14:00 | ステップ 5 を受信、指定時刻を確認 |
| 2日目 | 15:00 | TB-5: 発見事項のレビュー、問題対処 |

---

## テスト後のクリーンアップ

**目的:** 本番環境のテストデータを削除し、統計の汚染を防ぐ。

**クリーンアップ手順:**

1. **自動クリーンアップスクリプト実行:**
   ```bash
   cd tests/e2e
   npx tsx helpers/cleanup.ts
   ```

   削除される内容:
   - `test+*@edgeshift.tech` パターンの購読者
   - 関連する delivery_logs
   - 関連する subscriber_sequences
   - 関連する contact_list_members

2. **手動クリーンアップ（管理画面で）:**
   - キャンペーン: "Test" で始まる名前のものを削除
   - シーケンス: "Test Sequence" で始まる名前のものを削除
   - コンタクトリスト: "テスト購読者リスト" を削除
   - Signup Pages: "test-embed" などテスト用ページを無効化

**命名規則:**
- 全てのテストリソースは "Test" または "テスト" で始める
- メールアドレスは `test+*@edgeshift.tech` 形式を使用
- クリーンアップ時に識別可能にする

---

## 成功基準

- [ ] 全シーケンスステップが正しい時刻に配信される
- [ ] Click Tracking が全リンククリックを正確に記録する
- [ ] コンタクトリスト選択でキャンペーン配信が動作する
- [ ] 埋め込みフォームが全 theme/size の組み合わせで機能する
- [ ] mail-tester.com スコアが 8/10 以上
- [ ] 重大なバグが発見されない
- [ ] UX 問題が将来の改善のために文書化される

---

## 参考資料

- [newsletter_system_mvp.md](../portfolio_site/newsletter_system/newsletter_system_mvp.md) - MVP 仕様
- [newsletter_system_expansion.md](../portfolio_site/newsletter_system/newsletter_system_expansion.md) - 今後のフェーズ

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|---------|---------|
| 2025-12-26 | v1.0 | 初版テスト計画を作成 |
