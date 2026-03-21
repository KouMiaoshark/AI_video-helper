/**
 * 右键菜单组件
 * 画布右键：添加节点、清空画布、模板
 * 节点右键：删除、复制、运行
 */

import { useEffect, useRef } from 'react';
import { useWorkflowStore, nodeDefaults, type NodeDataType } from '../store/workflow';
import { Trash2, Copy, Play, LayoutTemplate, Eraser } from 'lucide-react';

const nodeTypeList: NodeDataType[] = [
  'text-input', 'image-input', 'image-output', 'banana-output',
  'video-output', 'script-output', 'audio-output', 'enhance',
];

export function ContextMenu() {
  const { contextMenu, setContextMenu, addNode, removeNode, duplicateNode, clearCanvas } = useWorkflowStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
    };
  }, [setContextMenu]);

  if (!contextMenu) return null;

  const isNode = !!contextMenu.nodeId;

  const handleAddNode = (type: NodeDataType) => {
    addNode(type, { x: contextMenu.x - 170, y: contextMenu.y - 30 });
    setContextMenu(null);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] py-1.5 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isNode ? (
        /* ── Node context menu ── */
        <>
          <button
            onClick={() => { if (contextMenu.nodeId) duplicateNode(contextMenu.nodeId); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            复制节点
          </button>
          <button
            onClick={() => { setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            运行节点
          </button>
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            onClick={() => { if (contextMenu.nodeId) removeNode(contextMenu.nodeId); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除节点
          </button>
        </>
      ) : (
        /* ── Canvas context menu ── */
        <>
          <div className="px-4 py-1.5 text-[10px] text-white/25 uppercase tracking-wider">添加节点</div>
          {nodeTypeList.map((type) => {
            const d = nodeDefaults[type];
            return (
              <button
                key={type}
                onClick={() => handleAddNode(type)}
                className="w-full flex items-center gap-2.5 px-4 py-1.5 text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                {d.label}
              </button>
            );
          })}
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            onClick={() => setContextMenu(null)}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            加载模板
          </button>
          <button
            onClick={() => { clearCanvas(); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-red-400/60 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            清空画布
          </button>
        </>
      )}
    </div>
  );
}
