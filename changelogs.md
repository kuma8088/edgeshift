# Changelog

## 2026-01-14

### feat: Udemy-style email design with YouTube thumbnail support

メールデザインをUdemyスタイルに刷新し、YouTubeサムネイル自動表示機能を追加。

**Phase 1: デザイン刷新**
- グレー背景 (#f5f5f5) + 白コンテンツボックスのレイアウト
- line-height: 1.8 → 1.6 に調整（広すぎた行間を修正）
- 適切なパディング・マージンで読みやすさ向上

**Phase 2: 名前表示制御**
- デフォルトで名前を表示しない
- `{{name}}` 変数を明示的に使用した場合のみ表示

**Phase 3: YouTubeサムネイル**
- YouTube URL を自動検出
- クリック可能なサムネイル画像に変換
- 対応形式: youtube.com/watch?v=, youtu.be/, youtube.com/embed/

**更新ファイル:**
- `workers/newsletter/src/lib/templates/styles.ts`
- `workers/newsletter/src/lib/templates/variables.ts`
- `workers/newsletter/src/lib/templates/presets/*.ts` (5ファイル)
- `workers/newsletter/src/routes/subscribe.ts`
- `workers/newsletter/src/routes/broadcast.ts`
- `workers/newsletter/src/scheduled.ts`

---

### feat: Japanese typography optimization for email templates

日本語メールの可読性向上のため、フォントとタイポグラフィを最適化。

**変更内容:**
- 共通スタイル定数ファイル `styles.ts` を新規作成
- 全メールテンプレートに日本語フォントスタックを適用
- 行間・文字間隔を日本語向けに調整

**適用されたスタイル:**
| 項目 | Before | After |
|------|--------|-------|
| font-family | システムフォントのみ | 日本語フォント追加（Hiragino, Meiryo） |
| font-size (本文) | 未指定 | 16px |
| line-height | 1.6 | 1.8 |
| letter-spacing | なし | 0.02em |

**更新ファイル:**
- `workers/newsletter/src/lib/templates/styles.ts` (新規)
- `workers/newsletter/src/lib/templates/presets/*.ts` (5ファイル)
- `workers/newsletter/src/routes/subscribe.ts`
- `workers/newsletter/src/routes/broadcast.ts`
- `workers/newsletter/src/scheduled.ts`

---

### fix: campaign send auth - use async auth check

キャンペーン送信時の401エラーを修正。

**原因:** `campaign-send.ts` で同期版 `isAuthorized()` を使用しており、CF Access 認証に対応していなかった。

**修正:** `isAuthorizedAsync()` に変更し、API Key + CF Access + Session Cookie 全てに対応。

**更新ファイル:**
- `workers/newsletter/src/routes/campaign-send.ts`
