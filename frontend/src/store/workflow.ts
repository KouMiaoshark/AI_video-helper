import { create } from 'zustand';
import {
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';

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
  _sourceMap?: Record<string, string>;
  [key: string]: unknown;
}

interface UndoState {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface WorkflowCanvasMeta {
  id: string;
  name: string;
  updatedAt: number;
}

interface StoredWorkflowCanvas {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  icon: string;
  nodes: { type: NodeDataType; position: { x: number; y: number }; config?: Record<string, unknown> }[];
}

const DATA_FLOW_MAP: Record<string, Record<string, Record<string, string>>> = {
  'image-output': {
    'video-output': { 'images[0]': 'image_url' },
    enhance: { 'images[0]': 'image_url' },
    'image-input': { 'images[0]': 'url' },
    'banana-output': { images: 'image_urls' },
  },
  'banana-output': {
    'video-output': { 'images[0]': 'image_url' },
    enhance: { 'images[0]': 'image_url' },
    'image-input': { 'images[0]': 'url' },
    'banana-output': { images: 'image_urls' },
  },
  'text-input': {
    'image-output': { text: 'prompt' },
    'banana-output': { text: 'prompt' },
    'video-output': { text: 'prompt' },
    'script-output': { text: 'topic' },
    'audio-output': { text: 'text' },
  },
  'image-input': {
    'video-output': { url: 'image_url' },
    enhance: { url: 'image_url' },
    'banana-output': { url: 'image_urls' },
    'image-output': { url: 'image_url' },
  },
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: '文生图',
    description: '文本 -> 图像生成',
    icon: '🎨',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: 'A beautiful landscape' } },
      { type: 'banana-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '图生视频',
    description: '图片输入 -> 视频生成',
    icon: '🎬',
    nodes: [
      { type: 'image-input', position: { x: 100, y: 200 } },
      { type: 'video-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '批量生图',
    description: '文本 -> 4张图(Banana)',
    icon: '🖼️',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: 'A cute cat' } },
      { type: 'banana-output', position: { x: 550, y: 180 }, config: { num_images: 4 } },
    ],
  },
  {
    name: 'TTS 音频',
    description: '文本 -> 语音合成',
    icon: '🔊',
    nodes: [
      { type: 'text-input', position: { x: 100, y: 200 }, config: { prompt: '你好，世界！' } },
      { type: 'audio-output', position: { x: 550, y: 180 } },
    ],
  },
  {
    name: '完整管线',
    description: '文本 -> 图像 -> 增强 -> 视频',
    icon: '⚡',
    nodes: [
      { type: 'text-input', position: { x: 50, y: 250 }, config: { prompt: 'A cyberpunk city' } },
      { type: 'banana-output', position: { x: 380, y: 230 } },
      { type: 'enhance', position: { x: 710, y: 230 } },
      { type: 'video-output', position: { x: 1040, y: 230 } },
    ],
  },
];

export const nodeDefaults: Record<NodeDataType, { label: string; color: string }> = {
  'text-input': { label: '📝 文本输入', color: '#3b82f6' },
  'image-output': { label: '🎨 图像生成', color: '#8b5cf6' },
  'video-output': { label: '🎬 视频生成', color: '#ec4899' },
  'script-output': { label: '📜 脚本生成', color: '#f59e0b' },
  enhance: { label: '✨ 图像增强', color: '#10b981' },
  'image-input': { label: '🖼️ 图片输入', color: '#06b6d4' },
  'audio-output': { label: '🔊 音频生成', color: '#f97316' },
  'banana-output': { label: '🍌 Banana 生图', color: '#eab308' },
};

const LEGACY_WORKFLOW_KEY = 'tapnow-workflow';
const CANVAS_INDEX_KEY = 'tapnow-workflow:canvases';
const ACTIVE_CANVAS_KEY = 'tapnow-workflow:active-canvas';
const CANVAS_DATA_PREFIX = 'tapnow-workflow:canvas:';
const MAX_UNDO = 50;

let nodeId = 0;

const getId = () => `node_${++nodeId}`;
const getCanvasStorageKey = (canvasId: string) => `${CANVAS_DATA_PREFIX}${canvasId}`;
const createCanvasId = () => `canvas_${Math.random().toString(36).slice(2, 10)}`;

function cloneGraphState(state: StoredWorkflowCanvas): StoredWorkflowCanvas {
  return JSON.parse(JSON.stringify(state));
}

function createEmptyCanvasState(): StoredWorkflowCanvas {
  return { nodes: [], edges: [] };
}

function syncNodeIdCounter(nodes: Node<NodeData>[]) {
  const maxId = nodes.reduce((max, node) => {
    const match = node.id.match(/^node_(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  nodeId = Math.max(nodeId, maxId);
}

function readCanvasIndex(): WorkflowCanvasMeta[] {
  try {
    const raw = localStorage.getItem(CANVAS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WorkflowCanvasMeta =>
        typeof item?.id === 'string' && typeof item?.name === 'string' && typeof item?.updatedAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeCanvasIndex(list: WorkflowCanvasMeta[]) {
  localStorage.setItem(CANVAS_INDEX_KEY, JSON.stringify(list));
}

function readCanvasData(canvasId: string): StoredWorkflowCanvas {
  try {
    const raw = localStorage.getItem(getCanvasStorageKey(canvasId));
    if (!raw) return createEmptyCanvasState();
    const parsed = JSON.parse(raw);
    return {
      nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
    };
  } catch {
    return createEmptyCanvasState();
  }
}

function writeCanvasData(canvasId: string, data: StoredWorkflowCanvas) {
  localStorage.setItem(getCanvasStorageKey(canvasId), JSON.stringify(data));
}

function deleteCanvasData(canvasId: string) {
  localStorage.removeItem(getCanvasStorageKey(canvasId));
}

function createCanvasMeta(name: string): WorkflowCanvasMeta {
  return {
    id: createCanvasId(),
    name,
    updatedAt: Date.now(),
  };
}

function extractMappedValue(result: any, mapping: Record<string, string>): Record<string, unknown> {
  if (!result) return {};
  const out: Record<string, unknown> = {};

  for (const [srcKey, targetKey] of Object.entries(mapping)) {
    const match = srcKey.match(/^(.+)\[(\d+)\]$/);
    if (match) {
      const arr = result[match[1]];
      if (Array.isArray(arr) && arr[Number(match[2])] !== undefined) {
        out[targetKey] = arr[Number(match[2])];
      }
      continue;
    }

    if (result[srcKey] !== undefined) {
      out[targetKey] = result[srcKey];
    }
  }

  return out;
}

interface WorkflowState {
  canvasList: WorkflowCanvasMeta[];
  activeCanvasId: string | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  undoStack: UndoState[];
  redoStack: UndoState[];
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

  undo: () => void;
  redo: () => void;
  saveUndo: () => void;

  setContextMenu: (menu: { x: number; y: number; nodeId?: string } | null) => void;

  propagateData: (sourceId: string) => void;
  applyDataFlowOnConnect: (sourceId: string, targetId: string) => void;
  _collectSourceUrls: (targetId: string) => { urls: string[]; sourceMap: Record<string, string> };

  initializeCanvases: () => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
  createCanvas: () => void;
  switchCanvas: (id: string) => void;
  deleteCanvas: (id: string) => void;
  loadTemplate: (template: WorkflowTemplate) => void;
}

function touchCanvasMeta(list: WorkflowCanvasMeta[], canvasId: string) {
  const updatedAt = Date.now();
  return list.map((canvas) => (canvas.id === canvasId ? { ...canvas, updatedAt } : canvas));
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  canvasList: [],
  activeCanvasId: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  undoStack: [],
  redoStack: [],
  contextMenu: null,

  saveUndo: () => {
    const { nodes, edges, undoStack } = get();
    const snapshot: UndoState = cloneGraphState({ nodes, edges });
    set({
      undoStack: [...undoStack.slice(-(MAX_UNDO - 1)), snapshot],
      redoStack: [],
    });
  },

  undo: () => {
    const { undoStack, redoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;

    const prev = undoStack[undoStack.length - 1];
    const current: UndoState = cloneGraphState({ nodes, edges });
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
      selectedNodeId: null,
    });
    get().saveToStorage();
  },

  redo: () => {
    const { undoStack, redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    const current: UndoState = cloneGraphState({ nodes, edges });
    set({
      nodes: next.nodes,
      edges: next.edges,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, current],
      selectedNodeId: null,
    });
    get().saveToStorage();
  },

  setContextMenu: (menu) => set({ contextMenu: menu }),

  _collectSourceUrls: (targetId) => {
    const { nodes, edges } = get();
    const inEdges = edges.filter((edge) => edge.target === targetId);
    const urls: string[] = [];
    const sourceMap: Record<string, string> = {};

    for (const edge of inEdges) {
      const source = nodes.find((node) => node.id === edge.source);
      if (!source?.data.result) continue;

      const result = source.data.result as any;
      if (typeof result.url === 'string') {
        urls.push(result.url);
        sourceMap.image_urls = source.id;
      } else if (Array.isArray(result.images)) {
        urls.push(...result.images);
        sourceMap.image_urls = source.id;
      } else if (Array.isArray(result.data)) {
        result.data.forEach((item: any) => {
          if (typeof item?.url === 'string') {
            urls.push(item.url);
          }
        });
        sourceMap.image_urls = source.id;
      } else if (typeof result.image_url === 'string') {
        urls.push(result.image_url);
        sourceMap.image_urls = source.id;
      }
    }

    return { urls, sourceMap };
  },

  applyDataFlowOnConnect: (sourceId, targetId) => {
    const { nodes, updateNodeConfig, _collectSourceUrls } = get();
    const source = nodes.find((node) => node.id === sourceId);
    const target = nodes.find((node) => node.id === targetId);
    if (!source || !target) return;

    const mapping = DATA_FLOW_MAP[source.data.type]?.[target.data.type];
    if (!mapping) return;

    if (Object.values(mapping).includes('image_urls')) {
      const { urls, sourceMap } = _collectSourceUrls(targetId);
      if (urls.length > 0) {
        updateNodeConfig(targetId, {
          image_urls: urls,
          _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMap },
        });
      }
      return;
    }

    const values = extractMappedValue(source.data.result, mapping);
    if (Object.keys(values).length === 0) return;

    const sourceMapEntry: Record<string, string> = {};
    for (const [, targetKey] of Object.entries(mapping)) {
      sourceMapEntry[targetKey] = sourceId;
    }

    updateNodeConfig(targetId, {
      ...values,
      _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMapEntry },
    });
  },

  propagateData: (sourceId) => {
    const { nodes, edges, updateNodeConfig, _collectSourceUrls } = get();
    const source = nodes.find((node) => node.id === sourceId);
    if (!source?.data.result) return;

    const outEdges = edges.filter((edge) => edge.source === sourceId);
    for (const edge of outEdges) {
      const target = nodes.find((node) => node.id === edge.target);
      if (!target) continue;

      const mapping = DATA_FLOW_MAP[source.data.type]?.[target.data.type];
      if (!mapping) continue;

      if (Object.values(mapping).includes('image_urls')) {
        const { urls, sourceMap } = _collectSourceUrls(target.id);
        if (urls.length > 0) {
          updateNodeConfig(target.id, {
            image_urls: urls,
            _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMap },
          });
        }
        continue;
      }

      const values = extractMappedValue(source.data.result, mapping);
      if (Object.keys(values).length === 0) continue;

      const sourceMapEntry: Record<string, string> = {};
      for (const [, targetKey] of Object.entries(mapping)) {
        sourceMapEntry[targetKey] = sourceId;
      }

      updateNodeConfig(target.id, {
        ...values,
        _sourceMap: { ...(target.data._sourceMap || {}), ...sourceMapEntry },
      });
    }
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<NodeData>[] });
    get().saveToStorage();
  },

  onEdgesChange: (changes) => {
    get().saveUndo();
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get().saveToStorage();
  },

  onConnect: (connection) => {
    get().saveUndo();
    set({ edges: addEdge(connection, get().edges) });
    get().saveToStorage();

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
    get().saveToStorage();
  },

  removeNode: (id) => {
    get().saveUndo();
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
    get().saveToStorage();
  },

  removeNodes: (ids) => {
    if (ids.length === 0) return;
    get().saveUndo();
    const idSet = new Set(ids);
    set({
      nodes: get().nodes.filter((node) => !idSet.has(node.id)),
      edges: get().edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target)),
      selectedNodeId: null,
    });
    get().saveToStorage();
  },

  updateNodeDimensions: (id, width, height) => {
    get().onNodesChange([
      {
        type: 'dimensions',
        id,
        dimensions: { width, height },
        updateStyle: true,
        resizing: true,
      } as any,
    ]);
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, config: { ...node.data.config, ...config } } }
          : node,
      ),
    });
    get().saveToStorage();
  },

  updateNodeStatus: (id, status, result) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, status, result } } : node,
      ),
    });
    get().saveToStorage();

    if (status === 'done') {
      setTimeout(() => get().propagateData(id), 50);
    }
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  clearCanvas: () => {
    get().saveUndo();
    set({ nodes: [], edges: [], selectedNodeId: null });
    get().saveToStorage();
  },

  duplicateNode: (id) => {
    get().saveUndo();
    const node = get().nodes.find((item) => item.id === id);
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
    get().saveToStorage();
  },

  initializeCanvases: () => {
    const existingIndex = readCanvasIndex();

    if (existingIndex.length === 0) {
      const legacyRaw = localStorage.getItem(LEGACY_WORKFLOW_KEY);
      if (legacyRaw) {
        try {
          const legacyParsed = JSON.parse(legacyRaw);
          const migratedCanvas = createCanvasMeta('画布 1');
          const migratedData: StoredWorkflowCanvas = {
            nodes: Array.isArray(legacyParsed?.nodes) ? legacyParsed.nodes : [],
            edges: Array.isArray(legacyParsed?.edges) ? legacyParsed.edges : [],
          };

          writeCanvasIndex([migratedCanvas]);
          writeCanvasData(migratedCanvas.id, migratedData);
          localStorage.setItem(ACTIVE_CANVAS_KEY, migratedCanvas.id);
          localStorage.removeItem(LEGACY_WORKFLOW_KEY);

          syncNodeIdCounter(migratedData.nodes);
          set({
            canvasList: [migratedCanvas],
            activeCanvasId: migratedCanvas.id,
            nodes: migratedData.nodes,
            edges: migratedData.edges,
            selectedNodeId: null,
            undoStack: [],
            redoStack: [],
            contextMenu: null,
          });
          return;
        } catch {
          localStorage.removeItem(LEGACY_WORKFLOW_KEY);
        }
      }

      const firstCanvas = createCanvasMeta('画布 1');
      writeCanvasIndex([firstCanvas]);
      writeCanvasData(firstCanvas.id, createEmptyCanvasState());
      localStorage.setItem(ACTIVE_CANVAS_KEY, firstCanvas.id);
      set({
        canvasList: [firstCanvas],
        activeCanvasId: firstCanvas.id,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        undoStack: [],
        redoStack: [],
        contextMenu: null,
      });
      return;
    }

    const savedActiveCanvasId = localStorage.getItem(ACTIVE_CANVAS_KEY);
    const activeCanvas =
      existingIndex.find((canvas) => canvas.id === savedActiveCanvasId) ?? existingIndex[0];
    const activeData = readCanvasData(activeCanvas.id);

    syncNodeIdCounter(activeData.nodes);
    set({
      canvasList: existingIndex,
      activeCanvasId: activeCanvas.id,
      nodes: activeData.nodes,
      edges: activeData.edges,
      selectedNodeId: null,
      undoStack: [],
      redoStack: [],
      contextMenu: null,
    });
    localStorage.setItem(ACTIVE_CANVAS_KEY, activeCanvas.id);
  },

  loadFromStorage: () => {
    get().initializeCanvases();
  },

  saveToStorage: () => {
    const { activeCanvasId, canvasList, nodes, edges } = get();
    if (!activeCanvasId) return;

    const clonedState = cloneGraphState({ nodes, edges });
    const nextCanvasList = touchCanvasMeta(canvasList, activeCanvasId);

    writeCanvasData(activeCanvasId, clonedState);
    writeCanvasIndex(nextCanvasList);
    localStorage.setItem(ACTIVE_CANVAS_KEY, activeCanvasId);

    set({ canvasList: nextCanvasList });
  },

  createCanvas: () => {
    const { canvasList } = get();
    get().saveToStorage();

    const nextCanvas = createCanvasMeta(`画布 ${canvasList.length + 1}`);
    const nextCanvasList = [...get().canvasList, nextCanvas];
    writeCanvasIndex(nextCanvasList);
    writeCanvasData(nextCanvas.id, createEmptyCanvasState());
    localStorage.setItem(ACTIVE_CANVAS_KEY, nextCanvas.id);

    set({
      canvasList: nextCanvasList,
      activeCanvasId: nextCanvas.id,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      undoStack: [],
      redoStack: [],
      contextMenu: null,
    });
  },

  switchCanvas: (id) => {
    const { activeCanvasId, canvasList } = get();
    if (id === activeCanvasId || !canvasList.some((canvas) => canvas.id === id)) return;

    get().saveToStorage();
    const nextState = readCanvasData(id);
    syncNodeIdCounter(nextState.nodes);
    localStorage.setItem(ACTIVE_CANVAS_KEY, id);

    set({
      activeCanvasId: id,
      nodes: nextState.nodes,
      edges: nextState.edges,
      selectedNodeId: null,
      undoStack: [],
      redoStack: [],
      contextMenu: null,
    });
  },

  deleteCanvas: (id) => {
    const { activeCanvasId, canvasList } = get();
    if (!canvasList.some((canvas) => canvas.id === id)) return;

    get().saveToStorage();
    const remainingCanvases = canvasList.filter((canvas) => canvas.id !== id);
    deleteCanvasData(id);

    if (remainingCanvases.length === 0) {
      const replacementCanvas = createCanvasMeta('画布 1');
      writeCanvasIndex([replacementCanvas]);
      writeCanvasData(replacementCanvas.id, createEmptyCanvasState());
      localStorage.setItem(ACTIVE_CANVAS_KEY, replacementCanvas.id);
      set({
        canvasList: [replacementCanvas],
        activeCanvasId: replacementCanvas.id,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        undoStack: [],
        redoStack: [],
        contextMenu: null,
      });
      return;
    }

    writeCanvasIndex(remainingCanvases);

    if (activeCanvasId === id) {
      const deletedIndex = canvasList.findIndex((canvas) => canvas.id === id);
      const fallbackCanvas =
        remainingCanvases[Math.max(0, Math.min(deletedIndex - 1, remainingCanvases.length - 1))] ??
        remainingCanvases[0];
      const fallbackState = readCanvasData(fallbackCanvas.id);
      syncNodeIdCounter(fallbackState.nodes);
      localStorage.setItem(ACTIVE_CANVAS_KEY, fallbackCanvas.id);

      set({
        canvasList: remainingCanvases,
        activeCanvasId: fallbackCanvas.id,
        nodes: fallbackState.nodes,
        edges: fallbackState.edges,
        selectedNodeId: null,
        undoStack: [],
        redoStack: [],
        contextMenu: null,
      });
      return;
    }

    set({ canvasList: remainingCanvases });
  },

  loadTemplate: (template) => {
    get().saveUndo();

    const newNodes: Node<NodeData>[] = template.nodes.map((item) => ({
      id: getId(),
      type: 'custom',
      position: { ...item.position },
      data: {
        label: nodeDefaults[item.type].label,
        type: item.type,
        status: 'idle',
        config: { ...(item.config || {}) },
      },
      style: { width: 340 },
    }));

    const newEdges: Edge[] = [];
    for (let index = 0; index < newNodes.length - 1; index += 1) {
      newEdges.push({
        id: `e-${newNodes[index].id}-${newNodes[index + 1].id}`,
        source: newNodes[index].id,
        target: newNodes[index + 1].id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#7c5cfc', strokeWidth: 2 },
      });
    }

    set({ nodes: newNodes, edges: newEdges, selectedNodeId: null });
    get().saveToStorage();
  },
}));
