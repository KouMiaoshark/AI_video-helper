/**
 * 主画布组件 - React Flow 节点编辑器
 * 集成：右键菜单、键盘快捷键(Ctrl+Z/Y/Del/S/Tab)、数据流传递、命令面板
 */

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search } from 'lucide-react';

import { useWorkflowStore, nodeDefaults, type NodeDataType, WORKFLOW_TEMPLATES } from '../store/workflow';
import { CustomNode } from './CustomNode';
import { NodePanel } from './NodePanel';
import { ContextMenu } from './ContextMenu';
import { Toolbar } from './Toolbar';

const nodeTypes = { custom: CustomNode };

// 所有可添加的节点类型
const ALL_NODE_TYPES: NodeDataType[] = [
  'text-input', 'image-input', 'image-output', 'banana-output',
  'video-output', 'script-output', 'audio-output', 'enhance',
];

// 剪贴板（页面级，不持久化）
let clipboardNodes: { type: NodeDataType; config: Record<string, unknown>; label: string }[] = [];

// ── Command Palette ──
function CommandPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (type: NodeDataType) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return ALL_NODE_TYPES;
    const q = query.toLowerCase();
    return ALL_NODE_TYPES.filter(t => {
      const d = nodeDefaults[t];
      return d.label.toLowerCase().includes(q) || t.toLowerCase().includes(q);
    });
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-[400px] bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-white/30" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索节点..."
            className="flex-1 bg-transparent text-[14px] text-white/80 placeholder-white/25 outline-none"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered.length > 0) { onSelect(filtered[0]); onClose(); }
            }} />
          <kbd className="text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="text-center text-[12px] text-white/20 py-6">没有匹配的节点</p>
          ) : (
            filtered.map(type => {
              const d = nodeDefaults[type];
              return (
                <button key={type} onClick={() => { onSelect(type); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.05] transition-colors">
                  <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-[13px] text-white/70">{d.label}</span>
                  <span className="text-[10px] text-white/20 ml-auto">{type}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function Canvas({ active: _active }: { active: boolean }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const flowRef = useRef<any>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    removeNode,
    removeNodes,
    undo,
    redo,
    setContextMenu,
    selectedNodeId,
    duplicateNode,
    loadFromStorage,
    loadTemplate,
  } = useWorkflowStore();

  // ── 启动时恢复上次工作流 ──
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ── 中键拖拽平移（通过 flow 实例 API，与 zoom 状态同步） ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const flow = flowRef.current;
    if (!flow) return;
    const vp = flow.getViewport();
    const startX = e.clientX, startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      flow.setViewport({ x: vp.x + ev.clientX - startX, y: vp.y + ev.clientY - startY, zoom: vp.zoom });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as NodeDataType;
      if (!type) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const position = {
        x: event.clientX - bounds.left - 170,
        y: event.clientY - bounds.top - 30,
      };
      addNode(type, position);
    },
    [addNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
  }, [selectNode, setContextMenu]);

  // ── Export workflow (for Ctrl+S) ──
  const handleExport = useCallback(() => {
    const { nodes, edges } = useWorkflowStore.getState();
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Canvas right-click ──
  const onPaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [setContextMenu]
  );

  // ── Node right-click ──
  const onNodeContextMenu = useCallback(
    (event: any, node: any) => {
      event.preventDefault();
      event.stopPropagation();
      selectNode(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [selectNode, setContextMenu]
  );

  // ── Command palette node select ──
  const handleCmdSelect = useCallback((type: NodeDataType) => {
    // 添加到画布中央
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const x = bounds ? bounds.width / 2 - 170 : 400;
    const y = bounds ? bounds.height / 2 - 30 : 300;
    addNode(type, { x, y });
  }, [addNode]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Space → pan mode (only when not in input)
      if (e.code === 'Space' && !e.repeat && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      // 不在输入框/文本区域中才响应快捷键
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Tab → Command palette
      if (e.key === 'Tab') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
        return;
      }

      // Ctrl+S / Cmd+S → Save workflow
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExport();
        return;
      }

      // Ctrl+Z / Cmd+Z → Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y → Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      // Delete / Backspace → 删除选中节点（支持批量）
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { nodes: currentNodes } = useWorkflowStore.getState();
        const selected = currentNodes.filter(n => n.selected);
        if (selected.length > 1) {
          e.preventDefault();
          useWorkflowStore.getState().removeNodes(selected.map(n => n.id));
        } else if (selectedNodeId) {
          e.preventDefault();
          removeNode(selectedNodeId);
        }
        return;
      }
      // Ctrl+D → 复制选中节点
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedNodeId) {
        e.preventDefault();
        duplicateNode(selectedNodeId);
        return;
      }
      // Ctrl+C → 复制选中节点到剪贴板
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedNodeId) {
        e.preventDefault();
        const { nodes } = useWorkflowStore.getState();
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) {
          clipboardNodes = [{ type: node.data.type, config: { ...node.data.config }, label: node.data.label }];
        }
        return;
      }
      // Ctrl+V → 从剪贴板粘贴
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardNodes.length > 0) {
        e.preventDefault();
        const { nodes, addNode } = useWorkflowStore.getState();
        // 找到画布中节点的平均位置作为粘贴位置
        let baseX = 400, baseY = 300;
        if (nodes.length > 0) {
          baseX = nodes.reduce((s, n) => s + n.position.x, 0) / nodes.length + 60;
          baseY = nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length + 60;
        }
        clipboardNodes.forEach((clip, i) => {
          addNode(clip.type, { x: baseX + i * 40, y: baseY + i * 40 });
          // 粘贴后设置配置（需要等 addNode 完成后通过新 id 设置）
          setTimeout(() => {
            const { nodes: currentNodes } = useWorkflowStore.getState();
            const newNode = currentNodes[currentNodes.length - 1 - (clipboardNodes.length - 1 - i)];
            if (newNode) {
              useWorkflowStore.getState().updateNodeConfig(newNode.id, clip.config);
            }
          }, 0);
        });
        return;
      }
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', keyUpHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', keyUpHandler);
    };
  }, [undo, redo, selectedNodeId, removeNode, removeNodes, duplicateNode, handleExport]);

  return (
    <div className="h-screen flex-1 flex flex-col">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <NodePanel />
        <div ref={reactFlowWrapper} className="flex-1" onMouseDown={handleMouseDown}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            onInit={(instance) => { flowRef.current = instance; }}
            nodeTypes={nodeTypes}
            fitView
            selectionMode={SelectionMode.Partial}
            selectionOnDrag
            panOnDrag={spaceHeld ? [0, 1] : false}
            multiSelectionKeyCode="Control"
            translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
            nodeExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#7c5cfc', strokeWidth: 2 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a2e" />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  'text-input': '#3b82f6',
                  'image-output': '#8b5cf6',
                  'video-output': '#ec4899',
                  'script-output': '#f59e0b',
                  'enhance': '#10b981',
                  'image-input': '#06b6d4',
                  'audio-output': '#f97316',
                };
                return colors[(node.data as any)?.type] || '#666';
              }}
              maskColor="rgba(0, 0, 0, 0.7)"
              style={{ background: '#1a1a24' }}
            />
          </ReactFlow>
          {/* 空格平移提示 */}
          {spaceHeld && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-purple-500/15 border border-purple-500/20 rounded-full text-[11px] text-purple-400/80 backdrop-blur-sm pointer-events-none z-50">
              ✋ 平移模式 — 拖拽画布
            </div>
          )}
          {/* 框选提示 */}
          {!spaceHeld && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-[10px] text-white/20 backdrop-blur-sm pointer-events-none z-50">
              拖拽框选 · 空格+拖拽/中键 平移 · Ctrl 多选
            </div>
          )}
        </div>
      </div>
      <ContextMenu />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onSelect={handleCmdSelect} />

      {/* 模板面板 */}
      {templateOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setTemplateOpen(false)}>
          <div className="w-[520px] bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">📋 工作流模板</span>
              <kbd className="text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded cursor-pointer" onClick={() => setTemplateOpen(false)}>ESC</kbd>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {WORKFLOW_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => { loadTemplate(t); setTemplateOpen(false); }}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/[0.04] transition-all text-left group">
                  <span className="text-2xl mt-0.5">{t.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white/80 group-hover:text-purple-300 transition-colors">{t.name}</p>
                    <p className="text-[11px] text-white/30 mt-0.5">{t.description}</p>
                    <p className="text-[10px] text-white/15 mt-1">{t.nodes.length} 个节点 · 自动连线</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 底部状态栏 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-40 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-[10px] text-white/20 backdrop-blur-sm">
          <span>{nodes.length} 节点</span>
          <span className="text-white/10">·</span>
          <span>{edges.length} 连线</span>
          <span className="text-white/10">·</span>
          <span className="text-emerald-400/40">已自动保存</span>
        </div>
        <button onClick={() => setTemplateOpen(true)}
          className="pointer-events-auto px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-full text-[10px] text-purple-300/60 hover:text-purple-300/80 backdrop-blur-sm transition-all">
          📋 模板
        </button>
      </div>
    </div>
  );
}
