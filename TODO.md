# TODO

## 完了済み

- [x] 条件バッジ表示（Graphical Condition Badges）
  - [x] `always()`, `success()`, `failure()`, `cancelled()` をカラーバッジ（スタジアム型ノード）で表示
  - [x] カスタム条件は 🔧 アイコン付きダイアモンドノードで表示
  - [x] アクセシビリティ配慮: アイコン + テキスト + 色の3重表現
  - [x] `always()` の Skip エッジ抑制（常に実行されるため分岐なし）
  - [x] classDef による色分けスタイル定義
- [x] 複合条件（&& / || 混在対応）
  - [x] AST ベースの再帰下降パーサーで条件式をパース
  - [x] 演算子優先順位（`&&` > `||`）を正しく処理
  - [x] 括弧 `()` によるグルーピングに対応
  - [x] AND チェーン: `-->|AND|` で直列接続、全条件通過が必要
  - [x] OR チェーン: `-.->|OR|` でフォールスルー接続、いずれか一致で実行
  - [x] AND/OR 混在を再帰的にマージ（mergeANDChains / mergeORChains）
  - [x] 各パート内の既知条件関数（always, failure 等）を正しく検知・バッジ化

## 未対応

- [ ] マトリクス戦略（`strategy.matrix`）の可視化
- [ ] 環境（`environment`）の表示
- [ ] 並行実行制御（`concurrency`）の表示
- [ ] ワークフロー全体名（`name`）の表示
- [ ] ダークモード対応の classDef カラー
