/**
 * Tapnow Studio 页面
 * 通过 iframe 加载单文件 React 应用
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface TapnowStudioPageProps {
  active: boolean;
}

export function TapnowStudioPage({ active }: TapnowStudioPageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);

  const studioSrc = useMemo(() => '/tapnow-studio.html', []);

  useEffect(() => {
    setFrameLoaded(false);
    setContentReady(false);
    setShowSlowHint(false);
  }, [studioSrc]);

  useEffect(() => {
    if (!frameLoaded) {
      return;
    }

    const checkReady = () => {
      const iframe = iframeRef.current;
      try {
        const doc = iframe?.contentDocument;
        const loader = doc?.querySelector('.art-loader-container');
        const hasCanvas = !!doc?.querySelector('#canvas-bg');
        if (!loader || hasCanvas) {
          setContentReady(true);
          setShowSlowHint(false);
          return true;
        }
      } catch {}
      return false;
    };

    if (checkReady()) {
      return;
    }

    const interval = window.setInterval(() => {
      checkReady();
    }, 1000);

    const slowTimer = window.setTimeout(() => {
      if (!checkReady()) {
        setShowSlowHint(true);
      }
    }, 6000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(slowTimer);
    };
  }, [frameLoaded]);

  const showOverlay = active && (!frameLoaded || !contentReady);

  return (
    <div className="relative flex-1 w-full h-full">
      {showOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950 text-zinc-300">
          <div className="max-w-md space-y-3">
            <div className="text-base font-medium">Studio 正在预热...</div>
            <div className="text-sm text-zinc-400">
              首次加载会比较慢，页面会在后台继续初始化。完成后切换页面就不会重复加载。
            </div>
            {showSlowHint && (
              <div className="text-xs text-zinc-500">
                已连接到 {studioSrc}，正在等待 Studio 内部脚本完成初始化。
              </div>
            )}
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={studioSrc}
        className="w-full h-full border-0"
        title="Tapnow Studio"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => {
          setFrameLoaded(true);
        }}
      />
    </div>
  );
}
