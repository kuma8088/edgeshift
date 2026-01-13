# Changelog

## 2026-01-14

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
