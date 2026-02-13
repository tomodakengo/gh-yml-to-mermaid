/** GitHub Actions ワークフローの型定義 */

/** ワークフロー全体の定義 */
export interface WorkflowDefinition {
  name?: string;
  on?: WorkflowTrigger;
  jobs?: Record<string, JobDefinition>;
}

/** トリガー定義（複数の形式に対応） */
export type WorkflowTrigger =
  | string                                    // "push"
  | string[]                                  // ["push", "pull_request"]
  | Record<string, TriggerConfig | null>;     // { push: { branches: [...] }, ... }

/** 個別のトリガー設定 */
export interface TriggerConfig {
  branches?: string[];
  tags?: string[];
  paths?: string[];
  types?: string[];
  inputs?: Record<string, InputDefinition>;
  cron?: string;
  // schedule の場合
  [key: string]: unknown;
}

/** workflow_dispatch 等の入力定義 */
export interface InputDefinition {
  description?: string;
  required?: boolean;
  default?: string;
  type?: string;
  options?: string[];
}

/** ジョブ定義 */
export interface JobDefinition {
  name?: string;
  'runs-on'?: string | string[];
  needs?: string | string[];
  if?: string;
  steps?: StepDefinition[];
  strategy?: StrategyDefinition;
  environment?: string | EnvironmentDefinition;
  concurrency?: string | ConcurrencyDefinition;
  permissions?: Record<string, string> | string;
  outputs?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
  [key: string]: unknown;
}

/** ステップ定義 */
export interface StepDefinition {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  id?: string;
  [key: string]: unknown;
}

/** マトリクス戦略 */
export interface StrategyDefinition {
  matrix?: Record<string, unknown>;
  'fail-fast'?: boolean;
  'max-parallel'?: number;
}

/** 環境定義 */
export interface EnvironmentDefinition {
  name: string;
  url?: string;
}

/** 並行実行制御 */
export interface ConcurrencyDefinition {
  group: string;
  'cancel-in-progress'?: boolean;
}

/** 変換結果 */
export interface ConversionResult {
  mermaidCode: string;
  error?: string;
}
