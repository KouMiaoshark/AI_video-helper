/**
 * 海螺 Clone - AI 生图页面
 * 图片网格布局 + 右侧详情面板 + 输入状态不丢失
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Download, Trash2, Image as ImageIcon, Sparkles, ChevronDown, Plus, Hash, Wand2, GripVertical, Maximize2, Star, X, Copy, Check, Info } from 'lucide-react';

interface GenParams {
  prompt: string;
  model: string;
  style: string;
  imageSize: string;
  aspectRatio: string;
  numImages: number;
  refImages?: string[];
}

interface GeneratedImage {
  id: string;
  url: string;
  params: GenParams;
  timestamp: number;
  pending?: boolean;
}

const MODELS = [
  { value: 'nano-banana-pro', label: 'Banana Pro', desc: '高质量', emoji: '🎨' },
  { value: 'nano-banana-2', label: 'Banana 2', desc: '快速', emoji: '⚡' },
];

const SIZES = [
  { value: '1K', label: '1K', desc: '快速' },
  { value: '2K', label: '2K', desc: '标准' },
  { value: '4K', label: '4K', desc: '高清' },
];

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1', desc: '正方形' },
  { value: '16:9', label: '16:9', desc: '横屏' },
  { value: '9:16', label: '9:16', desc: '竖屏' },
  { value: '4:3', label: '4:3', desc: '经典' },
  { value: '3:4', label: '3:4', desc: '竖版' },
  { value: '3:2', label: '3:2', desc: '照片' },
  { value: '2:3', label: '2:3', desc: '竖照' },
  { value: '4:5', label: '4:5', desc: '社交' },
  { value: '5:4', label: '5:4', desc: '宽幅' },
  { value: '21:9', label: '21:9', desc: '超宽' },
];

const STYLES = [
  { value: '', label: '默认', emoji: '✨' },
  { value: '皮克斯风格, 3D渲染, 温暖色调, ', label: '皮克斯', emoji: '🧸' },
  { value: '吉卜力风格, 手绘动画, 柔和色彩, 梦幻氛围, ', label: '吉卜力', emoji: '🌸' },
  { value: '动漫风格, 精细线条, 高饱和度, ', label: '动漫', emoji: '🎌' },
  { value: '水彩画风格, 柔和渐变, 艺术感, ', label: '水彩', emoji: '🎨' },
  { value: '赛博朋克, 霓虹灯, 未来都市, 雨夜, ', label: '赛博朋克', emoji: '🌆' },
  { value: '中国水墨画, 留白, 写意, 古典韵味, ', label: '水墨', emoji: '🖌️' },
  { value: '像素艺术, 复古游戏, 8-bit, ', label: '像素', emoji: '👾' },
  { value: '油画风格, 厚涂, 光影丰富, 古典, ', label: '油画', emoji: '🖼️' },
];

const HOT_PROMPTS = [
  '一只穿宇航服的柴犬，站在月球上看地球',
  '赛博朋克风格的东京街头夜景，霓虹灯倒映在雨水中',
  '中国古风水墨山水画，云雾缭绕的山峰',
  '一只橘猫坐在咖啡馆窗边看书，阳光透过玻璃洒进来',
];

const generateId = () => Math.random().toString(36).slice(2, 10);

export function ChatImagePage({ active: _active }: { active: boolean }) {
  // --- 图片列表（扁平，按生成时间排列） ---
  const [images, setImages] = useState<GeneratedImage[]>(() => {
    try {
      const saved = localStorage.getItem('gallery_images');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // --- 输入状态（不随发送清空） ---
  const [input, setInput] = useState('');
  const [model, setModel] = useState('nano-banana-pro');
  const [style, setStyle] = useState('');
  const [numImages, setNumImages] = useState(1);
  const [imageSize, setImageSize] = useState('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [refImages, setRefImages] = useState<string[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);

  // --- UI 状态 ---
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showCountPicker, setShowCountPicker] = useState(false);
  const [showResPicker, setShowResPicker] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // --- 详情面板 ---
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // --- 参考图预览灯箱 ---
  const [refPreviewUrl, setRefPreviewUrl] = useState<string | null>(null);

  // --- 收藏 ---
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const gridEndRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const stylePickerRef = useRef<HTMLDivElement>(null);
  const countPickerRef = useRef<HTMLDivElement>(null);
  const resPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当前详情
  const detailImg = detailId ? images.find(img => img.id === detailId) : null;

  // --- 持久化 ---
  useEffect(() => {
    try { localStorage.setItem('gallery_images', JSON.stringify(images)); } catch {}
  }, [images]);

  // --- 收藏 ---
  useEffect(() => {
    fetch('/api/favorites').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.favorites) setFavorites(new Set(d.favorites));
    }).catch(() => {});
  }, []);

  const toggleFavorite = async (imgUrl: string) => {
    const filename = imgUrl.split('/').pop() || imgUrl;
    const next = new Set(favorites);
    if (next.has(filename)) { next.delete(filename); } else { next.add(filename); }
    setFavorites(next);
    try {
      await fetch('/api/favorites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: Array.from(next) }),
      });
    } catch {}
  };

  // --- 复制/下载/复用 ---
  const copyPrompt = () => {
    if (!detailImg) return;
    navigator.clipboard.writeText(detailImg.params.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadImage = async (url: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  const reuseParams = (params: GenParams) => {
    setModel(params.model);
    setStyle(STYLES.find(s => s.label === params.style)?.value ?? '');
    setImageSize(params.imageSize);
    setAspectRatio(params.aspectRatio);
    setNumImages(params.numImages);
    setInput(params.prompt);
    // 复用参考图（顺序也保留）
    const refs = params.refImages ?? [];
    if (refs.length > 0) {
      setRefImages([...refs]);
      setRefPreviews([...refs]); // 服务端 URL 直接当 preview
    }
    setDetailId(null);
  };

  // --- 自动滚动到底部 ---
  useEffect(() => {
    gridEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [images.length]);

  // --- 关闭 picker ---
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
      if (stylePickerRef.current && !stylePickerRef.current.contains(e.target as Node)) setShowStylePicker(false);
      if (countPickerRef.current && !countPickerRef.current.contains(e.target as Node)) setShowCountPicker(false);
      if (resPickerRef.current && !resPickerRef.current.contains(e.target as Node)) setShowResPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // --- 参考图上传 ---
  const handleUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const remaining = 14 - refImages.length;
    if (remaining <= 0) return;
    setUploading(true);
    for (const file of fileArr.slice(0, remaining)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', body: formData });
        if (resp.ok) {
          const data = await resp.json();
          setRefImages(prev => [...prev, data.url]);
          setRefPreviews(prev => [...prev, URL.createObjectURL(file)]);
        }
      } catch {}
    }
    setUploading(false);
  };

  const removeRefImage = (index: number) => {
    setRefImages(prev => prev.filter((_, i) => i !== index));
    setRefPreviews(prev => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // --- 拖拽排序 ---
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== index) setDragOverIndex(index);
  }, [dragIndex]);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setRefImages(prev => { const n = [...prev]; const [m] = n.splice(dragIndex, 1); n.splice(dragOverIndex, 0, m); return n; });
      setRefPreviews(prev => { const n = [...prev]; const [m] = n.splice(dragIndex, 1); n.splice(dragOverIndex, 0, m); return n; });
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex]);

  // --- 发送（不清空输入） ---
  const handleSend = async (quickPrompt?: string) => {
    const prompt = quickPrompt || input.trim();
    if (!prompt || generating) return;

    const fullPrompt = style + prompt;
    const currentRefImages = [...refImages];
    const currentModel = model;
    const currentStyle = style;
    const currentImageSize = imageSize;
    const currentAspectRatio = aspectRatio;
    const currentNumImages = numImages;
    const styleLabel = STYLES.find(s => s.value === currentStyle)?.label || '默认';

    // 1) 先在网格里插入 placeholder
    const placeholderIds: string[] = [];
    const placeholders: GeneratedImage[] = [];
    for (let i = 0; i < currentNumImages; i++) {
      const id = generateId();
      placeholderIds.push(id);
      placeholders.push({
        id,
        url: '',
        pending: true,
        params: {
          prompt, model: currentModel, style: styleLabel,
          imageSize: currentImageSize, aspectRatio: currentAspectRatio,
          numImages: currentNumImages, refImages: currentRefImages,
        },
        timestamp: Date.now(),
      });
    }
    setImages(prev => [...prev, ...placeholders]);
    setGenerating(true);

    try {
      const buildBody = (): Record<string, unknown> => {
        const body: Record<string, unknown> = {
          prompt: fullPrompt,
          model: currentModel,
          width: 1024,
          height: 1024,
          num_images: 1, // 固定单次 1 张，前端并行请求实现批量
          image_size: currentImageSize,
          aspect_ratio: currentAspectRatio,
        };
        if (currentRefImages.length > 0) body.image_urls = currentRefImages;
        return body;
      };

      // 并行申请，避免后端/模型忽略 num_images 导致只能返回 1 张
      const responses = await Promise.allSettled(
        Array.from({ length: currentNumImages }, async () => {
          const resp = await fetch('/api/generate/image?provider=bltcy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody()),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || '生成失败');
          }
          const data = await resp.json();
          const imgs: string[] = Array.isArray(data?.images) ? data.images : [];
          return imgs[0] || null;
        })
      );
      const rawImages: string[] = responses
        .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (rawImages.length === 0) {
        const firstRejected = responses.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        throw new Error(firstRejected?.reason?.message || '生成失败');
      }

      // 保存到本地
      const savedImages: string[] = [];
      for (const imgUrl of rawImages) {
        try {
          const saveResp = await fetch('/api/save-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imgUrl, prompt, model: currentModel }),
          });
          if (saveResp.ok) {
            const saveData = await saveResp.json();
            savedImages.push(saveData.local_url);
          } else { savedImages.push(imgUrl); }
        } catch { savedImages.push(imgUrl); }
      }

      const resultImages = savedImages.length > 0 ? savedImages : rawImages;

      // 2) 用真实图片替换 placeholder
      setImages(prev => prev.map(img => {
        const idx = placeholderIds.indexOf(img.id);
        if (idx === -1) return img;
        if (idx < resultImages.length) {
          return {
            ...img,
            url: resultImages[idx],
            pending: false,
          };
        }
        // 多余的 placeholder 删掉
        return null;
      }).filter(Boolean) as GeneratedImage[]);
    } catch (err: any) {
      // 失败时移除 placeholder
      setImages(prev => prev.filter(img => !placeholderIds.includes(img.id)));
      console.error(err);
    } finally { setGenerating(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const currentModelObj = MODELS.find(m => m.value === model);
  const currentStyleObj = STYLES.find(s => s.value === style);

  return (
    <div className="flex-1 flex bg-[#0a0a12] relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* ====== 左侧：图片网格 + 输入 ====== */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0">
        {/* 顶栏 */}
        <div className="h-14 border-b border-white/[0.04] flex items-center px-5 gap-3 backdrop-blur-xl bg-white/[0.02] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Wand2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white/90">我要创作</span>
            {images.length > 0 && <span className="text-[11px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full">{images.length} 张</span>}
          </div>
          <div className="flex-1" />
          <button onClick={() => { setImages([]); setDetailId(null); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 图片区域 */}
        <div className="flex-1 overflow-y-auto">
          {images.length === 0 ? (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center px-8">
              <div className="relative mb-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/[0.06] flex items-center justify-center">
                  <Sparkles className="w-9 h-9 text-purple-400/60" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 animate-pulse" />
              </div>
              <h2 className="text-xl font-semibold text-white/80 mb-2">用文字创造视觉</h2>
              <p className="text-sm text-white/30 mb-10 text-center max-w-xs">
                描述你的想象，AI 为你生成精美图片<br />
                支持上传参考图，让创作更精准
              </p>
              <div className="w-full max-w-md space-y-2">
                <p className="text-[11px] text-white/20 uppercase tracking-wider mb-3 text-center">灵感推荐</p>
                {HOT_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => handleSend(p)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.08] transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-base flex-shrink-0">{['🚀', '🌃', '🏔️', '🐱'][i]}</span>
                      <span className="text-[13px] text-white/40 group-hover:text-white/60 transition-colors line-clamp-1">{p}</span>
                      <Send className="w-3 h-3 text-white/10 group-hover:text-purple-400/50 ml-auto flex-shrink-0 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 图片网格 - 左到右，上到下 */
            <div className="p-5">
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
                {images.map((img) => {
                  if (img.pending) {
                    return (
                      <div key={img.id}
                        className="break-inside-avoid mb-4 relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                        <div className="aspect-square bg-white/[0.03] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[11px] text-white/20">生成中...</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const filename = img.url.split('/').pop() || img.url;
                  const isFav = favorites.has(filename);
                  const isActive = detailId === img.id;
                  return (
                    <div key={img.id}
                      className={`break-inside-avoid mb-4 relative group rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                        isActive
                          ? 'border-purple-500/40 ring-2 ring-purple-500/20'
                          : 'border-white/[0.06] hover:border-white/[0.12]'
                      } bg-black`}
                      onClick={() => setDetailId(isActive ? null : img.id)}
                    >
                      <div className="aspect-square bg-black flex items-center justify-center">
                        <img src={img.url} alt="Generated"
                          className="w-full h-full object-contain bg-black transition-transform duration-500 group-hover:scale-[1.03]"
                          loading="lazy" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="absolute top-3 right-3 flex gap-2">
                          <button onClick={e => { e.stopPropagation(); toggleFavorite(img.url); }}
                            className={`p-2 backdrop-blur-md rounded-xl transition-all border ${
                              isFav ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                                : 'bg-white/10 border-white/10 text-white/50 hover:text-yellow-400 hover:bg-yellow-500/10'
                            }`}>
                            <Star className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); downloadImage(img.url); }}
                            className="p-2 bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/20 transition-all border border-white/10">
                            <Download className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>
                        <div className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5">
                          <Info className="w-3 h-3 text-white/40 flex-shrink-0" />
                          <span className="text-[10px] text-white/40 truncate">{img.params.prompt}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {generating && (
                <div className="flex items-center gap-3 py-4 px-2">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[13px] text-white/40">正在创作中...</span>
                </div>
              )}
              <div ref={gridEndRef} />
            </div>
          )}
        </div>

        {/* ========== 底部输入区 ========== */}
        <div className="border-t border-white/[0.04] backdrop-blur-xl bg-white/[0.01] flex-shrink-0">
          {refImages.length > 0 && (
            <div className="flex gap-3 px-6 pt-5 pb-2 overflow-x-auto">
              {refImages.map((url, i) => (
                <div key={i} draggable
                  onDragStart={e => handleDragStart(e, i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`relative group flex-shrink-0 cursor-grab active:cursor-grabbing transition-transform ${
                    dragIndex === i ? 'opacity-50 scale-95' : ''} ${dragOverIndex === i ? 'scale-110' : ''}`}>
                  <img src={refPreviews[i] || url} alt={`Ref ${i + 1}`}
                    className="w-[140px] h-[140px] object-cover rounded-2xl border-2 border-white/[0.08] transition-all group-hover:border-purple-500/30 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setRefPreviewUrl(refPreviews[i] || url); }} />
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-70 transition-opacity">
                    <GripVertical className="w-6 h-6 text-white drop-shadow-lg" />
                  </div>
                  <span className="absolute -top-2 -left-2 text-[11px] font-bold bg-purple-500/80 text-white w-6 h-6 rounded-full flex items-center justify-center">{i + 1}</span>
                  <button onClick={() => removeRefImage(i)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 text-white rounded-full text-[12px] leading-6 text-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">×</button>
                </div>
              ))}
              {refImages.length < 14 && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-[140px] h-[140px] flex-shrink-0 border-2 border-dashed border-white/[0.08] rounded-2xl flex items-center justify-center hover:border-purple-500/30 hover:bg-purple-500/5 transition-all">
                  <Plus className="w-8 h-8 text-white/20" />
                </button>
              )}
            </div>
          )}

          {/* 工具栏 */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all text-[15px] font-medium">
              <ImageIcon className="w-5 h-5 text-white/40" />
              <span className="text-white/50">参考图</span>
              {refImages.length > 0 && <span className="text-purple-400/80 font-semibold">{refImages.length}/14</span>}
              {uploading && <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />}
            </button>

            <div ref={modelPickerRef} className="relative">
              <button onClick={() => { setShowModelPicker(!showModelPicker); setShowStylePicker(false); setShowCountPicker(false); setShowResPicker(false); }}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all text-[15px] font-medium">
                <span className="text-lg">{currentModelObj?.emoji}</span>
                <span className="text-white/50">{currentModelObj?.label}</span>
                <ChevronDown className="w-5 h-5 text-white/25" />
              </button>
              {showModelPicker && (
                <div className="absolute bottom-full mb-3 left-0 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[200px]">
                  {MODELS.map(m => (
                    <button key={m.value} onClick={() => { setModel(m.value); setShowModelPicker(false); }}
                      className={`w-full px-4 py-3.5 text-left text-[14px] hover:bg-white/[0.04] transition-all flex items-center gap-3 ${
                        model === m.value ? 'text-purple-400 bg-purple-500/10' : 'text-white/60'}`}>
                      <span className="text-lg">{m.emoji}</span><span>{m.label}</span><span className="text-white/20 ml-auto text-[12px]">{m.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div ref={stylePickerRef} className="relative">
              <button onClick={() => { setShowStylePicker(!showStylePicker); setShowModelPicker(false); setShowCountPicker(false); setShowResPicker(false); }}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all text-[15px] font-medium">
                <span className="text-lg">{currentStyleObj?.emoji}</span>
                <span className="text-white/50">{currentStyleObj?.label || '默认'}</span>
                <ChevronDown className="w-5 h-5 text-white/25" />
              </button>
              {showStylePicker && (
                <div className="absolute bottom-full mb-3 left-0 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[180px] max-h-72 overflow-y-auto">
                  {STYLES.map(s => (
                    <button key={s.label} onClick={() => { setStyle(s.value); setShowStylePicker(false); }}
                      className={`w-full px-4 py-3 text-left text-[14px] hover:bg-white/[0.04] transition-all flex items-center gap-2.5 ${
                        style === s.value ? 'text-purple-400 bg-purple-500/10' : 'text-white/60'}`}>
                      <span className="text-lg">{s.emoji}</span><span>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1" />

            <div ref={resPickerRef} className="relative">
              <button onClick={() => { setShowResPicker(!showResPicker); setShowModelPicker(false); setShowStylePicker(false); setShowCountPicker(false); }}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all text-[15px] font-medium">
                <Maximize2 className="w-5 h-5 text-white/35" />
                <span className="text-white/50">{imageSize} · {aspectRatio}</span>
                <ChevronDown className="w-5 h-5 text-white/25" />
              </button>
              {showResPicker && (
                <div className="absolute bottom-full mb-3 right-0 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[220px]">
                  <div className="px-3 pt-3 pb-1.5">
                    <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1.5">分辨率</p>
                    <div className="flex gap-1.5">
                      {SIZES.map(s => (
                        <button key={s.value} onClick={() => setImageSize(s.value)}
                          className={`flex-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                            imageSize === s.value ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                              : 'bg-white/[0.03] text-white/40 border border-transparent hover:bg-white/[0.06] hover:text-white/60'
                          }`}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mx-3 border-t border-white/[0.06]" />
                  <div className="px-3 pt-2 pb-3">
                    <p className="text-[10px] text-white/20 uppercase tracking-wider mb-1.5">比例</p>
                    <div className="grid grid-cols-5 gap-1">
                      {ASPECT_RATIOS.map(a => (
                        <button key={a.value} onClick={() => setAspectRatio(a.value)}
                          className={`px-2 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                            aspectRatio === a.value ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                              : 'bg-white/[0.03] text-white/35 border border-transparent hover:bg-white/[0.06] hover:text-white/50'
                          }`}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={countPickerRef} className="relative">
              <button onClick={() => { setShowCountPicker(!showCountPicker); setShowModelPicker(false); setShowStylePicker(false); setShowResPicker(false); }}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all text-[15px] font-medium">
                <Hash className="w-5 h-5 text-white/35" />
                <span className="text-white/50">{numImages}张</span>
                <ChevronDown className="w-5 h-5 text-white/25" />
              </button>
              {showCountPicker && (
                <div className="absolute bottom-full mb-3 right-0 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50">
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <button key={n} onClick={() => { setNumImages(n); setShowCountPicker(false); }}
                      className={`w-full px-6 py-2.5 text-left text-[14px] hover:bg-white/[0.04] transition-all ${
                        numImages === n ? 'text-purple-400 bg-purple-500/10' : 'text-white/60'}`}>{n} 张</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 输入框 */}
          <div className="px-6 pb-6 pt-2">
            <div className={`relative rounded-3xl border transition-all duration-300 ${
              inputFocused ? 'bg-white/[0.05] border-purple-500/20 shadow-[0_0_30px_rgba(139,92,246,0.08)]' : 'bg-white/[0.03] border-white/[0.05]'
            }`}>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                placeholder="描述你想生成的画面..." rows={2}
                className="w-full px-6 pt-4 pb-2 bg-transparent text-[17px] text-white/80 placeholder-white/20 resize-y outline-none leading-relaxed rounded-3xl block"
                style={{ minHeight: '80px', maxHeight: '400px' }} />
              <div className="flex justify-end px-4 pb-3">
                <button onClick={() => handleSend()} disabled={!input.trim() || generating}
                  className={`px-7 py-3.5 rounded-2xl text-[17px] font-medium transition-all duration-300 flex items-center gap-2.5 ${
                    input.trim() && !generating
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:brightness-110'
                      : 'bg-white/[0.04] text-white/20 cursor-not-allowed'
                  }`}>
                  <Send className="w-5 h-5" />
                  <span>生成</span>
                </button>
              </div>
            </div>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {/* ====== 右侧详情面板 ====== */}
      {detailImg && (() => {
        try {
        return (
      <div className="fixed top-0 right-0 bottom-0 w-[340px] z-50 border-l border-white/[0.04] bg-[#0d0d18] flex flex-col overflow-y-auto">
          <>
            <div className="h-14 border-b border-white/[0.04] flex items-center px-4 gap-3 flex-shrink-0">
              <Info className="w-4 h-4 text-purple-400/60" />
              <span className="text-sm font-semibold text-white/80">生成详情</span>
              <div className="flex-1" />
              <button onClick={() => setDetailId(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                <img src={detailImg.url} alt="Preview" className="w-full h-auto object-cover" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => downloadImage(detailImg.url)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[13px] text-white/60 hover:text-white/80 transition-all">
                  <Download className="w-4 h-4" /><span>下载</span>
                </button>
                <button onClick={() => toggleFavorite(detailImg.url)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] transition-all ${
                    favorites.has(detailImg.url.split('/').pop() || '')
                      ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-white/60 hover:text-white/80'
                  }`}>
                  <Star className="w-4 h-4" fill={favorites.has(detailImg.url.split('/').pop() || '') ? 'currentColor' : 'none'} />
                  <span>收藏</span>
                </button>
                <button onClick={() => reuseParams(detailImg.params)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/15 text-[13px] text-purple-400 hover:text-purple-300 transition-all">
                  <Wand2 className="w-4 h-4" /><span>复用</span>
                </button>
              </div>

              {/* 变体 + 高清修复 */}
              <div className="flex gap-2">
                <button onClick={() => {
                  // 变体：以当前图片为参考图，保持相同 prompt
                  const refs = [detailImg.url];
                  reuseParams({ ...detailImg.params, refImages: refs });
                }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/15 text-[13px] text-cyan-400 hover:text-cyan-300 transition-all">
                  <Sparkles className="w-4 h-4" /><span>生成变体</span>
                </button>
                <button onClick={async () => {
                  // 高清修复：调用 enhance API
                  try {
                    const resp = await fetch('/api/generate/enhance?provider=siliconflow', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ image_url: detailImg.url, mode: 'upscale', scale: 2 }),
                    });
                    if (resp.ok) {
                      const data = await resp.json();
                      if (data.image_url) {
                        // 保存到资产
                        await fetch('/api/save-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ image_url: data.image_url, prompt: `[高清修复] ${detailImg.params.prompt}`, model: 'upscale' }),
                        });
                        alert('高清修复完成！已保存到资产页面');
                      }
                    } else {
                      alert('高清修复失败：请检查 enhance Provider 配置');
                    }
                  } catch { alert('高清修复失败：网络错误'); }
                }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/15 text-[13px] text-emerald-400 hover:text-emerald-300 transition-all">
                  <Maximize2 className="w-4 h-4" /><span>高清修复</span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium">提示词</p>
                  <button onClick={copyPrompt}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                      copied ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.04] text-white/40 hover:text-white/60 hover:bg-white/[0.06]'
                    }`}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? '已复制' : '复制'}</span>
                  </button>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                  <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{detailImg.params.prompt}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-2">生成参数</p>
                <div className="space-y-2">
                  <ParamRow label="模型" value={MODELS.find(m => m.value === detailImg.params.model)?.label || detailImg.params.model}
                    emoji={MODELS.find(m => m.value === detailImg.params.model)?.emoji} />
                  <ParamRow label="风格" value={detailImg.params.style} emoji={STYLES.find(s => s.label === detailImg.params.style)?.emoji} />
                  <ParamRow label="分辨率" value={detailImg.params.imageSize} />
                  <ParamRow label="比例" value={detailImg.params.aspectRatio} />
                  <ParamRow label="数量" value={`${detailImg.params.numImages} 张`} />
                  {!!detailImg.params.refImages?.length && <ParamRow label="参考图" value={`${detailImg.params.refImages.length} 张`} />}
                </div>
                {/* 参考图缩略图 */}
                {!!detailImg.params.refImages?.length && (
                  <div className="mt-3">
                    <p className="text-[11px] text-white/30 uppercase tracking-wider font-medium mb-2">参考图</p>
                    <div className="grid grid-cols-3 gap-2">
                      {detailImg.params.refImages!.map((url, i) => (
                        <div key={i} className="rounded-xl overflow-hidden border border-white/[0.06] cursor-pointer hover:border-purple-500/30 transition-all"
                          onClick={() => setRefPreviewUrl(url)}>
                          <img src={url} alt={`Ref ${i + 1}`} className="w-full aspect-video object-contain bg-black/50" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
      </div>
        );
        } catch(err) {
          console.error('Detail panel error:', err);
          setDetailId(null);
          return null;
        }
      })()}

      {/* 参考图预览灯箱 */}
      {refPreviewUrl && (
        <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer"
          onClick={() => setRefPreviewUrl(null)}>
          <img src={refPreviewUrl} alt="Ref Preview" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function ParamRow({ label, value, emoji }: { label: string; value: string; emoji?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <span className="text-[12px] text-white/35">{label}</span>
      <span className="text-[12px] text-white/60 flex items-center gap-1.5">
        {emoji && <span>{emoji}</span>}<span>{value}</span>
      </span>
    </div>
  );
}
