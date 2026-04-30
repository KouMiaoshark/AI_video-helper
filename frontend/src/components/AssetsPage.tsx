/**
 * 资产页面 - 分类展示生成的图片/视频/音频/文本
 * 支持：收藏筛选、按日期分组折叠、批量操作、排序
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Star, Download, Trash2, Image as ImageIcon, Video, Music,
  FileText, Filter, Search, ChevronDown, ChevronRight, CheckSquare, Square,
  ArrowUpDown, Calendar, SortAsc, SortDesc,
} from 'lucide-react';

type AssetType = 'image' | 'video' | 'audio' | 'text';
type SortBy = 'date-desc' | 'date-asc' | 'name' | 'size';

interface Asset {
  filename: string;
  url: string;
  type: AssetType;
  prompt?: string;
  model?: string;
  size: number;
  modified: number;
  favorited: boolean;
}

const TYPE_TABS: { key: AssetType | 'all' | 'favorites'; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <Filter className="w-4 h-4" /> },
  { key: 'image', label: '图片', icon: <ImageIcon className="w-4 h-4" /> },
  { key: 'video', label: '视频', icon: <Video className="w-4 h-4" /> },
  { key: 'audio', label: '音频', icon: <Music className="w-4 h-4" /> },
  { key: 'text', label: '文本', icon: <FileText className="w-4 h-4" /> },
  { key: 'favorites', label: '收藏', icon: <Star className="w-4 h-4" /> },
];

const SORT_OPTIONS: { key: SortBy; label: string; icon: React.ReactNode }[] = [
  { key: 'date-desc', label: '最新优先', icon: <SortDesc className="w-3.5 h-3.5" /> },
  { key: 'date-asc', label: '最早优先', icon: <SortAsc className="w-3.5 h-3.5" /> },
  { key: 'name', label: '按名称', icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
  { key: 'size', label: '按大小', icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
];

function detectType(filename: string): AssetType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['txt', 'md', 'json', 'srt', 'vtt'].includes(ext)) return 'text';
  return 'image';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDateKey(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getDateLabel(key: string): string {
  const today = new Date();
  const todayKey = getDateKey(today.getTime() / 1000);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayKey = getDateKey(yesterday.getTime() / 1000);
  if (key === todayKey) return '今天';
  if (key === yesterdayKey) return '昨天';
  return key;
}

export function AssetsPage({ active }: { active: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeTab, setActiveTab] = useState<AssetType | 'all' | 'favorites'>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('date-desc');
  const [showSortPicker, setShowSortPicker] = useState(false);

  // 批量操作
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  // 加载资产
  const loadAssets = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/assets');
      if (resp.ok) {
        const data = await resp.json();
        const mapped: Asset[] = (data.assets || []).map((a: any) => ({
          ...a,
          type: detectType(a.filename),
          favorited: favorites.has(a.filename),
        }));
        setAssets(mapped);
      }
    } catch {}
    setLoading(false);
  };

  // 加载收藏
  const loadFavorites = async () => {
    try {
      const resp = await fetch('/api/favorites');
      if (resp.ok) {
        const data = await resp.json();
        setFavorites(new Set(data.favorites || []));
      }
    } catch {}
  };

  useEffect(() => { loadFavorites(); }, []);
  useEffect(() => { loadAssets(); }, [favorites]);

  useEffect(() => {
    if (active) { loadFavorites(); loadAssets(); }
  }, [active]);

  // 切换收藏
  const toggleFavorite = async (filename: string) => {
    const next = new Set(favorites);
    if (next.has(filename)) next.delete(filename); else next.add(filename);
    setFavorites(next);
    try {
      await fetch('/api/favorites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: Array.from(next) }),
      });
    } catch {}
  };

  // 删除资产
  const deleteAsset = async (filename: string) => {
    try {
      const resp = await fetch(`/api/assets/${filename}`, { method: 'DELETE' });
      if (resp.ok) {
        setAssets(prev => prev.filter(a => a.filename !== filename));
        setSelected(prev => { const n = new Set(prev); n.delete(filename); return n; });
      }
    } catch {}
  };

  // 批量删除
  const batchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除 ${selected.size} 个资产？`)) return;
    for (const fn of selected) {
      try { await fetch(`/api/assets/${fn}`, { method: 'DELETE' }); } catch {}
    }
    setAssets(prev => prev.filter(a => !selected.has(a.filename)));
    setSelected(new Set());
    setSelectMode(false);
  };

  // 批量下载
  const batchDownload = () => {
    assets.filter(a => selected.has(a.filename)).forEach(a => {
      const link = document.createElement('a');
      link.href = a.url;
      link.download = a.filename;
      link.click();
    });
  };

  // 下载
  const downloadAsset = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  };

  // 切换选择
  const toggleSelect = (filename: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(filename)) n.delete(filename); else n.add(filename);
      return n;
    });
  };

  // 选中当前页全部
  const selectAll = () => {
    if (selected.size === filteredAssets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredAssets.map(a => a.filename)));
    }
  };

  // 筛选 + 排序
  const filteredAssets = useMemo(() => {
    let result = assets.filter(a => {
      if (activeTab === 'favorites' && !favorites.has(a.filename)) return false;
      if (activeTab !== 'all' && activeTab !== 'favorites' && a.type !== activeTab) return false;
      if (search && !a.filename.toLowerCase().includes(search.toLowerCase()) &&
          !(a.prompt || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    // 排序
    switch (sortBy) {
      case 'date-desc': result.sort((a, b) => b.modified - a.modified); break;
      case 'date-asc': result.sort((a, b) => a.modified - b.modified); break;
      case 'name': result.sort((a, b) => a.filename.localeCompare(b.filename)); break;
      case 'size': result.sort((a, b) => b.size - a.size); break;
    }
    return result;
  }, [assets, activeTab, favorites, search, sortBy]);

  // 按日期分组
  const groupedByDate = useMemo(() => {
    const groups: { key: string; label: string; assets: Asset[] }[] = [];
    const map = new Map<string, Asset[]>();
    for (const a of filteredAssets) {
      const key = getDateKey(a.modified);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const [key, items] of map) {
      groups.push({ key, label: getDateLabel(key), assets: items });
    }
    // 按组内第一个资产的时间排序（和全局排序一致）
    return groups;
  }, [filteredAssets]);

  // 按类型计数
  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter(a => a.type === 'image').length,
    video: assets.filter(a => a.type === 'video').length,
    audio: assets.filter(a => a.type === 'audio').length,
    text: assets.filter(a => a.type === 'text').length,
    favorites: favorites.size,
  }), [assets, favorites]);

  const toggleDateGroup = (key: string) => {
    setCollapsedDates(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a12] relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col relative z-10 min-h-0">
        {/* 顶部栏 */}
        <div className="h-14 border-b border-white/[0.04] flex items-center px-5 gap-3 backdrop-blur-xl bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <ImageIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white/90">我的资产</span>
            <span className="text-[11px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full">{assets.length} 项</span>
          </div>
          <div className="flex-1" />

          {/* 排序 */}
          <div className="relative">
            <button onClick={() => setShowSortPicker(!showSortPicker)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all">
              {SORT_OPTIONS.find(s => s.key === sortBy)?.icon}
              <span>{SORT_OPTIONS.find(s => s.key === sortBy)?.label}</span>
            </button>
            {showSortPicker && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[140px]">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => { setSortBy(opt.key); setShowSortPicker(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-all ${
                      sortBy === opt.key ? 'text-purple-400 bg-purple-500/10' : 'text-white/50 hover:bg-white/[0.04]'
                    }`}>
                    {opt.icon}<span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 批量操作按钮 */}
          <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all ${
              selectMode ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                : 'bg-white/[0.04] text-white/40 hover:text-white/60 border border-white/[0.06]'
            }`}>
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? '取消选择' : '批量'}</span>
          </button>

          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/60 placeholder-white/20 outline-none focus:border-white/[0.1] transition-all w-40" />
          </div>
        </div>

        {/* 批量操作栏 */}
        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 bg-purple-500/[0.06] border-b border-purple-500/10">
            <button onClick={selectAll}
              className="flex items-center gap-1.5 text-[11px] text-purple-400/80 hover:text-purple-300 transition-colors">
              {selected.size === filteredAssets.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>全选 ({selected.size}/{filteredAssets.length})</span>
            </button>
            <div className="flex-1" />
            <button onClick={batchDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all border border-white/[0.06]">
              <Download className="w-3.5 h-3.5" /><span>下载 ({selected.size})</span>
            </button>
            <button onClick={batchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] transition-all border border-red-500/10">
              <Trash2 className="w-3.5 h-3.5" /><span>删除 ({selected.size})</span>
            </button>
          </div>
        )}

        {/* 分类标签 */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-white/[0.03]">
          {TYPE_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                  : 'text-white/35 hover:text-white/50 hover:bg-white/[0.03] border border-transparent'
              }`}>
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`text-[10px] ml-0.5 ${activeTab === tab.key ? 'text-purple-400/60' : 'text-white/15'}`}>
                {counts[tab.key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {/* 资产网格（按日期分组） */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2.5 h-2.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-4">
                <ImageIcon className="w-7 h-7 text-white/15" />
              </div>
              <p className="text-sm text-white/30">{activeTab === 'favorites' ? '还没有收藏的资产' : '还没有资产'}</p>
              <p className="text-xs text-white/15 mt-1">{activeTab === 'favorites' ? '点击 ⭐ 收藏喜欢的资产' : '在网页生图生成的图片会自动保存到这里'}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByDate.map(group => {
                const collapsed = collapsedDates.has(group.key);
                return (
                  <div key={group.key}>
                    {/* 日期分组标题 */}
                    <button onClick={() => toggleDateGroup(group.key)}
                      className="flex items-center gap-2 mb-3 group w-full">
                      <Calendar className="w-3.5 h-3.5 text-white/20" />
                      <span className="text-[12px] font-medium text-white/40 group-hover:text-white/60 transition-colors">{group.label}</span>
                      <span className="text-[10px] text-white/15">({group.assets.length})</span>
                      <div className="flex-1 border-t border-white/[0.04] ml-2" />
                      {collapsed
                        ? <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                        : <ChevronDown className="w-3.5 h-3.5 text-white/20" />
                      }
                    </button>

                    {/* 资产网格 */}
                    {!collapsed && (
                      <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4">
                        {group.assets.map(asset => {
                          const isFav = favorites.has(asset.filename);
                          const isSelected = selected.has(asset.filename);
                          return (
                            <div key={asset.filename}
                              className={`break-inside-avoid mb-4 relative group rounded-2xl overflow-hidden border transition-all ${
                                isSelected ? 'border-purple-500/40 ring-2 ring-purple-500/20'
                                  : 'border-white/[0.06] hover:border-white/[0.12]'
                              } bg-white/[0.02]`}>
                              {/* 选择模式 checkbox */}
                              {selectMode && (
                                <button onClick={() => toggleSelect(asset.filename)}
                                  className="absolute top-2 left-2 z-20 w-6 h-6 rounded-lg flex items-center justify-center bg-black/40 backdrop-blur-sm border border-white/10">
                                  {isSelected
                                    ? <CheckSquare className="w-4 h-4 text-purple-400" />
                                    : <Square className="w-4 h-4 text-white/40" />
                                  }
                                </button>
                              )}

                              {asset.type === 'image' ? (
                                <div className="aspect-square bg-black cursor-pointer"
                                  onClick={() => selectMode ? toggleSelect(asset.filename) : setLightboxUrl(asset.url)}>
                                  <img src={asset.url} alt={asset.filename}
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                                </div>
                              ) : asset.type === 'video' ? (
                                <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                                  <Video className="w-8 h-8 text-white/20" />
                                </div>
                              ) : asset.type === 'audio' ? (
                                <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-orange-500/10 to-yellow-500/10">
                                  <Music className="w-8 h-8 text-white/20" />
                                </div>
                              ) : (
                                <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-green-500/10 to-cyan-500/10">
                                  <FileText className="w-8 h-8 text-white/20" />
                                </div>
                              )}

                              {/* 收藏按钮 */}
                              {!selectMode && (
                                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(asset.filename); }}
                                  className={`absolute top-2 right-2 p-2 backdrop-blur-md rounded-xl transition-all border z-10 ${
                                    isFav ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                                      : 'bg-black/30 border-white/10 text-white/40 hover:text-yellow-400 hover:bg-yellow-500/10'
                                  }`}>
                                  <Star className="w-4 h-4" fill={isFav ? 'currentColor' : 'none'} />
                                </button>
                              )}

                              {/* 悬浮操作层 */}
                              {!selectMode && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                                  onClick={() => setLightboxUrl(asset.url)}>
                                  <div className="absolute top-2 left-2 flex gap-1.5" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => downloadAsset(asset.url, asset.filename)}
                                      className="p-2 bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/20 transition-all border border-white/10 text-white/50 hover:text-white">
                                      <Download className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => deleteAsset(asset.filename)}
                                      className="p-2 bg-white/10 backdrop-blur-md rounded-xl hover:bg-red-500/20 transition-all border border-white/10 text-white/50 hover:text-red-400">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
                                    <p className="text-[10px] text-white/40 truncate">{asset.filename}</p>
                                    {asset.prompt && <p className="text-[10px] text-white/25 truncate mt-0.5">{asset.prompt}</p>}
                                    <p className="text-[9px] text-white/15 mt-0.5">{formatSize(asset.size)} · {formatDate(asset.modified)}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 灯箱 */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Preview" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
