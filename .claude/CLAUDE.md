# CLAUDE.md - プロジェクト設定ファイル v2.0

> このファイルは Claude Code が毎回読み込むプロジェクトルールです。
> 詳細なルールは `.claude/rules/` ディレクトリに分割されています。

---

## [PROJECT] プロジェクト概要

```yaml
name: "プロジェクト名"
description: "プロジェクトの簡潔な説明"
type: "web-app | api | infrastructure | cli | library"
stage: "planning | mvp | development | production"
```

---

## [PRD] 製品要件書（該当する場合）

### 概要

```yaml
project_name: ""
purpose: ""
target_users: ""
success_metrics: ""
```

### コア機能

```
1. [機能名]: [説明]
2. [機能名]: [説明]
3. [機能名]: [説明]
```

### 非機能要件

```
- パフォーマンス:
- セキュリティ:
- スケーラビリティ:
- 可用性:
```

---

## [TASKS] タスク管理

### タスク分割の原則

```
1タスク = 1〜2時間で完了可能な粒度
依存関係を明確にする
複雑なタスクはサブタスクに分解
各タスクに完了条件を定義
```

### タスクファイル構造（推奨）

```
docs/
├── 00_prd.md              # 製品要件書
├── 01_setup.md            # 環境構築
├── 02_feature-xxx.md      # 機能A
├── 03_feature-yyy.md      # 機能B
└── 99_release-checklist.md # リリースチェック
```

### タスクステータス

```
[ ] pending    - 未着手
[~] in-progress - 作業中
[x] completed  - 完了
[!] blocked    - ブロック中
[-] cancelled  - キャンセル
```

---

## [TECH] 技術スタック

```yaml
language: ""        # TypeScript, Python, Go, etc.
framework: ""       # Next.js, FastAPI, etc.
infrastructure: ""  # AWS, GCP, Terraform, etc.
database: ""        # PostgreSQL, Supabase, DynamoDB, etc.
styling: ""         # Tailwind, CSS Modules, etc.
```

### 重要なディレクトリ

```
src/           # ソースコード
docs/          # ドキュメント・チケット
tests/         # テストファイル
infrastructure/  # Terraform/IaC
```

---

## [CUSTOM] プロジェクト固有のルール

<!-- プロジェクトごとにここに追記 -->

```
# 例:
# - このプロジェクトでは Prisma を使用
# - API のベースパスは /api/v1
# - コンポーネントは src/components に配置
```

---

## ルール構成

詳細なルールは `.claude/rules/` に分割されています：

| ファイル | 適用条件 | 内容 |
|:--|:--|:--|
| `general.md` | 常時 | 基本ルール・出力形式 |
| `anti-degradation.md` | 常時 | モデル品質劣化対策 |
| `typescript.md` | `**/*.ts`, `**/*.tsx` | TypeScript規約 |
| `python.md` | `**/*.py` | Python規約 |
| `terraform.md` | `**/*.tf` | Terraform規約 |
| `nextjs.md` | `src/app/**/*` | Next.js規約 |
| `aws-infra.md` | `infrastructure/**/*` | AWS規約 |
| `supabase.md` | `supabase/**/*` | Supabase規約 |
| `security.md` | `**/auth/**/*` 等 | セキュリティ規約 |
| `test.md` | `**/*.test.ts` 等 | テスト規約 |

---

## バージョン履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v2.0 | 2025-12 | .claude/rules/ による分割構成に移行 |
