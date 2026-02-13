import { useEffect, useRef, useCallback, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidPreviewProps {
  code: string;
  error?: string;
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: 'basis',
  },
});

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;

export function MermaidPreview({ code, error }: MermaidPreviewProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const translateStartRef = useRef({ x: 0, y: 0 });

  // コードが変わったらビューをリセット
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [code]);

  const renderDiagram = useCallback(async () => {
    if (!svgContainerRef.current) return;

    if (!code || error) {
      svgContainerRef.current.innerHTML = '';
      return;
    }

    renderIdRef.current += 1;
    const currentId = renderIdRef.current;
    const id = `mermaid-diagram-${currentId}`;

    try {
      const { svg } = await mermaid.render(id, code);
      if (currentId === renderIdRef.current && svgContainerRef.current) {
        svgContainerRef.current.innerHTML = svg;
        // SVG を自然サイズで表示
        const svgEl = svgContainerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = 'none';
          svgEl.style.height = 'auto';
        }
      }
    } catch {
      if (currentId === renderIdRef.current && svgContainerRef.current) {
        svgContainerRef.current.innerHTML =
          '<p class="text-red-500 text-sm p-4">Failed to render Mermaid diagram. Please check the generated code.</p>';
      }
    }
  }, [code, error]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  // ホイールでズーム
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      // マウス位置を viewport 内の座標に変換
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setScale((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta * prev));
        const ratio = next / prev;

        // マウス位置を中心にズーム
        setTranslate((t) => ({
          x: mouseX - ratio * (mouseX - t.x),
          y: mouseY - ratio * (mouseY - t.y),
        }));

        return next;
      });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  // ドラッグでパン
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    setTranslate((t) => {
      translateStartRef.current = { x: t.x, y: t.y };
      return t;
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setTranslate({
      x: translateStartRef.current.x + dx,
      y: translateStartRef.current.y + dy,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP * s));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP * s));
  }, []);

  const scalePercent = Math.round(scale * 100);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">Preview</span>
        {code && !error && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
              title="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs text-gray-500 w-10 text-center tabular-nums">
              {scalePercent}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
              title="Zoom in"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={handleReset}
              className="ml-1 px-2 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 transition-colors"
              title="Reset"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* ビューポート */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden bg-white relative"
        style={{ cursor: code && !error ? 'grab' : 'default' }}
        onPointerDown={code && !error ? handlePointerDown : undefined}
        onPointerMove={code && !error ? handlePointerMove : undefined}
        onPointerUp={code && !error ? handlePointerUp : undefined}
        onPointerCancel={code && !error ? handlePointerUp : undefined}
      >
        {error ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm max-w-md">
              {error}
            </div>
          </div>
        ) : !code ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm p-4">
            Enter a GitHub Actions workflow YAML on the left to see the diagram here
          </div>
        ) : (
          <div
            ref={svgContainerRef}
            className="origin-top-left inline-block select-none"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              willChange: 'transform',
            }}
          />
        )}
      </div>
    </div>
  );
}
