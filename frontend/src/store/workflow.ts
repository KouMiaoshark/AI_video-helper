/**
 * Workflow Store - 管理画布节点和连线状态
 * 支持：节点数据流传递、撤销/重做、上下文菜单
 */

import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';

// ── Node types ──
export type NodeDataType =
  | 'text-input'
  | 'image-output'
  | 'video-output'
  | 'script-output'
  | 'enhance'
  | 'image-input'
  | 'audio-output'
  | 'banana-output';

export interface NodeData {
  label: string;
  type: NodeDataType;
  status: 'idle' | 'running' | 'done' | 'error';
  config: Record<string, unknown>;
  result?: unknown;
  /** 数据流：记录自动填充的来源节点 */
  _sourceMap?: Record<string, string>; // configField -> sourceNodeId
  [key: string]: unknown;
}

// ── Data flow mapping ──
// sourceType -> { targetType -> { sourceResultField: targetConfigField } }
const DATA_FLOW_MAP: Record<string, Record<string, Record<string, string>>> = {
  'image-output': {
    'video-output': { 'images[0]': 'image_url' },
    'enhance': { 'images[0]': 'image_url' },
    'image-input': { 'images[0]': 'url' },
    'banana-output': { 'images': 'image_urls' },
  },
  'banana-output': {
    'video-output': { 'images[0]': 'image_url' },
    'enhance': { 'images[0]': 'image_url' },
    'image-input': { 'images[0]': 'url' },
    'banana-output': { 'images': 'image_urls' },
  },
  'text-input': {
    'image-output': { 'text': 'prompt' },
    'banana-output': { 'text': 'prompt' },
    'video-output': { 'text': 'prompt' },
    'script-output': { 'text': 'topic' },
    'audio-output': { 'text': 'text' },
  },
  'image-input': {
    'video-output': { 'url': 'image_url' },
    'enhance': { 'url': 'image_url' },
    'banana-output': { 'url': 'image_urls' },
    'image-output': { 'url': 'image_url' },
  },
};

/**
 * 从 result 中根据映射规则提取值
 */
function extractMappedValue(result: any, mapping: Record<string, string>): Record<string, unknown> {
  if (!result) return {};
  const out: Record<string, unknown> = {};
  for (const [srcKey, targetKey] of Object.entries(mapping)) {
    // 支持 images[0] 语法
    const match = srcKey.match(/^(.+)\[(\d+)\]$/);
    if (match) {
      const arr = result[match[1]];
      if (Array.isArray(arr) && arr[Number(match[2])] !== undefined) {
        out[targetKey] = arr[Number(match[2])];
      }
    } else {
      if (result[srcKey] !== undefined) {
        out[targetKey] = result[srcKey];
      }
    }
  }
  return out;
}

// ── State ──
interface UndoState {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

// ── 工作流模板 ──
export interface WorkflowTemplate {
  name: string;
  description: string;
  icon: string;
  nodes: { type: NodeDataType; position: { x: number; y: number }; config?: Record<string, unknown> }[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: '文生图',
    description: '文本 → 图像生成',
    icon: '🎨',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: 'A beautiful landscape' } },
      { type: 'banana-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '图生视频',
    description: '图片输入 → 视频生成',
    icon: '🎬',
    nodes: [
      { type: 'image-input', position: { x: 100, y: 200 } },
      { type: 'video-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '批量生图',
    description: '文本 → 4张图（Banana）',
    icon: '📦',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: 'A cute cat' } },
      { type: 'banana-output', position: { x: 550, y: 180 }, config: { num_images: 4 } },
    ],
  },
  {
    name: 'TTS 音频',
    description: '文本 → 语音合成',
    icon: '🔊',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: '你好，世界！' } },
      { type: 'audio-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '完整管线',
    description: '文本 → 图像 → 增强 → 视频',
    icon: '⚡',
    nodes: [
      { type: 'text-input', position: { x: 50, y: 250 }, config: { prompt: 'A cyberpunk city' } },
      { type: 'banana-output', position: { x: 380, y: 230 } },
      { type: 'enhance', position: { x: 710, y: 230 } },
      { type: 'video-output', position: { x: 1040, y: 230 } },
    ],
  },
];

interface WorkflowState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Undo/Redo
  undoStack: UndoState[];
  redoStack: UndoState[];

  // Context menu
  contextMenu: { x: number; y: number; nodeId?: string } | null;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (type: NodeDataType, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  updateNodeDimensions: (id: string, width: number, height: number) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeStatus: (id: string, status: NodeData['status'], result?: unknown) => void;
  selectNode: (id: string | null) => void;
  clearCanvas: () => void;
  duplicateNode: (id: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  saveUndo: () => void;

  // Context menu
  setContextMenu: (menu: { x: number; y: number; nodeId?: string } | null) => void;

  // Data flow
  propagateData: (sourceId: string) => void;
  applyDataFlowOnConnect: (sourceId: string, targetId: string) => void;
  _collectSourceUrls: (targetId: string) => { urls: string[]; sourceMap: Record<string, string> };

  // Auto-save & templates
  loadFromStorage: () => void;
  saveToStorage: () => void;
  loadTemplate: (template: WorkflowTemplate) => void;
}

export const nodeDefaults: Record<NodeDataType, { label: string; color: string }> = {
  'text-input': { label: '📝 文本输入', color: '#3b82f6' },
  'image-output': { label: '🎨 图像生成', color: '#8b5cf6' },
  'video-output': { label: '🎬 视频生成', color: '#ec4899' },
  'script-output': { label: '📜 脚本生成', color: '#f59e0b' },
  'enhance': { label: '✨ 图像增强', color: '#10b981' },
  'image-input': { label: '🖼️ 图片输入', color: '#06b6d4' },
  'audio-output': { label: '🔊 音频生成', color: '#f97316' },
  'banana-output': { label: '🍌 Banana 生图', color: '#eab308' },
};

let nodeId = 0;
const getId = () => `node_${++nodeId}`;

const MAX_UNDO = 50;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  undoStack: [],
  redoStack: [],
  contextMenu: null,

  // ── Undo/Redo ──
  saveUndo: () => {
    const { nodes, edges, undoStack } = get();
    const snapshot: UndoState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      undoStack: [...undoStack.slice(-(MAX_UNDO - 1)), snapshot],
      redoStack: [],
    });
  },

  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const current: UndoState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, current],
    });
  },

  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current: UndoState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      nodes: next.nodes,
      edges: next.edges,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, current],
    });
  },

  // ── Context menu ──
  setContextMenu: (menu) => set({ contextMenu: menu }),

  // ── Data flow ──

  /** 收集目标节点所有上游 source 的 URL（用于 image_urls 累积） */
  _collectSourceUrls: (targetId: string) => {
    const { nodes, edges } = get();
    const inEdges = edges.filter(e => e.target === targetId);
    const urls: string[] = [];
    const sourceMap: Record<string, string> = {};
    for (const edge of inEdges) {
      const src = nodes.find(n => n.id === edge.source);
      if (!src?.data.result) continue;
      const r = src.data.result as any;
      // image-input: { url }, image/banana-output: { images: [...] }，兼容多种格式
      if (r.url) { urls.push(r.url); sourceMap['image_urls'] = src.id; }
      else if (Array.isArray(r.images)) { urls.push(...r.images); sourceMap['image_urls'] = src.id; }
      else if (Array.isArray(r.data)) { r.data.forEach((d: any) => { const u = d?.url; if (u) urls.push(u); }); sourceMap['image_urls'] = src.id; }
      else if (typeof r.image_url === 'string') { urls.push(r.image_url); sourceMap['image_urls'] = src.id; }
    }
    return { urls, sourceMap };
  },

  applyDataFlowOnConnect: (sourceId, targetId) => {
    const { nodes, updateNodeConfig, _collectSourceUrls } = get();
    const source = nodes.find(n => n.id === sourceId);
    const target = nodes.find(n => n.id === targetId);
    if (!source || !target) return;

    const mapping = DATA_FLOW_MAP[source.data.type]?.[target.data.type];
    if (!mapping) return;

    // 特殊处理 image_urls：收集所有上游 URL
    const hasImageUrls = Object.values(mapping).includes('image_urls');
    if (hasImageUrls) {
      const { urls, sourceMap } = _collectSourceUrls(targetId);
      if (urls.length > 0) {
        updateNodeConfig(targetId, {
          image_urls: urls,
          _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMap },
        });
      }
      return;
    }

    // 普通映射
    const values = extractMappedValue(source.data.result, mapping);
    if (Object.keys(values).length === 0) return;
    const sourceMapEntry: Record<string, string> = {};
    for (const [, targetKey] of Object.entries(mapping)) {
      sourceMapEntry[targetKey] = sourceId;
    }
    updateNodeConfig(targetId, { ...values, _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMapEntry } });
  },

  propagateData: (sourceId) => {
    const { nodes, edges, updateNodeConfig, _collectSourceUrls } = get();
    const source = nodes.find(n => n.id === sourceId);
    if (!source || !source.data.result) return;

    const outEdges = edges.filter(e => e.source === sourceId);
    for (const edge of outEdges) {
      const target = nodes.find(n => n.id === edge.target);
      if (!target) continue;

      const mapping = DATA_FLOW_MAP[source.data.type]?.[target.data.type];
      if (!mapping) continue;

      // 特殊处理 image_urls
      const hasImageUrls = Object.values(mapping).includes('image_urls');
      if (hasImageUrls) {
        const { urls, sourceMap } = _collectSourceUrls(target.id);
        if (urls.length > 0) {
          updateNodeConfig(target.id, {
            image_urls: urls,
            _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMap },
          });
        }
        continue;
      }

      // 普通映射
      const values = extractMappedValue(source.data.result, mapping);
      if (Object.keys(values).length === 0) continue;
      const sourceMapEntry: Record<string, string> = {};
      for (const [, targetKey] of Object.entries(mapping)) {
        sourceMapEntry[targetKey] = sourceId;
      }
      updateNodeConfig(target.id, { ...values, _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMapEntry } });
    }
  },

  // ── Standard React Flow handlers ──
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<NodeData>[] });
    // 自动保存（防抖：直接存，localStorage 很快）
    try { localStorage.setItem('tapnow-workflow', JSON.stringify({ nodes: get().nodes, edges: get().edges })); } catch {}
  },

  onEdgesChange: (changes) => {
    get().saveUndo();
    set({ edges: applyEdgeChanges(changes, get().edges) });
    try { localStorage.setItem('tapnow-workflow', JSON.stringify({ nodes: get().nodes, edges: get().edges })); } catch {}
  },

  onConnect: (connection) => {
    get().saveUndo();
    set({ edges: addEdge(connection, get().edges) });
    // 连线后立即传递数据
    if (connection.source && connection.target) {
      get().applyDataFlowOnConnect(connection.source, connection.target);
    }
  },

  addNode: (type, position) => {
    get().saveUndo();
    const defaults = nodeDefaults[type];
    const newNode: Node<NodeData> = {
      id: getId(),
      type: 'custom',
      position,
      data: {
        label: defaults.label,
        type,
        status: 'idle',
        config: {},
      },
      style: { width: 340 },
    };
    set({ nodes: [...get().nodes, newNode] });
  },

  removeNode: (id) => {
    get().saveUndo();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  removeNodes: (ids) => {
    if (ids.length === 0) return;
    get().saveUndo();
    const idSet = new Set(ids);
    set({
      nodes: get().nodes.filter((n) => !idSet.has(n.id)),
      edges: get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: null,
    });
  },

  updateNodeDimensions: (id, width, height) => {
    get().onNodesChange([{
      type: 'dimensions',
      id,
      dimensions: { width, height },
      updateStyle: true,
      resizing: true,
    } as any]);
  },

  duplicateNode: (id) => {
    get().saveUndo();
    const node = get().nodes.find(n => n.id === id);
    if (!node) return;
    const newNode: Node<NodeData> = {
      ...node,
      id: getId(),
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: {
        ...node.data,
        status: 'idle',
        result: undefined,
      },
    };
    set({ nodes: [...get().nodes, newNode] });
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n
      ),
    });
  },

  updateNodeStatus: (id, status, result) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, status, result } } : n
      ),
    });
    // 如果完成，自动传递数据到下游节点
    if (status === 'done') {
      // 延迟一下确保 state 已更新
      setTimeout(() => get().propagateData(id), 50);
    }
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  clearCanvas: () => {
    get().saveUndo();
    set({ nodes: [], edges: [], selectedNodeId: null });
  },

  // ── Auto-save & Templates ──
  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem('tapnow-workflow');
      if (saved) {
        const { nodes, edges } = JSON.parse(saved);
        if (Array.isArray(nodes) && nodes.length > 0) {
          set({ nodes, edges: edges || [], selectedNodeId: null });
          console.log(`[AutoSave] 恢复了 ${nodes.length} 个节点`);
        }
      }
    } catch {}
  },

  saveToStorage: () => {
    try {
      const { nodes, edges } = get();
      localStorage.setItem('tapnow-workflow', JSON.stringify({ nodes, edges }));
    } catch {}
  },

  loadTemplate: (template: WorkflowTemplate) => {
    get().saveUndo();
    const newNodes: Node<NodeData>[] = template.nodes.map((n) => ({
      id: getId(),
      type: 'custom' as const,
      position: { ...n.position },
      data: {
        label: nodeDefaults[n.type].label,
        type: n.type,
        status: 'idle' as const,
        config: { ...(n.config || {}) },
      },
      style: { width: 340 },
    }));
    // 自动连线（顺序连接）
    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e-${newNodes[i].id}-${newNodes[i + 1].id}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#7c5cfc', strokeWidth: 2 },
      });
    }
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: null });
  },
}));
