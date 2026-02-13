import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface SplitPaneProps {
  /** 分割方向: horizontal = 左右, vertical = 上下 */
  direction: 'horizontal' | 'vertical';
  /** 最初のパネル */
  first: ReactNode;
  /** 2番目のパネル */
  second: ReactNode;
  /** 初期比率（0-1, first パネルの割合）デフォルト 0.5 */
  defaultRatio?: number;
  /** パネルの最小サイズ（px）デフォルト 120 */
  minSize?: number;
}

/**
 * ドラッグでサイズを変更できる2パネル分割コンポーネント。
 * ダブルクリックで初期比率にリセット。
 */
export function SplitPane({
  direction,
  first,
  second,
  defaultRatio = 0.5,
  minSize = 120,
}: SplitPaneProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const isHorizontal = direction === 'horizontal';

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const totalSize = isHorizontal ? rect.width : rect.height;
      const offset = isHorizontal
        ? e.clientX - rect.left
        : e.clientY - rect.top;

      // minSize の制約を適用
      const minRatio = minSize / totalSize;
      const maxRatio = 1 - minSize / totalSize;
      const newRatio = Math.min(maxRatio, Math.max(minRatio, offset / totalSize));

      setRatio(newRatio);
    },
    [isHorizontal, minSize]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setRatio(defaultRatio);
  }, [defaultRatio]);

  // ドラッグ中にテキスト選択を無効化
  useEffect(() => {
    if (!isDragging.current) return;

    const prevent = (e: Event) => {
      if (isDragging.current) e.preventDefault();
    };

    document.addEventListener('selectstart', prevent);
    return () => document.removeEventListener('selectstart', prevent);
  }, []);

  const firstSize = `${ratio * 100}%`;
  const secondSize = `${(1 - ratio) * 100}%`;

  // ハンドルのスタイル
  const handleClass = isHorizontal
    ? 'w-1.5 cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 transition-colors flex-shrink-0 relative group'
    : 'h-1.5 cursor-row-resize hover:bg-indigo-400 active:bg-indigo-500 transition-colors flex-shrink-0 relative group';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full`}
      style={{ userSelect: isDragging.current ? 'none' : undefined }}
    >
      {/* First pane */}
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={isHorizontal ? { width: firstSize } : { height: firstSize }}
      >
        {first}
      </div>

      {/* Drag handle */}
      <div
        className={`${handleClass} bg-gray-200`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize, double-click to reset"
      >
        {/* ハンドルのドット装飾 */}
        <div
          className={`absolute ${
            isHorizontal
              ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1'
              : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-row gap-1'
          } opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}
        >
          <span className="block w-1 h-1 rounded-full bg-gray-500" />
          <span className="block w-1 h-1 rounded-full bg-gray-500" />
          <span className="block w-1 h-1 rounded-full bg-gray-500" />
        </div>
      </div>

      {/* Second pane */}
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={isHorizontal ? { width: secondSize } : { height: secondSize }}
      >
        {second}
      </div>
    </div>
  );
}
