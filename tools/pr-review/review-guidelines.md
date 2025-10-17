# PRレビュー観点

このファイルは、Claude AIがPRレビューを実施する際の観点を定義します。

---

## Part 1: コード品質の基本原則（ベストプラクティス）

### 1. 可読性・保守性

コードの読みやすさと保守しやすさを確保します。

**チェック項目**:

#### DRY原則（Don't Repeat Yourself）
- 同じロジックの重複を避ける
- 共通処理は関数・クラスとして抽出
- コピー&ペーストコードの検出

**NG**:
```typescript
// 重複コード
if (user.age >= 18 && user.country === 'JP') { ... }
if (user.age >= 18 && user.country === 'JP') { ... }
```

**OK**:
```typescript
function isAdultInJapan(user) {
  return user.age >= 18 && user.country === 'JP';
}
```

#### 早期リターン
- ネストを浅く保つ
- ガード句を活用

**NG**:
```typescript
function process(data) {
  if (data) {
    if (data.valid) {
      // 深いネスト...
    }
  }
}
```

**OK**:
```typescript
function process(data) {
  if (!data) return;
  if (!data.valid) return;
  // フラットなコード
}
```

#### マジックナンバー回避
- 定数として定義
- 意図を明確に

**NG**:
```typescript
if (users.length > 100) { ... }  // 100の意味は？
```

**OK**:
```typescript
const MAX_USERS_PER_PAGE = 100;
if (users.length > MAX_USERS_PER_PAGE) { ... }
```

#### 意図が明確な命名
- 変数名・関数名から目的が分かる
- 省略形を避ける（一般的なものを除く）

**NG**:
```typescript
const d = new Date();  // 何のdate？
function proc(x) { ... }  // 何を処理？
```

**OK**:
```typescript
const articlePublishedDate = new Date();
function processNewsArticle(article) { ... }
```

**重要度**: `medium` または `low`（DRY違反は `high`）

---

### 2. 型安全性の基本

TypeScriptの型システムを活用し、実行時エラーを防ぎます。

**チェック項目**:

#### `any`の最小化
- 型推論を活用
- 不明な型は`unknown`を使用

**NG**:
```typescript
const data: any = JSON.parse(response);
```

**OK**:
```typescript
const data: unknown = JSON.parse(response);
// または
const data = JSON.parse(response) as MyType;
```

#### nullチェック・型ガード
- optional chain (`?.`)の活用
- 型ガード関数の実装

**NG**:
```typescript
function getName(user) {
  return user.profile.name;  // userやprofileがundefinedの可能性
}
```

**OK**:
```typescript
function getName(user: User | undefined): string | undefined {
  return user?.profile?.name;
}
```

#### 外部データのバリデーション
- APIレスポンス、ユーザー入力は必ずバリデーション
- Zodスキーマの活用

**NG**:
```typescript
const config = JSON.parse(fs.readFileSync('config.json'));
```

**OK**:
```typescript
const ConfigSchema = z.object({
  port: z.number(),
  host: z.string()
});
const config = ConfigSchema.parse(JSON.parse(...));
```

**重要度**: `high`（バリデーション不足は `critical`）

---

### 3. エラーハンドリング

適切なエラー処理で、システムの堅牢性を確保します。

**チェック項目**:

#### try-catchの適切な配置
- エラーが発生しうる箇所を保護
- エラーを握りつぶさない

**NG**:
```typescript
try {
  await apiCall();
} catch (e) {
  // 何もしない（エラーを握りつぶす）
}
```

**OK**:
```typescript
try {
  await apiCall();
} catch (error) {
  console.error('API call failed:', error);
  throw new Error('Failed to fetch data');
}
```

#### 具体的なエラーメッセージ
- ユーザーが原因を理解できる
- デバッグに必要な情報を含む

**NG**:
```typescript
throw new Error('Error');
```

**OK**:
```typescript
throw new Error(
  `Failed to read config file: ${configPath}. ` +
  `Please run setup command first.`
);
```

#### エラーの種類による処理分岐
- リトライ可能なエラーとそうでないエラーを区別

**重要度**: `high`

---

### 4. パフォーマンスの基本

不要な処理を避け、効率的なコードを書きます。

**チェック項目**:

#### 無駄なループ回避
- 配列操作は適切なメソッドを使用
- 早期終了の活用

**NG**:
```typescript
let found = null;
for (const item of items) {
  if (item.id === targetId) {
    found = item;  // 見つかっても続行
  }
}
```

**OK**:
```typescript
const found = items.find(item => item.id === targetId);
```

#### N+1クエリ問題
- データベースアクセスをループ外で
- バッチ取得の活用

**NG**:
```typescript
for (const user of users) {
  const posts = await db.query('SELECT * FROM posts WHERE user_id = ?', user.id);
}
```

**OK**:
```typescript
const userIds = users.map(u => u.id);
const posts = await db.query('SELECT * FROM posts WHERE user_id IN (?)', userIds);
```

#### 大きなファイルの処理
- ストリーム処理を活用
- 全読み込みを避ける

**重要度**: `high` または `medium`

---

### 5. セキュリティの基本

セキュリティリスクを排除します。

**チェック項目**:

#### 機密情報のハードコード禁止
- API KEY、トークン、パスワード
- 環境変数経由で取得

**NG**:
```typescript
const apiKey = 'sk-ant-api-xxx...';
```

**OK**:
```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY is required');
}
```

#### ユーザー入力の検証
- すべての外部入力をバリデーション
- ホワイトリスト方式の採用

**NG**:
```typescript
const path = userInput;  // 未検証
fs.readFileSync(path);
```

**OK**:
```typescript
const PathSchema = z.string().regex(/^[a-zA-Z0-9\-_\/]+$/);
const path = PathSchema.parse(userInput);
```

#### SQLインジェクション対策
- prepared statementの使用
- 文字列連結によるクエリ構築を避ける

**NG**:
```typescript
db.query(`SELECT * FROM users WHERE name = '${userName}'`);
```

**OK**:
```typescript
db.query('SELECT * FROM users WHERE name = ?', [userName]);
```

**重要度**: `critical`

---

## 重要度の基準

| 重要度 | 説明 | 対応優先度 |
|-------|------|-----------|
| `critical` | セキュリティリスク・システム障害の可能性 | 🔴 即座に修正必須 |
| `high` | パフォーマンス問題・保守性への大きな影響 | 🟠 PR内で修正推奨 |
| `medium` | コード品質の問題 | 🟡 PR内または次のタスクで対応 |
| `low` | 軽微な改善提案 | 🟢 任意で対応 |

---

## レビュー時のガイドライン

### 指摘の仕方

✅ **Good**:
```
🔴 **[critical] セキュリティ**: API KEYがハードコードされています

**該当箇所**: src/core/agent.ts:42
**問題**: 環境変数ではなく、直接コードにAPI KEYが記載されています
**影響**: GitHubに機密情報が公開され、悪用される可能性があります
**推奨対応**: `process.env.ANTHROPIC_API_KEY`から取得してください
```

❌ **Bad**:
```
問題があります。修正してください。
```

### ポジティブフィードバック

良い実装も積極的に評価してください（summaryで言及）:
- 「適切な型定義がされています」
- 「エラーハンドリングが丁寧に実装されています」
- 「テストカバレッジが高く、品質が担保されています」

---

## カスタマイズ方法

このファイルを編集することで、レビュー観点を追加・変更できます。

**次のステップ**: プロジェクト固有の観点を追加
- Bun API優先使用
- Claude Agent SDK制約
- MCPサーバー管理
- macOS固有の制約
- etc.
