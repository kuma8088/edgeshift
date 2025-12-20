# Deployment Workflow

> EdgeShift Portfolio のデプロイフロー

## Overview

```
Local Development → GitHub → Cloudflare Pages → Public
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Local Machine                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  npm run dev                                                 │   │
│  │  → http://localhost:4321                                     │   │
│  │                                                              │   │
│  │  Edit files in src/                                          │   │
│  │  → Hot reload                                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ git push (feature branch)            │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           GITHUB                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Repository: edgeshift                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Pull Request                                                │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  GitHub Actions (ci.yml)                             │    │   │
│  │  │  1. npm ci                                           │    │   │
│  │  │  2. npm run check (type check)                       │    │   │
│  │  │  3. npm run build                                    │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ CI passes → Deploy preview           │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE PAGES                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Preview Environment (per PR)                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  URL: https://pr-{number}.edgeshift.pages.dev               │   │
│  │  → PR ごとにプレビュー環境が自動生成                          │   │
│  │  → レビュー・動作確認用                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ PR merged to main                    │
│                                                                     │
│  Production Environment                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  URL: https://edgeshift.pages.dev                           │   │
│  │  → main ブランチへのマージで自動デプロイ                      │   │
│  │                                                              │   │
│  │  (Phase 2: Custom Domain)                                    │   │
│  │  URL: https://edgeshift.dev                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step

### 1. Local Development

```bash
# 開発サーバー起動
npm run dev

# ブラウザで確認
open http://localhost:4321

# ビルド確認（本番と同じ出力）
npm run build
npm run preview
```

### 2. Push to GitHub

```bash
# 変更をコミット
git add .
git commit -m "feat: add new portfolio item"

# feature branch で push
git push origin feature/new-content
```

### 3. Create Pull Request

- GitHub で PR を作成
- GitHub Actions が自動実行（CI）
- Cloudflare Pages がプレビューURLを生成

### 4. Review & Merge

- プレビューURLで動作確認
- コードレビュー
- main にマージ → 本番自動デプロイ

---

## URLs

| Environment | URL | Trigger |
|:------------|:----|:--------|
| Local | http://localhost:4321 | `npm run dev` |
| Preview | https://pr-{N}.edgeshift.pages.dev | PR 作成時 |
| Production | https://edgeshift.pages.dev | main マージ時 |
| Custom (Phase 2) | https://edgeshift.dev | DNS 設定後 |

---

## GitHub Actions Configuration

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run check

      - name: Build
        run: npm run build
```

### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: edgeshift
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

---

## Required Secrets (GitHub)

| Secret | Description | Where to get |
|:-------|:------------|:-------------|
| `CF_API_TOKEN` | Cloudflare API Token | Cloudflare Dashboard → API Tokens |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | Cloudflare Dashboard → Overview |

---

## Initial Setup Checklist

- [ ] GitHub リポジトリ作成
- [ ] Cloudflare Pages プロジェクト作成（Dashboard or Terraform）
- [ ] GitHub Secrets 設定（CF_API_TOKEN, CF_ACCOUNT_ID）
- [ ] GitHub Actions ワークフロー作成
- [ ] 初回デプロイ確認

---

## Terraform (Optional)

Cloudflare Pages プロジェクトを Terraform で管理する場合:

```bash
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

詳細は `terraform/` ディレクトリを参照。
