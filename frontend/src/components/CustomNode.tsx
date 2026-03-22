/**
 * 自定义节点组件 - 内联配置版
 * 每个节点自包含全部配置，不再依赖右侧属性面板
 */

import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useWorkflowStore, nodeDefaults } from '../store/workflow';
import type { NodeData } from '../store/workflow';
import { api } from '../api/client';
import {
  Trash2, Loader2, CheckCircle2, AlertCircle, Play,
  ImagePlus, Plus
} from 'lucide-react';

// ── Status ──
const statusIcons: Record<string, React.ReactNode> = {
  idle: null,
  running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />,
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
};

const statusBorders: Record<string, string> = {
  idle: 'border-white/[0.08]',
  running: 'border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.15)]',
  done: 'border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.12)]',
  error: 'border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.12)]',
};

// ── Constants ──
const BANANA_MODELS = [
  { value: 'nano-banana-2', label: 'Nano Banana 2 (快速)' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro (高质量)' },
  { value: 'flux-1.1-pro', label: 'Flux 1.1 Pro' },
  { value: 'sdxl', label: 'SDXL' },
  { value: 'dall-e-3', label: 'DALL·E 3' },
];
const AUDIO_MODELS = [
  { value: 'tts-1', label: 'TTS-1 (标准)' },
  { value: 'tts-1-hd', label: 'TTS-1 HD (高清)' },
];
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '4:3', '3:4', '16:9', '9:16'];
const IMAGE_SIZES = ['1K', '2K', '4K'];

// ── Shared styles ──
const inputCls = "w-full px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-purple-500/50 transition-colors";
const selectCls = "w-full px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 focus:outline-none focus:border-purple-500/50 transition-colors appearance-none cursor-pointer";

function btnPill(active: boolean, color = 'purple') {
  const base = `px-3 py-1.5 rounded-lg text-xs font-medium transition-all`;
  if (active) {
    const colors: Record<string, string> = {
      purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
      yellow: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
    };
    return `${base} ${colors[color]}`;
  }
  return `${base} bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/50`;
}

// ── Label ──
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{children}</label>;
}

// ── Running progress bar ──
function RunningBar() {
  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[15px] overflow-hidden z-10">
      <div className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-runningBar" />
      <style>{`
        @keyframes runningBar {
          0% { transform: translateX(-100%); width: 40%; }
          100% { transform: translateX(250%); width: 40%; }
        }
        .animate-runningBar { animation: runningBar 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ── Run Button ──
function RunButton({ running, onClick }: { running: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={running}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-1
        bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400
        disabled:from-gray-700 disabled:to-gray-600 disabled:cursor-not-allowed
        text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-purple-500/10"
    >
      {running ? (
        <><Loader2 className="w-4 h-4 animate-spin" /><span>生成中...</span></>
      ) : (
        <><Play className="w-4 h-4" /><span>运行</span></>
      )}
    </button>
  );
}

// ── Provider Selector ──
function ProviderSelector({
  config, nodeId, taskName, providerNames, taskDefaults,
}: {
  config: Record<string, unknown>;
  nodeId: string;
  taskName: string;
  providerNames: string[];
  taskDefaults: Record<string, string>;
}) {
  const { updateNodeConfig } = useWorkflowStore();
  const defaultProvider = taskDefaults[taskName] || '(none)';
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Label>Provider</Label>
        <select
          value={(config.provider as string) || ''}
          onChange={(e) => updateNodeConfig(nodeId, { provider: e.target.value })}
          className="w-full mt-1.5 px-2 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-white/60 focus:outline-none focus:border-purple-500/40"
        >
          <option value="">默认 ({defaultProvider})</option>
          {providerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className="flex-1">
        <Label>Model</Label>
        <input type="text" value={(config.model as string) || ''}
          onChange={(e) => updateNodeConfig(nodeId, { model: e.target.value })}
          placeholder="默认"
          className="w-full mt-1.5 px-2 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-white/60 placeholder-white/15 focus:outline-none focus:border-purple-500/40"
        />
      </div>
    </div>
  );
}

// ── Result Image Grid (可拖拽排序) ──
function ResultGrid({ images, onLightbox }: { images: string[]; onLightbox: (url: string) => void }) {
  const [order, setOrder] = useState<number[]>(() => images.map((_, i) => i));
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // images 变化时重置排序
  useEffect(() => {
    setOrder(images.map((_, i) => i));
  }, [images.join('|')]);

  if (images.length === 0) return null;
  const ordered = order.filter(i => i < images.length).map(i => images[i]);

  return (
    <div className={`nodrag grid gap-1.5 ${ordered.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {ordered.map((img, displayIdx) => (
        <div key={order[displayIdx]} className="relative group cursor-grab active:cursor-grabbing"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDragIdx(displayIdx);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (dragIdx === null || dragIdx === displayIdx) return;
            setOrder(prev => {
              const next = [...prev];
              const [m] = next.splice(dragIdx, 1);
              next.splice(displayIdx, 0, m);
              return next;
            });
            setDragIdx(null);
          }}
          onDragEnd={() => setDragIdx(null)}
        >
          <img src={img} alt="" onClick={() => onLightbox(img)}
            className="w-full rounded-lg cursor-pointer hover:opacity-80 transition-opacity object-contain bg-black/40"
            style={{ minHeight: '80px' }} />
          {ordered.length > 1 && (
            <span className="absolute top-1 left-1 text-[8px] font-bold bg-purple-500/80 text-white w-4 h-4 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
              {displayIdx + 1}
            </span>
          )}
          {dragIdx !== null && dragIdx !== displayIdx && (
            <div className="absolute inset-0 border-2 border-dashed border-purple-500/50 rounded-lg pointer-events-none" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Node Component ──
export const CustomNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData;
  const defaults = nodeDefaults[nodeData.type];
  const { selectNode, removeNode, updateNodeConfig, updateNodeStatus, onNodesChange } = useWorkflowStore();
  const config = nodeData.config as Record<string, unknown>;
  const result = nodeData.result as any;
  const nodeRef = useRef<HTMLDivElement>(null);

  // 从任意格式的 result 中提取图片数组
  const resultImages: string[] = useMemo(() => {
    if (!result) return [];
    const imgs = Array.isArray(result.images) ? result.images
      : Array.isArray(result.data) ? result.data.map((d: any) => d?.url || d).filter(Boolean)
      : typeof result.url === 'string' ? [result.url]
      : typeof result.image_url === 'string' ? [result.image_url]
      : [];
    if (imgs.length > 0) console.log(`[CustomNode] ${nodeData.id} resultImages:`, imgs.length, '张');
    else if (result && Object.keys(result).length > 0) console.warn(`[CustomNode] ${nodeData.id} result 无图片:`, Object.keys(result));
    return imgs;
  }, [result, nodeData.id]);
  const dragRef = useRef<{ edge: string; sx: number; sy: number; w: number; h: number; px: number; py: number } | null>(null);

  // ── 边缘缩放：pointer 事件 ──
  const EDGE = 14;
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = nodeRef.current;
    if (!el) return;
    // 跳过 NodeResizer 句柄（它们有自己的拖拽逻辑）
    const target = e.target as HTMLElement;
    if (target.classList.contains('nodrag') || target.closest('.react-flow__resize-control')) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const w = rect.width, h = rect.height;
    let edge = '';
    if (y < EDGE) edge += 'n'; else if (y > h - EDGE) edge += 's';
    if (x < EDGE) edge += 'w'; else if (x > w - EDGE) edge += 'e';
    if (!edge) return; // 中间区域 → 交给 React Flow 拖拽

    e.stopPropagation(); // 阻止 React Flow useDrag（document 级监听）
    const node = useWorkflowStore.getState().nodes.find(n => n.id === id);
    dragRef.current = { edge, sx: e.clientX, sy: e.clientY, w, h, px: node?.position.x || 0, py: node?.position.y || 0 };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const { edge: ed, sx, sy, w: ow, h: oh, px, py } = dragRef.current;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let nw = ow, nh = oh, nx = px, ny = py;
      if (ed.includes('e')) nw = Math.max(280, ow + dx);
      if (ed.includes('s')) nh = Math.max(120, oh + dy);
      if (ed.includes('w')) { nw = Math.max(280, ow - dx); nx = px + dx; }
      if (ed.includes('n')) { nh = Math.max(120, oh - dy); ny = py + dy; }
      onNodesChange([{ type: 'dimensions', id, dimensions: { width: nw, height: nh }, updateStyle: true, resizing: true } as any]);
      if (ed.includes('n') || ed.includes('w')) {
        onNodesChange([{ type: 'position', id, position: { x: nx, y: ny }, dragging: true }]);
      }
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [id, onNodesChange]);

  // ── 边缘光标反馈 ──
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return;
    const el = nodeRef.current;
    if (!el) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('nodrag') || target.closest('.react-flow__resize-control')) { el.style.cursor = ''; return; }
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const w = rect.width, h = rect.height;
    const onT = y < EDGE, onB = y > h - EDGE, onL = x < EDGE, onR = x > w - EDGE;
    if ((onT && onL) || (onB && onR)) el.style.cursor = 'nwse-resize';
    else if ((onT && onR) || (onB && onL)) el.style.cursor = 'nesw-resize';
    else if (onT || onB) el.style.cursor = 'ns-resize';
    else if (onL || onR) el.style.cursor = 'ew-resize';
    else el.style.cursor = '';
  }, []);

  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Provider list
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [taskDefaults, setTaskDefaults] = useState<Record<string, string>>({});
  useEffect(() => {
    api.getRawConfig().then((data) => {
      setProviderNames(Object.keys(data.providers || {}));
      setTaskDefaults(data.defaults || {});
    }).catch(() => {});
  }, []);

  // ── Helpers ──
  const handleUpload = async (file: File, multi = false) => {
    setUploading(true);
    try {
      const r = await api.uploadFile(file);
      if (multi) {
        const urls = (config.image_urls as string[]) || [];
        const previews = (config.local_previews as string[]) || [];
        updateNodeConfig(id, {
          image_urls: [...urls, r.url],
          local_previews: [...previews, URL.createObjectURL(file)],
        });
      } else {
        updateNodeConfig(id, { url: r.url, filename: r.filename, localPreview: URL.createObjectURL(file) });
        // 标记完成 + 存 result，触发数据流传递
        updateNodeStatus(id, 'done', { url: r.url, filename: r.filename });
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    updateNodeStatus(id, 'running');
    try {
      let r;
      const provider = config.provider as string || undefined;
      switch (nodeData.type) {
        case 'image-output':
          r = await api.generateImage({
            prompt: (config.prompt as string) || 'A beautiful landscape',
            negative_prompt: (config.negative_prompt as string) || '',
            width: (config.width as number) || 1024, height: (config.height as number) || 1024,
            model: config.model as string || undefined, provider,
          }); break;
        case 'banana-output': {
          const imageUrls = (config.image_urls as string[]) || [];
          r = await api.generateImage({
            prompt: (config.prompt as string) || 'A beautiful landscape',
            negative_prompt: '', width: 1024, height: 1024,
            num_images: (config.num_images as number) || 1,
            model: (config.model as string) || 'nano-banana-pro',
            aspect_ratio: (config.aspect_ratio as string) || '1:1',
            image_size: (config.image_size as string) || '1K',
            image_urls: imageUrls.length > 0 ? imageUrls : undefined,
            provider: provider || 'bltcy',
          }); break;
        }
        case 'script-output':
          r = await api.generateScript({
            topic: (config.topic as string) || 'Product Ad',
            style: (config.style as string) || 'commercial',
            length: (config.length as string) || 'short',
            model: config.model as string || undefined, provider,
          }); break;
        case 'enhance':
          r = await api.enhanceImage({
            image_url: (config.image_url as string) || '',
            mode: (config.mode as string) || 'upscale',
            scale: (config.scale as number) || 2, provider,
          }); break;
        case 'video-output':
          r = await api.generateVideo({
            prompt: (config.prompt as string) || '',
            duration: (config.duration as number) || 5,
            model: config.model as string || undefined, provider,
          }); break;
        case 'audio-output':
          r = await api.generateAudio({
            text: (config.text as string) || '',
            voice: (config.voice as string) || 'default',
            model: config.model as string || undefined, provider,
          }); break;
      }
      // 自动保存生成的图片到资产
      if (r && (nodeData.type === 'image-output' || nodeData.type === 'banana-output') && (r as any).images && Array.isArray((r as any).images)) {
        const prompt = (config.prompt as string) || '';
        const model = (config.model as string) || '';
        console.log(`[handleRun] ${nodeData.type} 生成 ${(r as any).images.length} 张图片`);
        for (const imgUrl of (r as any).images) {
          try {
            await fetch('/api/save-image', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_url: imgUrl, prompt, model }),
            });
          } catch {}
        }
      } else if (r && (nodeData.type === 'image-output' || nodeData.type === 'banana-output')) {
        console.warn(`[handleRun] API 返回但无 images 字段:`, JSON.stringify(r).slice(0, 500));
      }
      updateNodeStatus(id, 'done', r);
    } catch (err: any) {
      updateNodeStatus(id, 'error', { error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // ── Render body per node type ──
  const renderBody = () => {
    switch (nodeData.type) {
      case 'text-input':
        return (
          <div className="space-y-3">
            <Label>内容</Label>
            <textarea
              value={(config.prompt as string) || ''}
              onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
              placeholder="输入文本内容..."
              className="w-full min-h-[5rem] max-h-[10rem] resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        );

      case 'image-input':
        return (
          <div className="space-y-3">
            <Label>图片</Label>
            {config.url ? (
              <div className="relative group">
                <img
                  src={(config.localPreview as string) || (config.url as string)}
                  alt="Preview"
                  className="w-full rounded-lg border border-white/[0.06]"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <span className="text-white/70 text-xs">点击替换</span>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleUpload(f); }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/[0.08] rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/[0.03] transition-all"
              >
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                ) : (
                  <><ImagePlus className="w-8 h-8 text-white/20" /><p className="text-sm text-white/30">拖拽或点击上传</p></>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          </div>
        );

      case 'banana-output': {
        const imageUrls = (config.image_urls as string[]) || [];
        const localPreviews = (config.local_previews as string[]) || [];
        const selModel = (config.model as string) || 'nano-banana-pro';
        const selRatio = (config.aspect_ratio as string) || '1:1';
        const selSize = (config.image_size as string) || '1K';
        const selNum = (config.num_images as number) || 1;
        return (
          <div className="space-y-3">
            {imageUrls.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {imageUrls.map((url: string, i: number) => (
                  <div key={url + i}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', i.toString());
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData('text/plain'));
                      if (from === i) return;
                      const newUrls = [...imageUrls];
                      const newPreviews = [...localPreviews];
                      const [movedUrl] = newUrls.splice(from, 1);
                      newUrls.splice(i, 0, movedUrl);
                      if (newPreviews.length > 0) {
                        const [movedPrev] = newPreviews.splice(from, 1);
                        newPreviews.splice(i, 0, movedPrev);
                      }
                      updateNodeConfig(id, { image_urls: newUrls, local_previews: newPreviews });
                    }}
                    className="nodrag relative w-14 h-14 rounded-lg overflow-hidden border border-white/[0.08] group shrink-0 cursor-grab active:cursor-grabbing hover:border-purple-500/30 transition-colors"
                  >
                    <img src={localPreviews[i] || url} alt="" className="w-full h-full object-cover"
                      onClick={(e) => { e.stopPropagation(); setLightboxImg(localPreviews[i] || url); }} />
                    <span className="absolute top-0 left-0 text-[8px] font-bold bg-purple-500/80 text-white w-4 h-4 flex items-center justify-center rounded-br-lg">{i + 1}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateNodeConfig(id, {
                          image_urls: imageUrls.filter((_: string, j: number) => j !== i),
                          local_previews: localPreviews.filter((_: string, j: number) => j !== i),
                        });
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/90 hover:bg-red-500 text-white rounded-full text-[10px] leading-4 text-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                    >×</button>
                  </div>
                ))}
                {imageUrls.length < 9 && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-lg border border-dashed border-white/[0.1] flex items-center justify-center hover:border-yellow-500/30 transition-colors shrink-0"
                  ><Plus className="w-4 h-4 text-white/20" /></button>
                )}
              </div>
            )}
            {imageUrls.length === 0 && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 9).forEach(f => handleUpload(f, true)); }}
                onClick={() => fileInputRef.current?.click()}
                className="nodrag border-2 border-dashed border-white/[0.06] rounded-xl py-3 flex items-center justify-center gap-2 cursor-pointer hover:border-yellow-500/20 hover:bg-yellow-500/[0.02] transition-all"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                ) : (
                  <><ImagePlus className="w-5 h-5 text-white/15" /><span className="text-xs text-white/25">添加参考图 (1-9)</span></>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const files = Array.from(e.target.files || []); const cur = (config.image_urls as string[]) || []; files.slice(0, 9 - cur.length).forEach(f => handleUpload(f, true)); e.target.value = ''; }} />
            <div>
              <Label>描述</Label>
              <textarea value={(config.prompt as string) || ''} onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
                placeholder="描述你想要生成的画面..."
                className="w-full min-h-[4rem] max-h-[8rem] mt-1.5 resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-yellow-500/50" />
            </div>
            <div>
              <Label>模型</Label>
              <select value={selModel} onChange={(e) => updateNodeConfig(id, { model: e.target.value })} className={`${selectCls} mt-1.5`}>
                {BANANA_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <Label>比例</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {ASPECT_RATIOS.map(r => (
                  <button key={r} onClick={() => updateNodeConfig(id, { aspect_ratio: r })} className={btnPill(selRatio === r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>数量</Label>
                <div className="flex gap-1.5 mt-1.5">
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={() => updateNodeConfig(id, { num_images: n })} className={`${btnPill(selNum === n)} px-3`}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <Label>尺寸</Label>
                <div className="flex gap-1.5 mt-1.5">
                  {IMAGE_SIZES.map(s => (
                    <button key={s} onClick={() => updateNodeConfig(id, { image_size: s })} className={btnPill(selSize === s)}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <RunButton running={running} onClick={handleRun} />
            {nodeData.status === 'done' && (
              resultImages.length > 0 ? (
                <ResultGrid images={resultImages} onLightbox={setLightboxImg} />
              ) : result ? (
                <div className="mt-2 px-2 py-1.5 bg-yellow-500/[0.06] rounded-lg border border-yellow-500/10 text-[10px] text-yellow-400/60">
                  ⚠️ API 返回了结果但未检测到图片 · 响应字段: {Object.keys(result).join(', ')}
                </div>
              ) : null
            )}
          </div>
        );
      }

      case 'image-output': {
        const selRatio = (config.aspect_ratio as string) || '1:1';
        return (
          <div className="space-y-3">
            <Label>提示词</Label>
            <textarea value={(config.prompt as string) || ''} onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
              placeholder="Describe what you want to generate..."
              className="w-full min-h-[5rem] max-h-[10rem] resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-purple-500/50" />
            <textarea value={(config.negative_prompt as string) || ''} onChange={(e) => updateNodeConfig(id, { negative_prompt: e.target.value })}
              placeholder="Negative prompt (optional)..."
              className="w-full min-h-[3rem] max-h-[6rem] resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-white/60 placeholder-white/15 focus:outline-none focus:border-purple-500/50" />
            <div>
              <Label>比例</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {ASPECT_RATIOS.map(r => (
                  <button key={r} onClick={() => updateNodeConfig(id, { aspect_ratio: r })} className={btnPill(selRatio === r)}>{r}</button>
                ))}
              </div>
            </div>
            <ProviderSelector config={config} nodeId={id} taskName="image" providerNames={providerNames} taskDefaults={taskDefaults} />
            <RunButton running={running} onClick={handleRun} />
            {nodeData.status === 'done' && (
              resultImages.length > 0 ? (
                <ResultGrid images={resultImages} onLightbox={setLightboxImg} />
              ) : result ? (
                <div className="mt-2 px-2 py-1.5 bg-yellow-500/[0.06] rounded-lg border border-yellow-500/10 text-[10px] text-yellow-400/60">
                  ⚠️ API 返回了结果但未检测到图片 · 响应字段: {Object.keys(result).join(', ')}
                </div>
              ) : null
            )}
          </div>
        );
      }

      case 'video-output':
        return (
          <div className="space-y-3">
            <Label>提示词</Label>
            <textarea value={(config.prompt as string) || ''} onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
              placeholder="Describe the video you want..."
              className="w-full min-h-[5rem] max-h-[10rem] resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-pink-500/50" />
            <div>
              <Label>时长</Label>
              <div className="flex gap-1.5 mt-1.5">
                {[3,5,10,15].map(d => (
                  <button key={d} onClick={() => updateNodeConfig(id, { duration: d })}
                    className={btnPill((config.duration as number || 5) === d)}>{d}s</button>
                ))}
              </div>
            </div>
            <ProviderSelector config={config} nodeId={id} taskName="video" providerNames={providerNames} taskDefaults={taskDefaults} />
            <RunButton running={running} onClick={handleRun} />
            {nodeData.status === 'done' && result?.video_url && (
              <div className="space-y-2">
                <video src={result.video_url as string} controls className="w-full rounded-lg" />
                <button onClick={() => setLightboxImg(result.video_url as string)}
                  className="w-full text-center text-[10px] text-white/30 hover:text-white/50 py-1 rounded-lg hover:bg-white/[0.03] transition-all">
                  🔗 在新窗口打开
                </button>
              </div>
            )}
          </div>
        );

      case 'script-output':
        return (
          <div className="space-y-3">
            <div>
              <Label>主题</Label>
              <input type="text" value={(config.topic as string) || ''} onChange={(e) => updateNodeConfig(id, { topic: e.target.value })}
                placeholder="Video topic..." className={`${inputCls} mt-1.5`} />
            </div>
            <div>
              <Label>风格</Label>
              <div className="flex gap-1.5 mt-1.5">
                {['commercial','cinematic','social'].map(s => (
                  <button key={s} onClick={() => updateNodeConfig(id, { style: s })}
                    className={btnPill((config.style as string || 'commercial') === s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>长度</Label>
              <div className="flex gap-1.5 mt-1.5">
                {[{v:'short',l:'3-5'},{v:'medium',l:'8-12'},{v:'long',l:'15-25'}].map(o => (
                  <button key={o.v} onClick={() => updateNodeConfig(id, { length: o.v })}
                    className={btnPill((config.length as string || 'short') === o.v)}>{o.l} shots</button>
                ))}
              </div>
            </div>
            <ProviderSelector config={config} nodeId={id} taskName="script" providerNames={providerNames} taskDefaults={taskDefaults} />
            <RunButton running={running} onClick={handleRun} />
            {nodeData.status === 'done' && result?.scenes && Array.isArray(result.scenes) && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-[10px] text-white/25">{(result.scenes as any[]).length} 个分镜</span>
                </div>
                {(result.scenes as any[]).map((s: any, idx: number) => (
                  <div key={s.scene_num} className="px-2.5 py-2 bg-white/[0.03] rounded-lg border border-white/[0.05] hover:border-white/[0.08] transition-all">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-400/70 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                      <span className="text-[10px] text-white/25">{s.shot_type} · {s.duration}s</span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-1 line-clamp-2 leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'audio-output': {
        const selAudioModel = (config.model as string) || '';
        return (
          <div className="space-y-3">
            <Label>文本</Label>
            <textarea value={(config.text as string) || ''} onChange={(e) => updateNodeConfig(id, { text: e.target.value })}
              placeholder="Enter text for TTS..."
              className="w-full min-h-[5rem] max-h-[10rem] resize-y overflow-y-auto custom-scrollbar px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
            <div>
              <Label>模型</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {AUDIO_MODELS.map(m => (
                  <button key={m.value} onClick={() => updateNodeConfig(id, { model: m.value })}
                    className={btnPill(selAudioModel === m.value, 'purple')}>{m.label}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>声音</Label>
              <div className="flex gap-1.5 mt-1.5">
                {['default','male','female'].map(v => (
                  <button key={v} onClick={() => updateNodeConfig(id, { voice: v })}
                    className={btnPill((config.voice as string || 'default') === v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ProviderSelector config={config} nodeId={id} taskName="audio" providerNames={providerNames} taskDefaults={taskDefaults} />
            <RunButton running={running} onClick={handleRun} />
            {nodeData.status === 'done' && result?.audio_url && (
              <div className="space-y-2">
                <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <span className="text-sm">🔊</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/50 font-medium">音频生成完成</p>
                      <p className="text-[10px] text-white/25">点击播放</p>
                    </div>
                  </div>
                  <audio src={result.audio_url as string} controls className="w-full" />
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'enhance':
        return (
          <div className="space-y-3">
            <div>
              <Label>图片 URL</Label>
              <input type="text" value={(config.image_url as string) || ''} onChange={(e) => updateNodeConfig(id, { image_url: e.target.value })}
                placeholder="Enter image URL..." className={`${inputCls} mt-1.5`} />
            </div>
            <div>
              <Label>模式</Label>
              <div className="flex gap-1.5 mt-1.5">
                {['upscale','denoise','sharpen'].map(m => (
                  <button key={m} onClick={() => updateNodeConfig(id, { mode: m })}
                    className={btnPill((config.mode as string || 'upscale') === m)}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
                ))}
              </div>
            </div>
            <ProviderSelector config={config} nodeId={id} taskName="enhance" providerNames={providerNames} taskDefaults={taskDefaults} />
            <RunButton running={running} onClick={handleRun} />
          </div>
        );

      default:
        return <p className="text-xs text-white/30">Unknown node type</p>;
    }
  };

  return (
    <>
      <div
        ref={nodeRef}
        className={`min-w-[320px] max-w-[480px] rounded-2xl border transition-all duration-300
          ${statusBorders[nodeData.status]}
          ${selected ? 'ring-2 ring-purple-500/60 ring-offset-2 ring-offset-[#0a0a14]' : ''}
          bg-[#13131f]/95 backdrop-blur-xl shadow-xl`}
        onClick={() => selectNode(id)}
        onPointerDown={handlePointerDown}
        onMouseMove={handleMouseMove}
      >
        {/* 节点拖拽缩放 — 四角手柄 */}
        <NodeResizer
          isVisible={selected}
          minWidth={280}
          minHeight={120}
          handleStyle={{
            width: 16, height: 16,
            background: 'rgba(168,85,247,0.7)',
            border: '2px solid rgba(168,85,247,0.5)',
            borderRadius: 4, zIndex: 20,
          }}
          lineStyle={{ borderWidth: 3, borderColor: 'rgba(168,85,247,0.25)' }}
        />
        {/* Running progress bar */}
        {nodeData.status === 'running' && <RunningBar />}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-t-[15px]" style={{ background: `${defaults.color}12` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ background: defaults.color, boxShadow: `0 0 8px ${defaults.color}40` }} />
            <span className="text-[13px] font-semibold text-white/80">{nodeData.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {statusIcons[nodeData.status]}
            <button onClick={(e) => { e.stopPropagation(); removeNode(id); }}
              className="p-1 rounded-md hover:bg-red-500/15 text-white/20 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {/* Data flow indicator */}
          {(config._sourceMap as any) && Object.keys(config._sourceMap as any).length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-purple-500/[0.06] rounded-lg border border-purple-500/10">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-[10px] text-purple-400/60">数据流已连接</span>
            </div>
          )}
          {renderBody()}
        </div>

        {/* Error */}
        {nodeData.status === 'error' && result?.error && (
          <div className="mx-4 mb-3 px-3 py-2 bg-red-500/[0.06] rounded-lg border border-red-500/15">
            <p className="text-xs text-red-400/80">{result?.error}</p>
          </div>
        )}

        {/* Handles — 用 left/right 锚定到节点边缘，避免 transform 定位导致的 hover 偏移 */}
        <Handle type="target" position={Position.Left}
          className="!w-3.5 !h-3.5 !left-[-7px] !top-1/2 !-translate-y-1/2 !bg-[#13131f] !border-2 !border-purple-500/60 !rounded-full" />
        <Handle type="source" position={Position.Right}
          className="!w-3.5 !h-3.5 !right-[-7px] !top-1/2 !-translate-y-1/2 !bg-[#13131f] !border-2 !border-purple-500/60 !rounded-full" />
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </>
  );
});

CustomNode.displayName = 'CustomNode';
