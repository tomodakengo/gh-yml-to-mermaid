import yaml from 'js-yaml';
import type {
  WorkflowDefinition,
  WorkflowTrigger,
  JobDefinition,
  StepDefinition,
  ConversionResult,
} from './types';

/**
 * GitHub Actions YAML を Mermaid フローチャートコードに変換する
 */
export function convertYamlToMermaid(yamlString: string): ConversionResult {
  try {
    const workflow = yaml.load(yamlString) as WorkflowDefinition;

    if (!workflow || typeof workflow !== 'object') {
      return { mermaidCode: '', error: 'YAML のパースに失敗しました。有効な YAML を入力してください。' };
    }

    if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
      return { mermaidCode: '', error: 'jobs セクションが見つかりません。GitHub Actions のワークフロー YAML を入力してください。' };
    }

    const lines: string[] = ['flowchart TD'];

    // トリガーの生成
    if (workflow.on) {
      lines.push(...generateTriggers(workflow.on));
    }

    // ジョブレベルの条件バッジノードを生成
    lines.push(...generateJobConditionNodes(workflow.jobs));

    // ジョブの生成（トポロジカルソート順）
    const jobNames = topologicalSort(workflow.jobs);

    for (const jobName of jobNames) {
      const job = workflow.jobs[jobName];
      if (job) {
        lines.push(...generateJob(jobName, job));
      }
    }

    // トリガー -> ルートジョブへのエッジ（複合条件チェーン対応）
    if (workflow.on) {
      const rootJobs = getRootJobs(workflow.jobs);
      for (const rootJob of rootJobs) {
        const job = workflow.jobs[rootJob];
        if (job?.if) {
          const condId = `cond_job_${sanitizeId(rootJob)}`;
          const chain = generateConditionChain(condId, job.if);
          // トリガー -> チェーン入口
          lines.push(`  triggers --> ${chain.entryId}`);
          // チェーン出口 -> ジョブ
          for (const edge of chain.toTargetEdges) {
            if (edge.label) {
              lines.push(`  ${edge.fromId} -->|${edge.label}| job_${sanitizeId(rootJob)}`);
            } else {
              lines.push(`  ${edge.fromId} --> job_${sanitizeId(rootJob)}`);
            }
          }
        } else {
          lines.push(`  triggers --> job_${sanitizeId(rootJob)}`);
        }
      }
    }

    // ジョブ間の依存関係エッジ（条件バッジ対応）
    lines.push(...generateJobEdges(workflow.jobs));

    // 条件バッジ用の classDef 定義を追加
    lines.push(...generateConditionClassDefs());

    return { mermaidCode: lines.join('\n') };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { mermaidCode: '', error: `パースエラー: ${message}` };
  }
}

/** ID として安全な文字列に変換 */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Mermaid ラベル用にエスケープ */
function escapeLabel(text: string): string {
  return text
    .replace(/"/g, '#quot;')
    .replace(/\n/g, '<br/>')
    .substring(0, 80);
}

// ---------------------------------------------------------------------------
// 条件バッジ表示（Graphical Condition Badges）
// ---------------------------------------------------------------------------

/** 既知の条件関数のスタイル定義 */
interface ConditionStyle {
  icon: string;
  label: string;
  className: string;
  fill: string;
  stroke: string;
}

const CONDITION_STYLES: Record<string, ConditionStyle> = {
  'always()':    { icon: '🔄', label: 'Always Run',    className: 'condAlways',    fill: '#4A90D9', stroke: '#2E6EB5' },
  'success()':   { icon: '✅', label: 'Success Only',  className: 'condSuccess',   fill: '#28A745', stroke: '#1E7E34' },
  'failure()':   { icon: '❌', label: 'Failure Only',  className: 'condFailure',   fill: '#DC3545', stroke: '#BD2130' },
  'cancelled()': { icon: '⛔', label: 'Cancelled',     className: 'condCancelled', fill: '#FD7E14', stroke: '#E36209' },
};

/** カスタム条件のスタイル */
const CUSTOM_CONDITION_STYLE: Omit<ConditionStyle, 'label'> = {
  icon: '🔧', className: 'condCustom', fill: '#6C757D', stroke: '#545B62',
};

/** 条件文字列を正規化（前後の空白除去） */
function normalizeCondition(condText: string): string {
  return condText.trim();
}

/** 否定（!）プレフィックスを解析する */
function parseNegation(condText: string): { negated: boolean; inner: string } {
  const trimmed = condText.trim();
  if (trimmed.startsWith('!')) {
    return { negated: true, inner: trimmed.slice(1).trim() };
  }
  return { negated: false, inner: trimmed };
}

/** 既知の条件関数かどうかを判定（否定を除去してから照合） */
function getConditionStyle(condText: string): ConditionStyle | null {
  const { inner } = parseNegation(condText);
  return CONDITION_STYLES[normalizeCondition(inner)] ?? null;
}

/**
 * always() 条件かどうかを判定（単一パート用）。
 * !always() は常に true ではないため false を返す。
 */
function isAlwaysCondition(condText: string): boolean {
  const { negated, inner } = parseNegation(condText);
  if (negated) return false;
  return normalizeCondition(inner) === 'always()';
}

/**
 * 単一条件ノードの Mermaid 定義文字列を生成する。
 * - 既知の条件（肯定）: スタジアム型 (["icon label"]):::className
 * - 既知の条件（否定）: スタジアム型 (["icon NOT label"]):::classNameNeg  ※破線ボーダー
 * - カスタム条件: ダイアモンド {"icon condText"}:::condCustom
 */
function formatConditionNode(condId: string, condText: string, indent: string = '  '): string {
  const { negated, inner } = parseNegation(condText);
  const style = CONDITION_STYLES[normalizeCondition(inner)] ?? null;

  if (style) {
    if (negated) {
      // 否定の既知条件: 同じアイコン + "NOT" プレフィックス + 破線スタイル
      return `${indent}${condId}(["${style.icon} NOT ${style.label}"]):::${style.className}Neg`;
    }
    return `${indent}${condId}(["${style.icon} ${style.label}"]):::${style.className}`;
  }
  // カスタム条件: ダイアモンド + 🔧 アイコン
  return `${indent}${condId}{"${CUSTOM_CONDITION_STYLE.icon} ${escapeLabel(condText)}"}:::${CUSTOM_CONDITION_STYLE.className}`;
}

// ---------------------------------------------------------------------------
// 複合条件パーサー（&& / || 混在対応、演算子優先順位・括弧グルーピング考慮）
// ---------------------------------------------------------------------------

/** 条件式の AST ノード */
interface ConditionAST {
  type: 'atom' | 'and' | 'or';
  /** atom の場合の条件文字列 */
  value?: string;
  /** and/or の場合の子ノード */
  children?: ConditionAST[];
}

/**
 * 条件式をパースして AST を構築する。
 * 演算子優先順位: || (低) < && (高)
 * 括弧 () によるグルーピングに対応。
 */
function parseConditionExpr(expr: string): ConditionAST {
  expr = expr.trim();

  // 外側のグルーピング括弧を除去
  expr = stripOuterParens(expr);

  // トップレベルの || で分割（低優先度）
  const orParts = splitTopLevel(expr, '||');
  if (orParts.length > 1) {
    return {
      type: 'or',
      children: orParts.map(p => parseConditionExpr(p)),
    };
  }

  // トップレベルの && で分割（高優先度）
  const andParts = splitTopLevel(expr, '&&');
  if (andParts.length > 1) {
    return {
      type: 'and',
      children: andParts.map(p => parseConditionExpr(p)),
    };
  }

  // リーフ（単一条件）
  return { type: 'atom', value: expr.trim() };
}

/**
 * 式全体がグルーピング括弧で囲まれている場合に除去する。
 * 例: "(A || B)" → "A || B"
 * 関数呼び出しの括弧（例: "always()"）は除去しない。
 */
function stripOuterParens(expr: string): string {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const trimmed = expr.trim();
    if (!trimmed.startsWith('(')) break;

    // 最初の ( に対応する ) を探す
    const closeIdx = findMatchingParen(trimmed, 0);
    if (closeIdx !== trimmed.length - 1) break; // ) が末尾でない → 全体を囲む括弧ではない

    // 中身が空でないことを確認してから除去
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) break;

    expr = inner;
  }
  return expr.trim();
}

/** 指定位置の開き括弧に対応する閉じ括弧の位置を返す */
function findMatchingParen(expr: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * トップレベル（括弧の外側）で指定の演算子によって式を分割する。
 * 括弧内の演算子は無視する。
 */
function splitTopLevel(expr: string, operator: '&&' | '||'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const opLen = operator.length; // 2

  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;
    else if (depth === 0 && expr.substring(i, i + opLen) === operator) {
      parts.push(expr.substring(start, i));
      start = i + opLen;
      i += opLen - 1; // ++ のぶんを引いて演算子の2文字目をスキップ
    }
  }
  parts.push(expr.substring(start));

  return parts.map(p => p.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 条件チェーン生成（AST → Mermaid ノード + エッジ）
// ---------------------------------------------------------------------------

/** 複合条件チェーンの生成結果 */
interface ConditionChainResult {
  /** ノード定義行 */
  nodeLines: string[];
  /** 条件間の内部エッジ行（AND/OR 接続） */
  internalEdges: string[];
  /** 入口ノードID（前のステップ/トリガーからの接続先） */
  entryId: string;
  /** ターゲット（ステップ/ジョブ）へ接続するエッジ情報 */
  toTargetEdges: { fromId: string; label?: string }[];
  /** Skip先へ接続するソースID一覧 */
  skipSourceIds: string[];
  /** 条件全体が常に true か（= Skip 不要か） */
  isFullyAlways: boolean;
}

/**
 * 条件式をパースし、バッジノードチェーンを生成する。
 * AST ベースで && / || 混在・括弧グルーピングに対応。
 *
 * - 単一条件: 1ノード（baseCondId をそのまま使用）
 * - 複合条件: カウンターベースの ID で各パートにユニークな ID を割り当て
 */
function generateConditionChain(
  baseCondId: string,
  condText: string,
  indent: string = '  '
): ConditionChainResult {
  const ast = parseConditionExpr(condText.trim());

  // 単一条件（後方互換: baseCondId をそのまま使用）
  if (ast.type === 'atom') {
    const partIsAlways = isAlwaysCondition(ast.value!);
    return {
      nodeLines: [formatConditionNode(baseCondId, ast.value!, indent)],
      internalEdges: [],
      entryId: baseCondId,
      toTargetEdges: [{ fromId: baseCondId, label: partIsAlways ? undefined : 'Yes' }],
      skipSourceIds: partIsAlways ? [] : [baseCondId],
      isFullyAlways: partIsAlways,
    };
  }

  // 複合条件: カウンターベースの ID で再帰生成
  const counter = { value: 0 };
  return generateChainFromAST(baseCondId, ast, indent, counter);
}

/** AST からノードチェーンを再帰的に生成する */
function generateChainFromAST(
  baseCondId: string,
  ast: ConditionAST,
  indent: string,
  counter: { value: number }
): ConditionChainResult {
  // リーフ（単一条件パート）
  if (ast.type === 'atom') {
    const nodeId = `${baseCondId}_p${counter.value++}`;
    const partIsAlways = isAlwaysCondition(ast.value!);
    return {
      nodeLines: [formatConditionNode(nodeId, ast.value!, indent)],
      internalEdges: [],
      entryId: nodeId,
      toTargetEdges: [{ fromId: nodeId, label: partIsAlways ? undefined : 'Yes' }],
      skipSourceIds: partIsAlways ? [] : [nodeId],
      isFullyAlways: partIsAlways,
    };
  }

  // 各子ノードを再帰的に生成
  const childResults = ast.children!.map(child =>
    generateChainFromAST(baseCondId, child, indent, counter)
  );

  if (ast.type === 'and') {
    return mergeANDChains(childResults, indent);
  }
  return mergeORChains(childResults, indent);
}

/**
 * AND チェーンをマージする。
 * 前の子の toTargetEdges → 次の子の entryId を AND で直列接続。
 * 最後の子の toTargetEdges がターゲットへの出口になる。
 * always 以外の全パートから Skip エッジを生成。
 */
function mergeANDChains(children: ConditionChainResult[], indent: string): ConditionChainResult {
  const nodeLines = children.flatMap(c => c.nodeLines);
  const internalEdges = children.flatMap(c => c.internalEdges);

  // 前の子の出口 → 次の子の入口を AND で接続
  for (let i = 0; i < children.length - 1; i++) {
    for (const edge of children[i].toTargetEdges) {
      internalEdges.push(`${indent}${edge.fromId} -->|AND| ${children[i + 1].entryId}`);
    }
  }

  const lastChild = children[children.length - 1];
  const skipSourceIds = children.flatMap(c => c.skipSourceIds);

  return {
    nodeLines,
    internalEdges,
    entryId: children[0].entryId,
    toTargetEdges: lastChild.toTargetEdges,
    skipSourceIds,
    isFullyAlways: skipSourceIds.length === 0,
  };
}

/**
 * OR チェーンをマージする。
 * 前の子の skipSourceIds → 次の子の entryId を OR でフォールスルー接続。
 * 各子の toTargetEdges が全てターゲットへの出口になる（いずれか一致で実行）。
 * 最後の子の skipSourceIds のみ外部 Skip になる（全条件不一致時）。
 */
function mergeORChains(children: ConditionChainResult[], indent: string): ConditionChainResult {
  const nodeLines = children.flatMap(c => c.nodeLines);
  const internalEdges = children.flatMap(c => c.internalEdges);

  // 前の子の skip → 次の子の入口を OR で接続（フォールスルー）
  for (let i = 0; i < children.length - 1; i++) {
    for (const skipId of children[i].skipSourceIds) {
      internalEdges.push(`${indent}${skipId} -.->|OR| ${children[i + 1].entryId}`);
    }
  }

  const toTargetEdges = children.flatMap(c => c.toTargetEdges);
  const lastChild = children[children.length - 1];

  return {
    nodeLines,
    internalEdges,
    entryId: children[0].entryId,
    toTargetEdges,
    skipSourceIds: lastChild.skipSourceIds,
    isFullyAlways: children.every(c => c.isFullyAlways),
  };
}

/** classDef 定義行を生成（Mermaid 末尾に追加） */
function generateConditionClassDefs(): string[] {
  const lines: string[] = [];
  for (const style of Object.values(CONDITION_STYLES)) {
    // 肯定: 塗りつぶし背景
    lines.push(`  classDef ${style.className} fill:${style.fill},stroke:${style.stroke},color:#fff`);
    // 否定: 白背景 + 破線ボーダー（アウトラインスタイル）
    lines.push(`  classDef ${style.className}Neg fill:#fff,stroke:${style.stroke},color:${style.fill},stroke-dasharray:5 5,stroke-width:2px`);
  }
  lines.push(`  classDef ${CUSTOM_CONDITION_STYLE.className} fill:${CUSTOM_CONDITION_STYLE.fill},stroke:${CUSTOM_CONDITION_STYLE.stroke},color:#fff`);
  return lines;
}

/** トリガーセクションを生成 */
function generateTriggers(on: WorkflowTrigger): string[] {
  const lines: string[] = [];
  const triggers = parseTriggers(on);

  lines.push('  subgraph triggers ["Triggers"]');
  for (const trigger of triggers) {
    const id = `trigger_${sanitizeId(trigger.name)}`;
    const label = trigger.detail
      ? `${trigger.name}<br/>${escapeLabel(trigger.detail)}`
      : trigger.name;
    lines.push(`    ${id}["${label}"]`);
  }
  lines.push('  end');

  return lines;
}

interface TriggerInfo {
  name: string;
  detail?: string;
}

/** トリガーの各形式をパース */
function parseTriggers(on: WorkflowTrigger): TriggerInfo[] {
  if (typeof on === 'string') {
    return [{ name: on }];
  }

  if (Array.isArray(on)) {
    return on.map((name) => ({ name: String(name) }));
  }

  if (typeof on === 'object') {
    return Object.entries(on).map(([name, config]) => {
      if (!config || typeof config !== 'object') {
        return { name };
      }

      // schedule は特殊
      if (name === 'schedule' && Array.isArray(config)) {
        const crons = (config as Array<{ cron: string }>)
          .map((c) => c.cron)
          .filter(Boolean);
        return { name, detail: crons.join(', ') };
      }

      const details: string[] = [];
      const cfg = config as Record<string, unknown>;
      if (cfg.branches) {
        details.push(`branches: ${(cfg.branches as string[]).join(', ')}`);
      }
      if (cfg.tags) {
        details.push(`tags: ${(cfg.tags as string[]).join(', ')}`);
      }
      if (cfg.paths) {
        details.push(`paths: ${(cfg.paths as string[]).join(', ')}`);
      }
      if (cfg.types) {
        details.push(`types: ${(cfg.types as string[]).join(', ')}`);
      }

      return {
        name,
        detail: details.length > 0 ? details.join(', ') : undefined,
      };
    });
  }

  return [{ name: 'unknown' }];
}

/** ジョブレベルの条件バッジノードを生成（複合条件チェーン対応） */
function generateJobConditionNodes(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.if) {
      const condId = `cond_job_${sanitizeId(jobName)}`;
      const chain = generateConditionChain(condId, job.if);
      lines.push(...chain.nodeLines);
      lines.push(...chain.internalEdges);
    }
  }
  return lines;
}

/** ジョブの subgraph を生成（ステップ内の条件バッジ対応） */
function generateJob(jobName: string, job: JobDefinition): string[] {
  const lines: string[] = [];
  const jobId = `job_${sanitizeId(jobName)}`;

  // subgraph ラベルの組み立て（if はバッジノードに分離したので含めない）
  const displayName = job.name || jobName;
  const runsOn = job['runs-on']
    ? ` (${Array.isArray(job['runs-on']) ? job['runs-on'].join(', ') : job['runs-on']})`
    : '';

  // 再利用ワークフローの場合
  if (job.uses) {
    lines.push(`  subgraph ${jobId} ["${escapeLabel(displayName)}${runsOn}"]`);
    lines.push(`    ${jobId}_uses["uses: ${escapeLabel(job.uses)}"]`);
    lines.push('  end');
    return lines;
  }

  lines.push(`  subgraph ${jobId} ["${escapeLabel(displayName)}${runsOn}"]`);

  const steps = job.steps || [];
  if (steps.length === 0) {
    lines.push(`    ${jobId}_empty["(no steps)"]`);
  } else {
    // 各ステップの条件チェーンをプリコンピュート
    const stepChains: (ConditionChainResult | null)[] = steps.map((step, i) => {
      if (!step.if) return null;
      const stepId = `${sanitizeId(jobName)}_s${i}`;
      return generateConditionChain(`cond_${stepId}`, step.if, '    ');
    });

    // ステップのノードを生成
    for (let i = 0; i < steps.length; i++) {
      const stepId = `${sanitizeId(jobName)}_s${i}`;
      const stepLabel = getStepLabel(steps[i]);
      const chain = stepChains[i];

      // if 条件がある場合はチェーンノード群を追加
      if (chain) {
        lines.push(...chain.nodeLines);
        lines.push(...chain.internalEdges);
      }
      lines.push(`    ${stepId}["${escapeLabel(stepLabel)}"]`);
    }

    // ステップ間のエッジ
    for (let i = 0; i < steps.length; i++) {
      const stepId = `${sanitizeId(jobName)}_s${i}`;
      const chain = stepChains[i];

      // チェーン → ステップ（各 toTarget エッジ）
      if (chain) {
        for (const edge of chain.toTargetEdges) {
          if (edge.label) {
            lines.push(`    ${edge.fromId} -->|${edge.label}| ${stepId}`);
          } else {
            lines.push(`    ${edge.fromId} --> ${stepId}`);
          }
        }
      }

      // 前のステップからの接続
      if (i > 0) {
        const prevStepId = `${sanitizeId(jobName)}_s${i - 1}`;
        const entryId = chain ? chain.entryId : stepId;
        lines.push(`    ${prevStepId} --> ${entryId}`);
      }

      // Skip パス（条件が false の場合、次のステップへ）
      if (chain && !chain.isFullyAlways && i < steps.length - 1) {
        const nextStepId = `${sanitizeId(jobName)}_s${i + 1}`;
        const nextChain = stepChains[i + 1];
        const nextEntry = nextChain ? nextChain.entryId : nextStepId;
        for (const skipId of chain.skipSourceIds) {
          lines.push(`    ${skipId} -.->|Skip| ${nextEntry}`);
        }
      }
    }
  }

  lines.push('  end');
  return lines;
}

/** ステップの表示ラベルを取得 */
function getStepLabel(step: StepDefinition): string {
  if (step.name) {
    return step.name;
  }
  if (step.uses) {
    return step.uses;
  }
  if (step.run) {
    // 最初の行だけ使用
    const firstLine = step.run.split('\n')[0].trim();
    return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
  }
  return '(unnamed step)';
}

/** needs を持たないルートジョブを取得 */
function getRootJobs(jobs: Record<string, JobDefinition>): string[] {
  return Object.entries(jobs)
    .filter(([, job]) => !job.needs || (Array.isArray(job.needs) && job.needs.length === 0))
    .map(([name]) => name);
}

/** ジョブ間の依存関係エッジを生成（複合条件チェーン対応） */
function generateJobEdges(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  const condEdgeAdded = new Set<string>();

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job.needs) continue;

    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    for (const dep of needs) {
      if (job.if) {
        const condId = `cond_job_${sanitizeId(jobName)}`;
        const chain = generateConditionChain(condId, job.if);
        // 依存先 -> チェーン入口
        lines.push(`  job_${sanitizeId(dep)} --> ${chain.entryId}`);
        // チェーン出口 -> ジョブ（1回だけ追加）
        if (!condEdgeAdded.has(jobName)) {
          for (const edge of chain.toTargetEdges) {
            if (edge.label) {
              lines.push(`  ${edge.fromId} -->|${edge.label}| job_${sanitizeId(jobName)}`);
            } else {
              lines.push(`  ${edge.fromId} --> job_${sanitizeId(jobName)}`);
            }
          }
          condEdgeAdded.add(jobName);
        }
      } else {
        lines.push(`  job_${sanitizeId(dep)} --> job_${sanitizeId(jobName)}`);
      }
    }
  }

  return lines;
}

/** ジョブをトポロジカルソート（needs に基づく依存順） */
function topologicalSort(jobs: Record<string, JobDefinition>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const jobNames = Object.keys(jobs);

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);

    const job = jobs[name];
    if (job?.needs) {
      const deps = Array.isArray(job.needs) ? job.needs : [job.needs];
      for (const dep of deps) {
        if (jobs[dep]) {
          visit(dep);
        }
      }
    }

    result.push(name);
  }

  for (const name of jobNames) {
    visit(name);
  }

  return result;
}
