import lzString from 'lz-string';

// ---------------------------------------------------------------------------
// URL 共有機能（lz-string 圧縮 + ハッシュフラグメント）
// ---------------------------------------------------------------------------

const HASH_KEY = 'yaml';

/** URL 長に応じた警告レベル */
export type UrlLengthLevel = 'safe' | 'warning' | 'danger';

/** 共有 URL 生成結果 */
export interface ShareResult {
  /** 生成された共有 URL */
  url: string;
  /** URL の総文字数 */
  length: number;
  /** URL 長に応じた警告レベル */
  level: UrlLengthLevel;
  /** ユーザー向けメッセージ */
  message: string;
}

/** URL 長の閾値 */
const URL_LENGTH_WARNING = 2000;
const URL_LENGTH_DANGER = 4000;

/**
 * URL の長さに応じた警告レベルとメッセージを判定する
 */
function evaluateUrlLength(length: number): { level: UrlLengthLevel; message: string } {
  if (length <= URL_LENGTH_WARNING) {
    return {
      level: 'safe',
      message: '共有 URL をコピーしました',
    };
  }
  if (length <= URL_LENGTH_DANGER) {
    return {
      level: 'warning',
      message: `コピーしました（URL が ${length} 文字と長いため、一部のアプリで切れる可能性があります）`,
    };
  }
  return {
    level: 'danger',
    message: `コピーしました（URL が ${length} 文字と非常に長いです。YAML を直接共有することを推奨します）`,
  };
}

/**
 * YAML テキストを lz-string で圧縮し、共有 URL を生成する。
 * URL 形式: `<origin><pathname>#yaml=<compressed>`
 */
export function generateShareUrl(yamlText: string): ShareResult {
  const compressed = lzString.compressToEncodedURIComponent(yamlText);
  const hash = `#${HASH_KEY}=${compressed}`;
  const url = `${window.location.origin}${window.location.pathname}${hash}`;
  const length = url.length;
  const { level, message } = evaluateUrlLength(length);

  return { url, length, level, message };
}

/**
 * 現在の URL ハッシュフラグメントから YAML テキストを展開する。
 * ハッシュに `#yaml=...` が含まれていなければ null を返す。
 * 展開に失敗した場合（URL トランケート等）も null を返す。
 */
export function extractYamlFromUrl(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;

  const prefix = `#${HASH_KEY}=`;
  if (!hash.startsWith(prefix)) return null;

  const compressed = hash.slice(prefix.length);
  if (!compressed) return null;

  try {
    const decompressed = lzString.decompressFromEncodedURIComponent(compressed);
    // lz-string は不正な入力で null や空文字を返すことがある
    if (!decompressed) return null;
    return decompressed;
  } catch {
    return null;
  }
}

/**
 * URL ハッシュフラグメントをクリアする。
 * ブラウザの履歴にエントリを追加せずにハッシュを除去する。
 */
export function clearUrlHash(): void {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
