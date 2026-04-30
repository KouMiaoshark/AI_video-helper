import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { PAGE_REGISTRY, DEFAULT_PAGE } from './pages';
import type { PageId } from './pages';

function App() {
  const [activePage, setActivePage] = useState<PageId>(DEFAULT_PAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mountedPages, setMountedPages] = useState<PageId[]>([DEFAULT_PAGE]);

  useEffect(() => {
    setMountedPages((current) => (current.includes(activePage) ? current : [...current, activePage]));
  }, [activePage]);

  return (
    <div className="h-screen w-screen flex">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="relative flex-1 min-w-0 min-h-0">
        {/* 所有页面都渲染。
            非活跃页面使用 visibility 隐藏而不是 display:none，
            让像 Studio iframe 这类重资源页面也能继续后台初始化。 */}
        {PAGE_REGISTRY.map((page) => {
          if (!mountedPages.includes(page.id)) return null;
          const PageComponent = page.component;
          const isActive = activePage === page.id;
          return (
            <div
              key={page.id}
              className="absolute inset-0 flex"
              style={{
                visibility: isActive ? 'visible' : 'hidden',
                pointerEvents: isActive ? 'auto' : 'none',
                zIndex: isActive ? 1 : 0,
              }}
            >
              <PageComponent active={isActive} />
            </div>
          );
        })}
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
