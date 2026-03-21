/**
 * Tapnow Studio 页面
 * 通过 iframe 加载单文件 React 应用
 */

interface TapnowStudioPageProps {
  active: boolean;
}

export function TapnowStudioPage({ active }: TapnowStudioPageProps) {
  return (
    <div className="flex-1 w-full h-full" style={{ display: active ? 'block' : 'none' }}>
      <iframe
        src="/tapnow-studio.html"
        className="w-full h-full border-0"
        title="Tapnow Studio"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
