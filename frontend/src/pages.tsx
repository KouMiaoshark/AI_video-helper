/**
 * 页面注册表 - 所有页面集中定义
 * 添加新页面只需往 PAGE_REGISTRY 加一项
 */

import { Workflow, FolderOpen, LayoutGrid, Globe2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AssetsPage } from './components/AssetsPage';
import { TapnowStudioPage } from './components/TapnowStudioPage';
import { HailuoOverseasPage } from './components/HailuoOverseasPage';
import Canvas from './components/Canvas';

export type PageId = 'tapnow' | 'hailuo-global' | 'assets' | 'studio';

export interface PageDef {
  id: PageId;
  label: string;
  icon: LucideIcon;
  component: React.ComponentType<{ active: boolean }>;
}

/**
 * 页面注册表
 * 
 * 添加新页面示例：
 *   1. 创建新组件文件 src/components/XxxPage.tsx
 *   2. 在 PageId 类型中加上新 id
 *   3. 往 PAGE_REGISTRY 数组加一项
 * 
 * Sidebar 和 App 会自动识别，无需手动改路由逻辑
 */
export const PAGE_REGISTRY: PageDef[] = [
  {
    id: 'hailuo-global',
    label: '网页生图',
    icon: Globe2,
    component: HailuoOverseasPage,
  },
  {
    id: 'tapnow',
    label: 'TapNow',
    icon: Workflow,
    component: Canvas,
  },
  {
    id: 'studio',
    label: 'Studio',
    icon: LayoutGrid,
    component: TapnowStudioPage,
  },
  {
    id: 'assets',
    label: '资产',
    icon: FolderOpen,
    component: AssetsPage,
  },
];

// 默认首页
export const DEFAULT_PAGE: PageId = 'hailuo-global';
