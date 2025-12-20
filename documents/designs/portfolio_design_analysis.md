# EdgeShift Portfolio - デザインシステム分析 & 改善提案

> Generated: 2025-12-20
> Tool: ui-designer skill

---

## 1. 現在のデザインシステム

### 色彩パレット

#### プライマリカラー
| 名前 | HEX | 用途 |
|:-----|:----|:-----|
| Primary Dark | `#1e1e1e` | テキスト、ボタン背景、フッター |
| Primary White | `#ffffff` | カード背景、セクション背景 |

#### セカンダリカラー
| 名前 | HEX | 用途 |
|:-----|:----|:-----|
| Secondary Text | `#525252` | 説明文、サブテキスト |
| Muted Text | `#737373` | 補足情報、ラベル |
| Light Muted | `#a3a3a3` | プレースホルダー、インデックス番号 |

#### アクセントカラー
| 名前 | HEX | 用途 |
|:-----|:----|:-----|
| Accent Purple | `#7c3aed` | Hero "Edge"、ホバー状態、カテゴリラベル |
| Accent Light | `#c4b5fd` | Hero背景グラデーション |

#### 背景カラー
| 名前 | HEX | 用途 |
|:-----|:----|:-----|
| Background Light | `#f5f5f5` | セクション背景（Portfolio, Contact） |
| Background Diagram | `#fafafa` | アーキテクチャ図背景 |
| Border | `#e5e5e5` | カード枠線、セクション区切り |

### タイポグラフィ

#### フォントファミリー
```
-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif
```

#### テキストスタイル
| スタイル | サイズ | ウェイト | 用途 |
|:---------|:-------|:---------|:-----|
| Hero Title | 36px / 60px | Bold | メインタイトル |
| Section Title | 30px | Bold | セクション見出し |
| Card Title | 20px | Semibold | ポートフォリオタイトル |
| Body | 16px | Regular | 本文 |
| Body Small | 14px | Regular | 説明文（`text-sm`） |
| Caption | 12px | Regular/Medium | タグ、ラベル |

### スペーシングシステム

| サイズ | 値 | 用途 |
|:-------|:---|:-----|
| Section Padding | 96px (py-24) | セクション上下余白 |
| Container Max | 896px / 1024px | コンテンツ最大幅 |
| Card Padding | 24px (p-6) | カード内余白 |
| Gap Small | 8px (gap-2) | タグ間 |
| Gap Medium | 16px (gap-4) | ボタン間 |
| Gap Large | 32px (gap-8) | カード間 |

### コンポーネントスタイル

#### ボタン
- **プライマリ**: `bg-[#1e1e1e] text-white px-6 py-3 rounded`
- **ホバー**: `bg-[#333]`
- **トランジション**: `transition-colors`

#### カード
- **背景**: `bg-white`
- **枠線**: `border border-[#e5e5e5]`
- **角丸**: `rounded-lg`
- **シャドウ**: `shadow-sm`
- **ホバー**: `hover:border-[#7c3aed]/50`

#### タグ
- **背景**: `bg-[#f5f5f5]`
- **テキスト**: `text-[#737373]`
- **枠線**: `border border-[#e5e5e5]`
- **サイズ**: `text-xs px-3 py-1 rounded`

---

## 2. 改善提案

### 優先度: 高

#### 2.1 視覚的階層の強化

**現状の問題:**
- Hero セクションのインパクトが弱い
- ポートフォリオカード間のリズムが単調
- Skills セクションが平坦

**改善案:**
```astro
<!-- Hero: グラデーションテキストで強調 -->
<span class="bg-gradient-to-r from-[#7c3aed] to-[#a855f7] bg-clip-text text-transparent">
  Edge
</span>

<!-- Portfolio: 奇数偶数でレイアウト反転 -->
<article class={index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}>

<!-- Skills: アイコン追加 -->
<div class="flex items-center gap-3">
  <CloudIcon class="w-5 h-5 text-[#7c3aed]" />
  <span>AWS</span>
</div>
```

#### 2.2 インタラクティブ状態の改善

**現状の問題:**
- ホバーエフェクトが控えめすぎる
- フィードバックが視覚的に不十分

**改善案:**
```css
/* カードホバー - 浮き上がり効果 */
.portfolio-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.portfolio-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(124, 58, 237, 0.15);
}

/* ボタンホバー - スケール効果 */
.btn-primary:hover {
  transform: scale(1.02);
}
```

#### 2.3 モバイル体験の最適化

**現状の問題:**
- アーキテクチャ図がモバイルで読みにくい
- タッチターゲットが小さい

**改善案:**
1. アーキテクチャ図をモバイルでは非表示または簡略版に
2. タグのタッチターゲットを最低44px確保
3. Contact ボタンを縦並びに

```astro
<!-- モバイルでは図を隠す -->
<div class="hidden md:flex bg-[#fafafa] ...">
  <img src={project.image} ... />
</div>

<!-- モバイルでは縦並び -->
<div class="flex flex-col md:flex-row justify-center gap-4">
```

### 優先度: 中

#### 2.4 アクセントカラーの活用拡大

**現状:**
- アクセントカラー（#7c3aed）が限定的に使用

**改善案:**
- 認定バッジにアクセントカラーのアイコン追加
- Skills カテゴリにアイコン＋アクセントカラー
- Contact セクションにグラデーション背景

```astro
<!-- 認定バッジ -->
<div class="flex items-center gap-2">
  <svg class="w-5 h-5 text-[#7c3aed]"><!-- AWS icon --></svg>
  <span>AWS Solutions Architect</span>
</div>
```

#### 2.5 マイクロインタラクションの追加

**改善案:**
```css
/* スクロールインジケーター */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(8px); }
}

/* セクション表示アニメーション */
.section-enter {
  animation: fadeInUp 0.6s ease forwards;
}
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### 2.6 タイポグラフィの洗練

**改善案:**
- Hero サブタイトルの行間を広げる
- 説明文の max-width を制限して可読性向上

```astro
<p class="text-xl md:text-2xl text-[#525252] mb-10 max-w-xl mx-auto leading-relaxed">
  クラウドとデータで、ビジネスの境界を再定義する
</p>
```

### 優先度: 低

#### 2.7 ダークモード対応

**現状:**
- global.css にダークモード変数定義済みだが未使用

**改善案:**
```astro
<!-- ダークモードトグル追加 -->
<button id="theme-toggle" class="p-2 rounded hover:bg-[#f5f5f5]">
  <SunIcon class="dark:hidden" />
  <MoonIcon class="hidden dark:block" />
</button>
```

#### 2.8 パフォーマンス最適化

**改善案:**
- SVG アーキテクチャ図の遅延読み込み
- Hero 背景のグラデーションを CSS のみに（現状でOK）

---

## 3. 実装優先順位

| 優先度 | 項目 | 工数 | 効果 |
|:-------|:-----|:-----|:-----|
| 1 | カードホバーエフェクト | 低 | 高 |
| 2 | モバイルでの図非表示 | 低 | 中 |
| 3 | Skills アイコン追加 | 中 | 高 |
| 4 | Hero グラデーションテキスト | 低 | 中 |
| 5 | セクションアニメーション | 中 | 中 |
| 6 | ダークモード | 高 | 中 |

---

## 4. 推奨アクションプラン

### Phase 1: クイックウィン（1-2時間）
1. カードホバーエフェクトの強化
2. ボタンホバー時のスケール効果
3. モバイルでの Contact ボタン縦並び

### Phase 2: 視覚改善（2-4時間）
1. Skills セクションにアイコン追加
2. Hero テキストグラデーション
3. セクション表示アニメーション

### Phase 3: 機能追加（4-8時間）
1. ダークモード実装
2. アーキテクチャ図のモバイル対応

---

## 5. 参考デザインリソース

- **カラーコントラスト**: WCAG AA 準拠確認推奨
- **アイコン**: Lucide React / Heroicons 推奨
- **アニメーション**: Framer Motion / CSS のみでも可

