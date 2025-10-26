# 基底レビュー観点

**目的**: すべてのPRで必ず確認すべき基本的な観点

---

## TypeScript型安全性: `any`を使用しない

### ❌ 禁止
```typescript
const data: any = JSON.parse(response);
function process(input: any) { ... }
const result: any = await apiCall();
```

### ✅ 推奨

#### 1. 具体的な型を定義
```typescript
interface NewsArticle {
  title: string;
  url: string;
  published_at: string | null;
}

const article: NewsArticle = {
  title: "Sample",
  url: "https://example.com",
  published_at: null
};
```

#### 2. 型推論を活用
```typescript
// 型推論で自動的にstring型
const message = "Hello";

// 関数の戻り値も推論される
function getTotal(items: number[]) {
  return items.reduce((sum, n) => sum + n, 0);  // number型
}
```

#### 3. 不明な型は`unknown`を使用
```typescript
const data: unknown = JSON.parse(response);

// 型ガードで安全に使用
if (typeof data === 'object' && data !== null) {
  // ここでdataを使用
}
```

#### 4. 外部データは必ずZodでバリデーション
```typescript
import { z } from 'zod';

const ArticleSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  published_at: z.string().nullable()
});

// バリデーション + 型推論
const article = ArticleSchema.parse(jsonData);
// article の型は自動的に { title: string; url: string; published_at: string | null }
```

---

## 🎯 重要度

| 重要度 | 説明 |
|-------|------|
| `high` | `any`の使用は原則禁止。型安全性を損なう重大な問題 |

---

## 💡 例外的に許容されるケース

以下の場合のみ、理由を明記してコメントを付ければ`any`の使用を許容します：

```typescript
// OK: サードパーティライブラリの型定義が不完全な場合
// @ts-expect-error - ライブラリの型定義が古いため
const result: any = legacyLibrary.process(data);
```

**条件**:
- コメントで理由を明記
- 可能な限り型アサーションで型を絞る
- 将来的な型定義の改善を検討
