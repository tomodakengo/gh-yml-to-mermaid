# gh-yml-to-mermaid

GitHub Actions のワークフロー YAML を Mermaid フローチャートに変換するツールです。

## 機能

- GitHub Actions YAML を Mermaid フローチャートに自動変換
- トリガー、ジョブ、ステップの可視化
- ジョブ間の依存関係（`needs`）の表示
- 条件分岐（`if`）のグラフィカル表示
- 再利用ワークフロー（`uses`）対応

### 条件バッジ表示

`if` 条件をグラフィカルなバッジで表示し、初心者にも分かりやすい見た目にしています。

| 条件 | 表示 | ノード形状 | 色 |
|---|---|---|---|
| `always()` | 🔄 Always Run | スタジアム型（丸角） | 青 |
| `success()` | ✅ Success Only | スタジアム型（丸角） | 緑 |
| `failure()` | ❌ Failure Only | スタジアム型（丸角） | 赤 |
| `cancelled()` | ⛔ Cancelled | スタジアム型（丸角） | オレンジ |
| カスタム条件 | 🔧 + 条件式 | ダイアモンド | グレー |

- アクセシビリティ: アイコン（非色覚依存）+ テキスト + 色の3重表現
- `always()` は常に実行されるため、Skip エッジを生成しません

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
