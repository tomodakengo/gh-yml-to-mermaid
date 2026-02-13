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

    // ジョブレベルの条件分岐ダイアモンドノードを生成
    lines.push(...generateJobConditionNodes(workflow.jobs));

    // ジョブの生成（トポロジカルソート順）
    const jobNames = topologicalSort(workflow.jobs);

    for (const jobName of jobNames) {
      const job = workflow.jobs[jobName];
      if (job) {
        lines.push(...generateJob(jobName, job));
      }
    }

    // トリガー -> ルートジョブへのエッジ（条件分岐対応）
    if (workflow.on) {
      const rootJobs = getRootJobs(workflow.jobs);
      for (const rootJob of rootJobs) {
        const job = workflow.jobs[rootJob];
        if (job?.if) {
          // トリガー -> ダイアモンド -> ジョブ
          lines.push(`  triggers --> cond_job_${sanitizeId(rootJob)}`);
          lines.push(`  cond_job_${sanitizeId(rootJob)} -->|Yes| job_${sanitizeId(rootJob)}`);
        } else {
          lines.push(`  triggers --> job_${sanitizeId(rootJob)}`);
        }
      }
    }

    // ジョブ間の依存関係エッジ（条件分岐対応）
    lines.push(...generateJobEdges(workflow.jobs));

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
    .replace(/\n/g, ' ')
    .substring(0, 80);
}

/** トリガーセクションを生成 */
function generateTriggers(on: WorkflowTrigger): string[] {
  const lines: string[] = [];
  const triggers = parseTriggers(on);

  lines.push('  subgraph triggers ["Triggers"]');
  for (const trigger of triggers) {
    const id = `trigger_${sanitizeId(trigger.name)}`;
    const label = trigger.detail
      ? `${trigger.name}\\n${escapeLabel(trigger.detail)}`
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

/** ジョブレベルの条件分岐ダイアモンドノードを生成 */
function generateJobConditionNodes(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.if) {
      const condId = `cond_job_${sanitizeId(jobName)}`;
      lines.push(`  ${condId}{"${escapeLabel(job.if)}"}`);
    }
  }
  return lines;
}

/** ジョブの subgraph を生成（ステップ内の条件分岐もダイアモンド化） */
function generateJob(jobName: string, job: JobDefinition): string[] {
  const lines: string[] = [];
  const jobId = `job_${sanitizeId(jobName)}`;

  // subgraph ラベルの組み立て（if はダイアモンドに分離したので含めない）
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

      // if 条件がある場合はダイアモンドノードを追加
      if (step.if) {
        lines.push(`    cond_${stepId}{"${escapeLabel(step.if)}"}`);
      }
      lines.push(`    ${stepId}["${escapeLabel(stepLabel)}"]`);
    }

    // ステップ間のエッジ
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = `${sanitizeId(jobName)}_s${i}`;

      // ダイアモンド -> ステップ（Yes パス）
      if (step.if) {
        lines.push(`    cond_${stepId} -->|Yes| ${stepId}`);
      }

      // 前のステップからの接続
      if (i > 0) {
        const prevStepId = `${sanitizeId(jobName)}_s${i - 1}`;
        const entryId = step.if ? `cond_${stepId}` : stepId;
        lines.push(`    ${prevStepId} --> ${entryId}`);
      }

      // Skip パス（条件が false の場合、次のステップへ）
      if (step.if && i < steps.length - 1) {
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

/** ジョブ間の依存関係エッジを生成（条件分岐対応） */
function generateJobEdges(jobs: Record<string, JobDefinition>): string[] {
  const lines: string[] = [];
  const yesEdgeAdded = new Set<string>();

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job.needs) continue;

    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    for (const dep of needs) {
      if (job.if) {
        // 依存先 -> ダイアモンド
        lines.push(`  job_${sanitizeId(dep)} --> cond_job_${sanitizeId(jobName)}`);
        // ダイアモンド -> ジョブ（Yes パス、1回だけ追加）
        if (!yesEdgeAdded.has(jobName)) {
          lines.push(`  cond_job_${sanitizeId(jobName)} -->|Yes| job_${sanitizeId(jobName)}`);
          yesEdgeAdded.add(jobName);
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
