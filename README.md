# gh-yml-to-mermaid

GitHub Actions のワークフロー YAML を Mermaid フローチャートに変換するツールです。

## 機能

- GitHub Actions YAML を Mermaid フローチャートに自動変換
- トリガー、ジョブ、ステップの可視化
- ジョブ間の依存関係（`needs`）の表示
- 条件分岐（`if`）のグラフィカル表示
- 再利用ワークフロー（`uses`）対応
- パネルサイズのドラッグ可変（左右分割 + 右側上下分割）

### 条件バッジ表示

`if` 条件をグラフィカルなバッジで表示し、初心者にも分かりやすい見た目にしています。

| 条件 | 表示 | ノード形状 | スタイル |
|---|---|---|---|
| `always()` | 🔄 Always Run | スタジアム型（丸角） | 青・塗りつぶし |
| `success()` | ✅ Success Only | スタジアム型（丸角） | 緑・塗りつぶし |
| `failure()` | ❌ Failure Only | スタジアム型（丸角） | 赤・塗りつぶし |
| `cancelled()` | ⛔ Cancelled | スタジアム型（丸角） | オレンジ・塗りつぶし |
| `!failure()` | ❌ NOT Failure Only | スタジアム型（丸角） | 赤・破線アウトライン |
| `!cancelled()` | ⛔ NOT Cancelled | スタジアム型（丸角） | オレンジ・破線アウトライン |
| カスタム条件 | 🔧 + 条件式 | ダイアモンド | グレー |

- アクセシビリティ: アイコン（非色覚依存）+ テキスト + 色の3重表現
- `always()` は常に実行されるため、Skip エッジを生成しません
- `!` 否定付き条件は破線アウトラインスタイルで肯定と視覚的に区別

### 複合条件（&& / || 混在対応）

`&&` や `||` で結合された複合条件を個別のノードに分解し、論理関係をグラフで表現します。
演算子の優先順位（`&&` > `||`）と括弧によるグルーピングにも対応しています。

- **AND（&&）**: 各条件を `-->|AND|` で直列チェーン接続。全条件を通過する必要があることを表現
  - 例: `always() && github.event_name == 'push'`
  - → `🔄 Always Run` -->|AND|--> `🔧 github.event_name == 'push'`
- **OR（||）**: 各条件を `-.->|OR|` でフォールスルー接続。いずれかの条件一致でステップが実行されることを表現
  - 例: `failure() || cancelled()`
  - → `❌ Failure Only` -.->|OR|--> `⛔ Cancelled`（どちらからも Yes エッジでステップへ）
- **AND/OR 混在**: AST（抽象構文木）ベースで再帰的にパース・レンダリング
  - 例: `(failure() || cancelled()) && github.ref == 'refs/heads/main'`
  - → OR グループ（failure / cancelled）の出口が AND で ref チェックに接続

### URL 共有機能

現在の YAML を圧縮して URL に埋め込み、他のユーザーと共有できます。

- Header の「Share」ボタンをクリックすると、共有 URL がクリップボードにコピーされます
- 共有 URL を開くと、圧縮された YAML が自動的に展開されエディタに反映されます
- バックエンド不要のクライアント完結型（lz-string 圧縮 + ハッシュフラグメント）
- URL 長に応じた警告表示（2000 文字超で注意、4000 文字超で推奨メッセージ）

## 開発

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build
```

## 技術スタック

- React + TypeScript
- Vite
- js-yaml
- Mermaid
- lz-string（URL 共有用圧縮）
