import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { PAGE_REGISTRY, DEFAULT_PAGE } from './pages';
import type { PageId } from './pages';

function App() {
  const [activePage, setActivePage] = useState<PageId>(DEFAULT_PAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {/* 所有页面都渲染，用 display:none 隐藏非活跃页面，保留组件状态 */}
      {PAGE_REGISTRY.map((page) => {
        const PageComponent = page.component;
        return (
          <div
            key={page.id}
            className="flex-1 flex"
            style={{ display: activePage === page.id ? 'flex' : 'none' }}
          >
            <PageComponent active={activePage === page.id} />
          </div>
        );
      })}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
