/**
 * 右侧属性面板 - 配置选中节点的参数
 */

import { useWorkflowStore, type NodeData } from '../store/workflow';
import { api } from '../api/client';
import { X, Play, Settings, ImagePlus, Plus, FolderOpen, Star } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

// 需要运行的节点类型
const runnableTypes = ['image-output', 'video-output', 'script-output', 'enhance', 'audio-output', 'banana-output'];

// 节点类型 → 后端任务名的映射
const nodeTypeToTask: Record<string, string> = {
  'image-output': 'image',
  'video-output': 'video',
  'script-output': 'script',
  'enhance': 'enhance',
  'audio-output': 'audio',
  'banana-output': 'image',
};

// Banana 模型列表（Bltcy.ai 官方模型名）
const BANANA_MODELS = [
  { value: 'nano-banana-2', label: 'Nano Banana 2' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro' },
];

export function PropertyPanel() {
  const { nodes, selectedNodeId, selectNode, updateNodeConfig, updateNodeStatus } = useWorkflowStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerTab, setAssetPickerTab] = useState<'all' | 'favorites'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 资产列表
  const [assets, setAssets] = useState<Array<{ filename: string; url: string }>>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const loadAssets = async () => {
    try {
      const resp = await fetch('/api/assets');
      if (resp.ok) {
        const data = await resp.json();
        setAssets((data.assets || []).filter((a: any) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a.filename)));
      }
    } catch {}
  };

  const loadFavorites = async () => {
    try {
      const resp = await fetch('/api/favorites');
      if (resp.ok) {
        const data = await resp.json();
        setFavorites(new Set(data.favorites || []));
      }
    } catch {}
  };

  useEffect(() => { loadAssets(); loadFavorites(); }, []);

  const handleSelectAsset = (url: string) => {
    updateNodeConfig(selectedNodeId!, { url, filename: url.split('/').pop() });
    setAssetPickerOpen(false);
  };

  const filteredAssets = assetPickerTab === 'favorites'
    ? assets.filter(a => favorites.has(a.filename))
    : assets;

  // 加载 Provider 列表 + 任务默认 Provider
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [taskDefaults, setTaskDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getRawConfig().then((data) => {
      setProviderNames(Object.keys(data.providers || {}));
      setTaskDefaults(data.defaults || {});
    }).catch(() => {});
  }, [selectedNodeId]);

  if (!selectedNode) {
    return (
      <div className="w-72 bg-gray-900/80 border-l border-gray-800 flex items-center justify-center">
        <div className="text-center text-gray-500 p-6">
          <Settings className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a node</p>
          <p className="text-xs mt-1">Configure parameters and run</p>
        </div>
      </div>
    );
  }

  const nodeData = selectedNode.data as unknown as NodeData;
  const config = nodeData.config as Record<string, unknown>;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      updateNodeConfig(selectedNodeId!, {
        url: result.url,
        filename: result.filename,
        localPreview: URL.createObjectURL(file),
      });
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleMultiFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      const currentUrls = (config.image_urls as string[]) || [];
      const currentPreviews = (config.local_previews as string[]) || [];
      updateNodeConfig(selectedNodeId!, {
        image_urls: [...currentUrls, result.url],
        local_previews: [...currentPreviews, URL.createObjectURL(file)],
      });
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    updateNodeStatus(selectedNodeId!, 'running');

    try {
      let result;
      const selectedProvider = config.provider as string || undefined;

      switch (nodeData.type) {
        case 'image-output':
          result = await api.generateImage({
            prompt: (config.prompt as string) || 'A beautiful landscape',
            negative_prompt: (config.negative_prompt as string) || '',
            width: (config.width as number) || 1024,
            height: (config.height as number) || 1024,
            model: config.model as string || undefined,
            provider: selectedProvider,
          });
          break;

        case 'banana-output': {
          const bananaProvider = selectedProvider || 'bltcy';
          const imageUrls = (config.image_urls as string[]) || [];
          result = await api.generateImage({
            prompt: (config.prompt as string) || 'A beautiful landscape',
            negative_prompt: '',
            width: 1024,
            height: 1024,
            num_images: (config.num_images as number) || 1,
            model: (config.model as string) || 'nano-banana-pro',
            image_urls: imageUrls.length > 0 ? imageUrls : undefined,
            provider: bananaProvider,
          });
          break;
        }

        case 'script-output':
          result = await api.generateScript({
            topic: (config.topic as string) || 'Product Ad',
            style: (config.style as string) || 'commercial',
            length: (config.length as string) || 'short',
            model: config.model as string || undefined,
            provider: selectedProvider,
          });
          break;

        case 'enhance':
          result = await api.enhanceImage({
            image_url: (config.image_url as string) || '',
            mode: (config.mode as string) || 'upscale',
            scale: (config.scale as number) || 2,
            provider: selectedProvider,
          });
          break;

        case 'video-output':
          result = await api.generateVideo({
            prompt: (config.prompt as string) || '',
            duration: (config.duration as number) || 5,
            model: config.model as string || undefined,
            provider: selectedProvider,
          });
          break;

        case 'audio-output':
          result = await api.generateAudio({
            text: (config.text as string) || '',
            voice: (config.voice as string) || 'default',
            model: config.model as string || undefined,
            provider: selectedProvider,
          });
          break;

        default:
          throw new Error(`Unsupported node type: ${nodeData.type}`);
      }

      updateNodeStatus(selectedNodeId!, 'done', result);
    } catch (err: any) {
      updateNodeStatus(selectedNodeId!, 'error', { error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // Provider + Model 选择组件（用于生成类节点，banana 节点除外）
  const renderProviderSelector = () => {
    if (!runnableTypes.includes(nodeData.type)) return null;
    if (nodeData.type === 'banana-output') return null; // Banana 固定 nova-ai
    const taskName = nodeTypeToTask[nodeData.type] || '';
    const defaultProvider = taskDefaults[taskName] || '(none)';
    return (
      <div className="p-3 bg-gray-800/40 rounded-xl border border-gray-700/50 space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">
            Provider
            <span className="ml-2 text-purple-400">
              default: {defaultProvider}
            </span>
          </label>
          <select
            value={(config.provider as string) || ''}
            onChange={(e) => updateNodeConfig(selectedNodeId!, { provider: e.target.value })}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200
              focus:outline-none focus:border-purple-500"
          >
            <option value="">-- Use default ({defaultProvider}) --</option>
            {providerNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Model (override)</label>
          <input
            type="text"
            value={(config.model as string) || ''}
            onChange={(e) => updateNodeConfig(selectedNodeId!, { model: e.target.value })}
            placeholder="Leave empty to use provider default"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg
              text-sm text-gray-200 placeholder-gray-600
              focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 bg-gray-900/80 border-l border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">{nodeData.label}</h3>
        <button
          onClick={() => selectNode(null)}
          className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Config */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Provider/Model selector for generation nodes */}
        {renderProviderSelector()}

        {/* Image Input - Upload */}
        {nodeData.type === 'image-input' && (
          <div className="space-y-2">
            {/* 从资产选择按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => { setAssetPickerTab('all'); setAssetPickerOpen(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-400
                  bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                从资产选择
              </button>
              <button
                onClick={() => { setAssetPickerTab('favorites'); setAssetPickerOpen(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-yellow-400
                  bg-gray-800 hover:bg-yellow-900/20 border border-gray-700 hover:border-yellow-500/30 rounded-lg transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
                从收藏选择
              </button>
            </div>

            <label className="text-xs text-gray-500 block text-center">或上传本地图片</label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed border-gray-700 rounded-xl
                hover:border-purple-500 hover:bg-purple-500/5 transition-all cursor-pointer
                flex flex-col items-center justify-center py-6"
            >
              {config.url ? (
                <div className="space-y-2 text-center px-4">
                  <img
                    src={(config.localPreview as string) || (config.url as string)}
                    alt="Uploaded"
                    className="max-w-full max-h-32 object-contain rounded-lg mx-auto"
                  />
                  <p className="text-xs text-gray-500">{config.filename as string}</p>
                  <p className="text-xs text-purple-400">Click to replace</p>
                </div>
              ) : (
                <>
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                      <p className="text-xs text-gray-500">Uploading...</p>
                    </div>
                  ) : (
                    <>
                      <ImagePlus className="w-8 h-8 text-gray-600 mb-2" />
                      <p className="text-sm text-gray-400">Drop image here</p>
                      <p className="text-xs text-gray-600 mt-1">or click to browse</p>
                    </>
                  )}
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </div>
        )}

        {/* Prompt (for text-input, image-output, video-output) */}
        {(nodeData.type === 'text-input' || nodeData.type === 'image-output' || nodeData.type === 'video-output') && (
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Prompt</label>
            <textarea
              value={(config.prompt as string) || ''}
              onChange={(e) => updateNodeConfig(selectedNodeId!, { prompt: e.target.value })}
              placeholder="Describe what you want to generate..."
              className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                text-sm text-gray-200 placeholder-gray-600 resize-none
                focus:outline-none focus:border-purple-500"
            />
          </div>
        )}

        {/* Image Output extras */}
        {nodeData.type === 'image-output' && (
          <>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Negative Prompt</label>
              <textarea
                value={(config.negative_prompt as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { negative_prompt: e.target.value })}
                placeholder="What you don't want..."
                className="w-full h-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-600 resize-none
                  focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Width</label>
                <select
                  value={(config.width as number) || 1024}
                  onChange={(e) => updateNodeConfig(selectedNodeId!, { width: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
                >
                  <option value={512}>512</option>
                  <option value={768}>768</option>
                  <option value={1024}>1024</option>
                  <option value={1280}>1280</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Height</label>
                <select
                  value={(config.height as number) || 1024}
                  onChange={(e) => updateNodeConfig(selectedNodeId!, { height: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
                >
                  <option value={512}>512</option>
                  <option value={768}>768</option>
                  <option value={1024}>1024</option>
                  <option value={1280}>1280</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Script Output */}
        {nodeData.type === 'script-output' && (
          <>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Topic</label>
              <input
                type="text"
                value={(config.topic as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { topic: e.target.value })}
                placeholder="Video topic, e.g. Smart Home Product Ad"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-600
                  focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Style</label>
              <select
                value={(config.style as string) || 'commercial'}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { style: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
              >
                <option value="commercial">Commercial</option>
                <option value="cinematic">Cinematic</option>
                <option value="social">Social Media</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Length</label>
              <select
                value={(config.length as string) || 'short'}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { length: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
              >
                <option value="short">Short (3-5 shots)</option>
                <option value="medium">Medium (8-12 shots)</option>
                <option value="long">Long (15-25 shots)</option>
              </select>
            </div>
          </>
        )}

        {/* Video Output extras */}
        {nodeData.type === 'video-output' && (
          <>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Duration (seconds)</label>
              <select
                value={(config.duration as number) || 5}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { duration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
              >
                <option value={3}>3s</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
              </select>
            </div>
          </>
        )}

        {/* Audio Output */}
        {nodeData.type === 'audio-output' && (
          <>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Text to Speak</label>
              <textarea
                value={(config.text as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { text: e.target.value })}
                placeholder="Enter text for TTS..."
                className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-600 resize-none
                  focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Voice</label>
              <select
                value={(config.voice as string) || 'default'}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { voice: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
              >
                <option value="default">Default</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </>
        )}

        {/* Enhance */}
        {nodeData.type === 'enhance' && (
          <>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Image URL</label>
              <input
                type="text"
                value={(config.image_url as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { image_url: e.target.value })}
                placeholder="Enter image URL..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-600
                  focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Enhance Mode</label>
              <select
                value={(config.mode as string) || 'upscale'}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { mode: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
              >
                <option value="upscale">Upscale</option>
                <option value="denoise">Denoise</option>
                <option value="sharpen">Sharpen</option>
              </select>
            </div>
          </>
        )}

        {/* Banana Output - 专属生图 */}
        {nodeData.type === 'banana-output' && (
          <div className="p-3 bg-gray-800/40 rounded-xl border border-yellow-500/30 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-yellow-400">🍌 Banana 生图</span>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">
                Provider
                <span className="ml-2 text-yellow-400">
                  default: bltcy
                </span>
              </label>
              <select
                value={(config.provider as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { provider: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200
                  focus:outline-none focus:border-yellow-500"
              >
                <option value="">-- Use default (bltcy) --</option>
                {providerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Model</label>
              <select
                value={(config.model as string) || 'nano-banana-pro'}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { model: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200
                  focus:outline-none focus:border-yellow-500"
              >
                {BANANA_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Number of Images</label>
              <select
                value={(config.num_images as number) || 1}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { num_images: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200
                  focus:outline-none focus:border-yellow-500"
              >
                <option value={1}>1 张</option>
                <option value={2}>2 张</option>
                <option value={3}>3 张</option>
                <option value={4}>4 张</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Prompt</label>
              <textarea
                value={(config.prompt as string) || ''}
                onChange={(e) => updateNodeConfig(selectedNodeId!, { prompt: e.target.value })}
                placeholder="Describe what you want to generate..."
                className="w-full h-24 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-600 resize-none
                  focus:outline-none focus:border-yellow-500"
              />
            </div>
            {/* Reference Images (optional, supports 1-9 images for image-to-image) */}
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">
                Reference Images <span className="text-gray-600">(optional, 1-9)</span>
              </label>
              {/* 已上传的图片网格 */}
              {(() => {
                const imageUrls = (config.image_urls as string[]) || [];
                const localPreviews = (config.local_previews as string[]) || [];
                if (imageUrls.length > 0) {
                  return (
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      {imageUrls.map((url: string, i: number) => (
                        <div key={i} className="relative group">
                          <img
                            src={localPreviews[i] || url}
                            alt={`Ref ${i + 1}`}
                            className="w-full h-16 object-cover rounded-lg border border-gray-700"
                          />
                          <span className="absolute top-0.5 left-0.5 text-[10px] bg-black/70 text-yellow-400 px-1 rounded">
                            {i + 1}
                          </span>
                          <button
                            onClick={() => {
                              const newUrls = imageUrls.filter((_: string, j: number) => j !== i);
                              const newPreviews = localPreviews.filter((_: string, j: number) => j !== i);
                              updateNodeConfig(selectedNodeId!, { image_urls: newUrls, local_previews: newPreviews });
                            }}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 text-white rounded-full
                              text-[10px] leading-4 text-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >×</button>
                        </div>
                      ))}
                      {imageUrls.length < 9 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-16 border-2 border-dashed border-gray-700 rounded-lg
                            flex items-center justify-center hover:border-yellow-500 transition-colors"
                        >
                          <Plus className="w-4 h-4 text-gray-600" />
                        </button>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              {/* 上传区域 */}
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                  const current = (config.image_urls as string[]) || [];
                  const remaining = 9 - current.length;
                  files.slice(0, remaining).forEach(f => handleMultiFileUpload(f));
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-gray-700 rounded-xl
                  hover:border-yellow-500 hover:bg-yellow-500/5 transition-all cursor-pointer
                  flex flex-col items-center justify-center py-4"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                    <p className="text-xs text-gray-500">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6 text-gray-600 mb-1" />
                    <p className="text-xs text-gray-400">
                      {((config.image_urls as string[]) || []).length > 0 ? 'Add more images' : 'Drop images or click'}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">Supports multi-select</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const current = (config.image_urls as string[]) || [];
                    const remaining = 9 - current.length;
                    files.slice(0, remaining).forEach(f => handleMultiFileUpload(f));
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Result display */}
        {nodeData.status === 'done' && nodeData.result && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Result</p>
            {nodeData.type === 'image-output' && (nodeData.result as any)?.images?.map((img: string, i: number) => (
              <img key={i} src={img} alt={`Result ${i + 1}`} className="w-full rounded-lg mb-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxImg(img)} />
            ))}
            {nodeData.type === 'banana-output' && (nodeData.result as any)?.images && (
              <div className={`grid gap-2 ${(nodeData.result as any).images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(nodeData.result as any).images.map((img: string, i: number) => (
                  <img key={i} src={img} alt={`Banana ${i + 1}`} className="w-full rounded-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxImg(img)} />
                ))}
              </div>
            )}
            {nodeData.type === 'script-output' && (
              <div className="text-xs text-gray-300 space-y-2 max-h-60 overflow-y-auto">
                <p className="whitespace-pre-wrap">{(nodeData.result as any).script}</p>
                {(nodeData.result as any).scenes?.map((s: any) => (
                  <div key={s.scene_num} className="p-2 bg-gray-900 rounded border border-gray-700">
                    <span className="text-purple-400">Shot {s.scene_num}</span>
                    <span className="text-gray-500 ml-2">{s.shot_type} - {s.duration}s</span>
                    <p className="mt-1 text-gray-400">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
            {nodeData.type === 'video-output' && (nodeData.result as any)?.video_url && (
              <video
                src={(nodeData.result as any).video_url}
                controls
                className="w-full rounded-lg"
              />
            )}
            {nodeData.type === 'audio-output' && (nodeData.result as any)?.audio_url && (
              <audio
                src={(nodeData.result as any).audio_url}
                controls
                className="w-full"
              />
            )}
          </div>
        )}

        {/* Error display */}
        {nodeData.status === 'error' && (nodeData.result as any)?.error && (
          <div className="p-3 bg-red-900/20 rounded-lg border border-red-800">
            <p className="text-xs text-red-400">{(nodeData.result as any).error}</p>
          </div>
        )}
      </div>

      {/* Run button */}
      {runnableTypes.includes(nodeData.type) && (
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleRun}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5
              bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
              text-white text-sm font-medium rounded-lg transition-colors"
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Node
              </>
            )}
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt="放大预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => { e.stopPropagation(); setLightboxImg(null); }}
          />
        </div>
      )}

      {/* Asset Picker Modal */}
      {assetPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white/80">
                {assetPickerTab === 'favorites' ? '从收藏选择' : '从资产选择'}
              </h3>
              <button
                onClick={() => setAssetPickerOpen(false)}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-5 py-2 border-b border-white/[0.04]">
              <button
                onClick={() => setAssetPickerTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  assetPickerTab === 'all'
                    ? 'bg-purple-500/15 text-purple-400'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                全部 ({assets.length})
              </button>
              <button
                onClick={() => setAssetPickerTab('favorites')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  assetPickerTab === 'favorites'
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                <Star className="w-3 h-3" fill={assetPickerTab === 'favorites' ? 'currentColor' : 'none'} />
                收藏 ({assets.filter(a => favorites.has(a.filename)).length})
              </button>
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredAssets.length === 0 ? (
                <div className="text-center py-10 text-white/20 text-sm">
                  {assetPickerTab === 'favorites' ? '没有收藏的图片' : '没有图片资产'}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filteredAssets.map(asset => (
                    <button
                      key={asset.filename}
                      onClick={() => handleSelectAsset(asset.url)}
                      className="group relative aspect-square rounded-xl overflow-hidden border border-white/[0.06]
                        hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all"
                    >
                      <img
                        src={asset.url}
                        alt={asset.filename}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                      {favorites.has(asset.filename) && (
                        <Star className="absolute top-1 left-1 w-3 h-3 text-yellow-400" fill="currentColor" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-medium">选择</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
