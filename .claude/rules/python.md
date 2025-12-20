---
paths:
  - "**/*.py"
---

# Python コーディング規約

---

## 型ヒント

```python
# Good: 型ヒントを使用
def process_data(items: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in items:
        result[item] = len(item)
    return result

# Bad: 型ヒントがない
def process_data(items):
    result = {}
    for item in items:
        result[item] = len(item)
    return result
```

---

## クラスの型ヒント

```python
from dataclasses import dataclass
from typing import Optional

# Good: dataclass で型安全に
@dataclass
class User:
    id: int
    name: str
    email: Optional[str] = None

# Good: 戻り値の型も明示
def get_user(user_id: int) -> User | None:
    ...
```

---

## エラーハンドリング

```python
# Good: 具体的な例外をキャッチ
try:
    result = api_client.fetch_data()
except ConnectionError as e:
    logger.error(f"Connection failed: {e}")
    raise ServiceUnavailableError("API is temporarily unavailable") from e
except TimeoutError as e:
    logger.warning(f"Request timed out: {e}")
    return None

# Bad: 全ての例外をキャッチ
try:
    result = api_client.fetch_data()
except Exception:
    pass  # 問題を隠蔽
```

---

## インポート順序

```python
# 1. 標準ライブラリ
import os
import sys
from datetime import datetime

# 2. サードパーティ
import requests
from fastapi import FastAPI

# 3. ローカルモジュール
from app.models import User
from app.utils import helper
```

---

## 命名規則

```python
# 変数・関数: snake_case
user_name = "John"
def get_user_by_id(user_id: int) -> User:
    ...

# クラス: PascalCase
class UserService:
    ...

# 定数: UPPER_SNAKE_CASE
MAX_RETRY_COUNT = 3
API_BASE_URL = "https://api.example.com"

# プライベート: _prefix
class Service:
    def __init__(self):
        self._cache: dict = {}  # 内部用

    def _internal_method(self):  # 内部用
        ...
```

---

## ドキュメント文字列

```python
def calculate_total(
    items: list[dict[str, float]],
    tax_rate: float = 0.1
) -> float:
    """
    商品リストの合計金額を計算する。

    Args:
        items: 商品リスト。各商品は {'price': float, 'quantity': int} 形式。
        tax_rate: 税率。デフォルトは 10%。

    Returns:
        税込み合計金額。

    Raises:
        ValueError: items が空の場合。
    """
    if not items:
        raise ValueError("items cannot be empty")

    subtotal = sum(item['price'] * item['quantity'] for item in items)
    return subtotal * (1 + tax_rate)
```

---

## リスト内包表記

```python
# Good: シンプルな内包表記
squares = [x ** 2 for x in range(10)]
evens = [x for x in numbers if x % 2 == 0]

# Bad: 複雑すぎる内包表記（通常のループに分割する）
result = [
    transform(item)
    for sublist in nested_list
    for item in sublist
    if condition1(item) and condition2(item)
]
```

---

## 禁止パターン

```python
# グローバル変数の乱用
global_data = []  # Bad

# mutable なデフォルト引数
def append_item(item, items=[]):  # Bad: バグの温床
    items.append(item)
    return items

# Good: None を使用
def append_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```
