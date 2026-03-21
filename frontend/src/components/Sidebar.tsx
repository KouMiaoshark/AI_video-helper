/**
 * 左侧页面切换侧边栏
 * 支持：Tooltip、通知标记、可折叠
 */

import { useState } from 'react';
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_REGISTRY } from '../pages';
import type { PageId } from '../pages';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  onOpenSettings: () => void;
  /** 外部通知标记（可选） */
  badges?: Partial<Record<PageId, boolean>>;
}

export function Sidebar({ activePage, onNavigate, onOpenSettings, badges = {} }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const width = collapsed ? 'w-14' : 'w-16';

  return (
    <div className={`${width} bg-[#0c0c16] border-r border-white/[0.06] flex flex-col items-center py-4 transition-all duration-200 relative`}>
      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.08]/50 flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/[0.08] transition-all z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* 页面列表 */}
      <div className="flex flex-col gap-1 flex-1">
        {PAGE_REGISTRY.map((page) => {
          const Icon = page.icon;
          const active = activePage === page.id;
          const hasBadge = badges[page.id];
          return (
            <div key={page.id} className="relative"
              onMouseEnter={() => setHoveredId(page.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <button
                onClick={() => onNavigate(page.id)}
                className={`
                  w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5
                  transition-all duration-200 group relative
                  ${active
                    ? 'bg-purple-600/20 text-purple-400'
                    : 'text-white/35 hover:text-white/70 hover:bg-white/[0.06]/50'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                {!collapsed && <span className="text-[9px] font-medium">{page.label}</span>}
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-purple-400 rounded-r" />
                )}
                {/* 通知标记 */}
                {hasBadge && (
                  <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>

              {/* Tooltip */}
              {hoveredId === page.id && (
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
                  <div className="px-3 py-1.5 bg-white/[0.06]/95 backdrop-blur-sm border border-white/[0.08]/50 rounded-lg shadow-xl whitespace-nowrap">
                    <p className="text-[12px] text-white/80 font-medium">{page.label}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部设置按钮 */}
      <div className="relative"
        onMouseEnter={() => setHoveredId('settings')}
        onMouseLeave={() => setHoveredId(null)}>
        <button
          onClick={onOpenSettings}
          className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5
            text-white/25 hover:text-white/70 hover:bg-white/[0.06]/50 transition-all duration-200
            border-t border-white/[0.06]/50 pt-3 mt-2"
        >
          <Settings className="w-5 h-5" />
          {!collapsed && <span className="text-[9px] font-medium">设置</span>}
        </button>
        {hoveredId === 'settings' && (
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="px-3 py-1.5 bg-white/[0.06]/95 backdrop-blur-sm border border-white/[0.08]/50 rounded-lg shadow-xl whitespace-nowrap">
              <p className="text-[12px] text-white/80 font-medium">API 配置</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
