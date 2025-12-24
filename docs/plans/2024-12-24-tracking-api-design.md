# Tracking API (Batch 3C) Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** キャンペーン・購読者のトラッキングデータを取得するAPIを実装する

**Architecture:** 既存の `delivery_logs` と `click_events` テーブルからデータを集計し、JSON APIとして提供

**Tech Stack:** Cloudflare Workers, D1, TypeScript

---

## API Endpoints

| Endpoint | Description |
|:--|:--|
| `GET /api/campaigns/:id/tracking` | キャンペーントラッキングサマリー |
| `GET /api/campaigns/:id/clicks` | クリック全履歴 + サマリー |
| `GET /api/subscribers/:id/engagement` | 購読者エンゲージメント履歴 |

**認証:** 既存の `ADMIN_API_KEY` を使用（`Authorization: Bearer <key>`）

---

## Response Formats

### GET /api/campaigns/:id/tracking

```json
{
  "campaign_id": "camp-123",
  "subject": "Weekly Newsletter #10",
  "sent_at": 1703404800,
  "stats": {
    "total_sent": 100,
    "delivered": 95,
    "opened": 40,
    "clicked": 15,
    "bounced": 2,
    "failed": 3,
    "delivery_rate": 95.0,
    "open_rate": 42.1,
    "click_rate": 15.8
  }
}
```

**集計ロジック:**
- `total_sent`: `delivery_logs` で該当キャンペーンのレコード数
- `delivered/opened/clicked/bounced/failed`: `status` 別カウント
- `delivery_rate`: `delivered / total_sent * 100`
- `open_rate`: `opened / delivered * 100`
- `click_rate`: `clicked / delivered * 100`

### GET /api/campaigns/:id/clicks

```json
{
  "campaign_id": "camp-123",
  "summary": {
    "total_clicks": 37,
    "unique_clickers": 15,
    "unique_urls": 3
  },
  "clicks": [
    {
      "email": "user1@example.com",
      "name": "User 1",
      "url": "https://example.com/article1",
      "clicked_at": 1703404800
    }
  ]
}
```

**集計ロジック:**
- `click_events` と `delivery_logs` を JOIN
- `subscribers` から email/name を取得
- 全クリック履歴を時系列で返す

### GET /api/subscribers/:id/engagement

```json
{
  "subscriber": {
    "id": "sub-123",
    "email": "user@example.com",
    "name": "User Name",
    "status": "active"
  },
  "campaigns": [
    {
      "id": "camp-123",
      "subject": "Weekly Newsletter",
      "status": "clicked",
      "sent_at": 1703404800,
      "opened_at": 1703408400,
      "clicks": [
        { "url": "https://...", "clicked_at": 1703410000 }
      ]
    }
  ],
  "sequences": [
    {
      "id": "seq-123",
      "name": "Welcome Series",
      "steps": [
        {
          "step_number": 1,
          "subject": "Welcome!",
          "status": "opened",
          "sent_at": 1703300000,
          "opened_at": 1703303600,
          "clicks": []
        }
      ]
    }
  ]
}
```

**集計ロジック:**
- `delivery_logs` から該当購読者のレコードを取得
- `campaign_id` があるものはキャンペーン、`sequence_id` があるものはシーケンス
- 各配信ログに紐づく `click_events` を取得

---

## Error Handling

| Status | Condition |
|:--|:--|
| 401 | 認証エラー（API Key不正） |
| 404 | キャンペーン/購読者が見つからない |
| 500 | 内部エラー |

---

## Testing Strategy

| テスト対象 | テスト内容 |
|:--|:--|
| `/tracking` | サマリー計算、レート計算、空キャンペーン |
| `/clicks` | クリック履歴取得、サマリー計算、クリックなしケース |
| `/engagement` | キャンペーン・シーケンス両方表示、クリック紐付け |

---

*Created: 2024-12-24*
