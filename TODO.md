# TODO

## 完了済み

- [x] 条件バッジ表示（Graphical Condition Badges）
  - [x] `always()`, `success()`, `failure()`, `cancelled()` をカラーバッジ（スタジアム型ノード）で表示
  - [x] カスタム条件は 🔧 アイコン付きダイアモンドノードで表示
  - [x] アクセシビリティ配慮: アイコン + テキスト + 色の3重表現
  - [x] `always()` の Skip エッジ抑制（常に実行されるため分岐なし）
  - [x] classDef による色分けスタイル定義

## 未対応

- [ ] マトリクス戦略（`strategy.matrix`）の可視化
- [ ] 環境（`environment`）の表示
- [ ] 並行実行制御（`concurrency`）の表示
- [ ] ワークフロー全体名（`name`）の表示
- [ ] ダークモード対応の classDef カラー
