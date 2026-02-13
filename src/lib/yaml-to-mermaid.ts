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

    // トリガー -> ルートジョブへのエッジ（条件バッジ対応）
    if (workflow.on) {
      const rootJobs = getRootJobs(workflow.jobs);
      for (const rootJob of rootJobs) {
        const job = workflow.jobs[rootJob];
        if (job?.if) {
          // トリガー -> バッジ -> ジョブ
          lines.push(`  triggers --> cond_job_${sanitizeId(rootJob)}`);
          if (isAlwaysCondition(job.if)) {
            // always() は分岐なし直結
            lines.push(`  cond_job_${sanitizeId(rootJob)} --> job_${sanitizeId(rootJob)}`);
          } else {
            lines.push(`  cond_job_${sanitizeId(rootJob)} -->|Yes| job_${sanitizeId(rootJob)}`);
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

/** 既知の条件関数かどうかを判定 */
function getConditionStyle(condText: string): ConditionStyle | null {
  return CONDITION_STYLES[normalizeCondition(condText)] ?? null;
}

/** always() 条件かどうかを判定 */
function isAlwaysCondition(condText: string): boolean {
  return normalizeCondition(condText) === 'always()';
}

/**
 * 条件ノードの Mermaid 定義文字列を生成する。
 * - 既知の条件: スタジアム型 (["icon label"]):::className
 * - カスタム条件: ダイアモンド {"icon condText"}:::condCustom
 */
function formatConditionNode(condId: string, condText: string, indent: string = '  '): string {
  const style = getConditionStyle(condText);
  if (style) {
    return `${indent}${condId}(["${style.icon} ${style.label}"]):::${style.className}`;
  }
  // カスタム条件: ダイアモンド + 🔧 アイコン
  return `${indent}${condId}{"${CUSTOM_CONDITION_STYLE.icon} ${escapeLabel(condText)}"}:::${CUSTOM_CONDITION_STYLE.className}`;
}

/** classDef 定義行を生成（Mermaid 末尾に追加） */
function generateConditionClassDefs(): string[] {
  const lines: string[] = [];
  for (const style of Object.values(CONDITION_STYLES)) {
    lines.push(`  classDef ${style.className} fill:${style.fill},stroke:${style.stroke},color:#fff`);
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

/** ジョブレベルの条件バッジノードを生成 */
function generateJobConditionNodes(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.if) {
      const condId = `cond_job_${sanitizeId(jobName)}`;
      lines.push(formatConditionNode(condId, job.if));
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
    // ステップのノードを生成
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = `${sanitizeId(jobName)}_s${i}`;
      const stepLabel = getStepLabel(step);

      // if 条件がある場合はバッジノードを追加
      if (step.if) {
        lines.push(formatConditionNode(`cond_${stepId}`, step.if, '    '));
      }
      lines.push(`    ${stepId}["${escapeLabel(stepLabel)}"]`);
    }

    // ステップ間のエッジ
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = `${sanitizeId(jobName)}_s${i}`;
      const condIsAlways = step.if ? isAlwaysCondition(step.if) : false;

      // バッジ -> ステップ（always() は分岐なし直結、それ以外は Yes パス）
      if (step.if) {
        if (condIsAlways) {
          lines.push(`    cond_${stepId} --> ${stepId}`);
        } else {
          lines.push(`    cond_${stepId} -->|Yes| ${stepId}`);
        }
      }

      // 前のステップからの接続
      if (i > 0) {
        const prevStepId = `${sanitizeId(jobName)}_s${i - 1}`;
        const entryId = step.if ? `cond_${stepId}` : stepId;
        lines.push(`    ${prevStepId} --> ${entryId}`);
      }

      // Skip パス（条件が false の場合、次のステップへ）
      // always() は常に実行されるため Skip エッジを生成しない
      if (step.if && !condIsAlways && i < steps.length - 1) {
        const nextStepId = `${sanitizeId(jobName)}_s${i + 1}`;
        const nextEntry = steps[i + 1].if ? `cond_${nextStepId}` : nextStepId;
        lines.push(`    cond_${stepId} -.->|Skip| ${nextEntry}`);
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

/** ジョブ間の依存関係エッジを生成（条件バッジ対応） */
function generateJobEdges(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  const condEdgeAdded = new Set<string>();

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job.needs) continue;

    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    for (const dep of needs) {
      if (job.if) {
        // 依存先 -> バッジ
        lines.push(`  job_${sanitizeId(dep)} --> cond_job_${sanitizeId(jobName)}`);
        // バッジ -> ジョブ（1回だけ追加）
        if (!condEdgeAdded.has(jobName)) {
          if (isAlwaysCondition(job.if)) {
            // always() は分岐なし直結
            lines.push(`  cond_job_${sanitizeId(jobName)} --> job_${sanitizeId(jobName)}`);
          } else {
            lines.push(`  cond_job_${sanitizeId(jobName)} -->|Yes| job_${sanitizeId(jobName)}`);
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
