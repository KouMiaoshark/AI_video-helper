/**
 * 顶部工具栏（TapNow 画布）
 * 支持：撤销/重做、导出/导入工作流、清空画布
 */

import { useRef } from 'react';
import { useWorkflowStore } from '../store/workflow';
import { Trash2, Download, Upload, Zap, Undo2, Redo2 } from 'lucide-react';

export function Toolbar() {
  const { clearCanvas, nodes, edges, undo, redo, undoStack, redoStack } = useWorkflowStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes && data.edges) {
          // 直接替换当前画布
          useWorkflowStore.setState({
            nodes: data.nodes,
            edges: data.edges,
            selectedNodeId: null,
          });
          useWorkflowStore.getState().saveToStorage();
        }
      } catch {
        alert('Invalid workflow file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="h-11 bg-[#13131f]/90 border-b border-white/[0.06] flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-500" />
          <span className="font-bold text-[13px] bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            TapNow
          </span>
        </div>
        <span className="text-[10px] text-white/20 ml-1">v0.5.0</span>
      </div>

      <div className="flex items-center gap-1">
        {/* Undo/Redo */}
        <button onClick={undo} disabled={undoStack.length === 0}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          title="撤销 (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={redo} disabled={redoStack.length === 0}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          title="重做 (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-white/[0.06] mx-1" />

        <span className="text-[10px] text-white/20 mr-2">
          {nodes.length} 节点 · {edges.length} 连线
        </span>

        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] rounded-lg transition-all">
          <Download className="w-3.5 h-3.5" />
          导出
        </button>
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] rounded-lg transition-all">
          <Upload className="w-3.5 h-3.5" />
          导入
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

        <button onClick={clearCanvas}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-red-400/50 hover:text-red-400 hover:bg-red-500/[0.04] rounded-lg transition-all">
          <Trash2 className="w-3.5 h-3.5" />
          清空
        </button>
      </div>
    </div>
  );
}
