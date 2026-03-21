/**
 * 左侧节点面板 - 拖拽添加节点，可折叠/展开
 */

import { useState } from 'react';
import { nodeDefaults, type NodeDataType } from '../store/workflow';
import { GripVertical, PanelLeftClose, PanelLeft } from 'lucide-react';

const nodeTypes: { type: NodeDataType; category: string }[] = [
  { type: 'text-input', category: '输入' },
  { type: 'image-input', category: '输入' },
  { type: 'image-output', category: '生成' },
  { type: 'banana-output', category: '生成' },
  { type: 'video-output', category: '生成' },
  { type: 'script-output', category: '生成' },
  { type: 'audio-output', category: '生成' },
  { type: 'enhance', category: '处理' },
];

export function NodePanel() {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: NodeDataType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const categories = ['输入', '生成', '处理'];

  if (collapsed) {
    return (
      <div className="w-10 bg-[#13131f]/80 border-r border-white/[0.06] flex flex-col items-center pt-3 gap-1">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all"
          title="展开节点面板"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
        <div className="mt-2 flex flex-col gap-1.5">
          {nodeTypes.map(({ type }) => {
            const defaults = nodeDefaults[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white/[0.06] transition-all group"
                title={defaults.label}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: defaults.color }} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[#13131f]/80 border-r border-white/[0.06] flex flex-col">
      <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">节点</h2>
          <p className="text-[10px] text-white/20 mt-0.5">拖拽到画布</p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/25 hover:text-white/50 transition-all"
          title="收起"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1.5 px-1">
              {cat}
            </h3>
            <div className="space-y-1">
              {nodeTypes
                .filter((n) => n.category === cat)
                .map(({ type }) => {
                  const defaults = nodeDefaults[type];
                  return (
                    <div
                      key={type}
                      draggable
                      onDragStart={(e) => onDragStart(e, type)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg
                        bg-white/[0.02] border border-white/[0.04]
                        hover:border-white/[0.08] hover:bg-white/[0.04]
                        cursor-grab active:cursor-grabbing
                        transition-all duration-150 group"
                    >
                      <GripVertical className="w-3 h-3 text-white/15 group-hover:text-white/30 shrink-0" />
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: defaults.color }}
                      />
                      <span className="text-[12px] text-white/50 group-hover:text-white/70 truncate transition-colors">
                        {defaults.label}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
