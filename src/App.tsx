import { useState, useMemo, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { YamlEditor } from './components/YamlEditor';
import { MermaidPreview } from './components/MermaidPreview';
import { MermaidCode } from './components/MermaidCode';
import { SplitPane } from './components/SplitPane';
import { convertYamlToMermaid } from './lib/yaml-to-mermaid';
import { sampleWorkflows } from './lib/sample-workflows';
import { extractYamlFromUrl, generateShareUrl, clearUrlHash } from './lib/url-share';
import type { ShareResult } from './lib/url-share';

/** トースト通知の状態 */
export interface ToastState {
  message: string;
  level: 'success' | 'warning' | 'danger' | 'error';
  visible: boolean;
}

function App() {
  const [yamlInput, setYamlInput] = useState(() => {
    // URL ハッシュから YAML を展開（共有 URL で開いた場合）
    const fromUrl = extractYamlFromUrl();
    if (fromUrl) {
      clearUrlHash();
      return fromUrl;
    }
    return sampleWorkflows[0].yaml;
  });

  const [toast, setToast] = useState<ToastState>({ message: '', level: 'success', visible: false });

  // URL ハッシュからの展開失敗を検知（ハッシュがあるのに展開できなかった場合）
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#yaml=')) {
      // ハッシュがあるのに yamlInput が初期サンプルのまま → 展開失敗
      setToast({
        message: '共有 URL の展開に失敗しました。URL が途中で切れている可能性があります。',
        level: 'error',
        visible: true,
      });
      clearUrlHash();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // トースト自動非表示
  useEffect(() => {
    if (!toast.visible) return;
    const timer = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 5000);
    return () => clearTimeout(timer);
  }, [toast.visible]);

  const { mermaidCode, error } = useMemo(
    () => convertYamlToMermaid(yamlInput),
    [yamlInput]
  );

  /** 共有 URL を生成してクリップボードにコピー */
  const handleShare = useCallback(async () => {
    const result: ShareResult = generateShareUrl(yamlInput);

    try {
      await navigator.clipboard.writeText(result.url);
      const levelMap = { safe: 'success', warning: 'warning', danger: 'danger' } as const;
      setToast({
        message: result.message,
        level: levelMap[result.level],
        visible: true,
      });
    } catch {
      setToast({
        message: 'クリップボードへのコピーに失敗しました。URL を手動でコピーしてください。',
        level: 'error',
        visible: true,
      });
    }
  }, [yamlInput]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header onShare={handleShare} />

      {/* トースト通知 */}
      {toast.visible && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all max-w-lg text-center ${
            toast.level === 'success'
              ? 'bg-green-600 text-white'
              : toast.level === 'warning'
                ? 'bg-yellow-500 text-white'
                : toast.level === 'danger'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-700 text-white'
          }`}
          role="alert"
        >
          {toast.message}
          <button
            onClick={() => setToast(prev => ({ ...prev, visible: false }))}
            className="ml-3 opacity-70 hover:opacity-100"
            aria-label="閉じる"
          >
            &times;
          </button>
        </div>
      )}

      <main className="flex-1 min-h-0">
        <SplitPane
          direction="horizontal"
          defaultRatio={0.5}
          minSize={200}
          first={
            <YamlEditor value={yamlInput} onChange={setYamlInput} />
          }
          second={
            <SplitPane
              direction="vertical"
              defaultRatio={0.65}
              minSize={80}
              first={
                <MermaidPreview code={mermaidCode} error={error} />
              }
              second={
                <MermaidCode code={mermaidCode} />
              }
            />
          }
        />
      </main>
    </div>
  );
}

export default App;
