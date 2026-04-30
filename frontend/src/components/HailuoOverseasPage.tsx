import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  AudioLines,
  ChevronDown,
  Clapperboard,
  Download,
  Grid2x2,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';

interface PromptMention {
  id: string;
  name: string;
  label: string;
  url: string;
  start: number;
  end: number;
}

interface GenParams {
  prompt: string;
  modelPrompt?: string;
  model: string;
  imageSize: string;
  aspectRatio: string;
  numImages: number;
  refImages?: string[];
  mentions?: PromptMention[];
}

interface GeneratedImage {
  id: string;
  url: string;
  params: GenParams;
  timestamp: number;
  pending?: boolean;
}

interface ReferenceSuggestion {
  id: string;
  label: string;
  url: string;
  preview: string;
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

const STORAGE_KEY = 'hailuo_overseas_gallery';
const MODELS = [
  { value: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { value: 'nano-banana-2', label: 'Nano Banana 2' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
];
const IMAGE_SIZES = ['1K', '2K', '4K'];
const ASPECT_RATIOS = ['自动', '1:1', '1:3', '3:1', '3:4', '4:3', '9:16', '16:9', '21:9'];
const IMAGE_COUNTS = [1, 2, 3, 4];
const MIN_EDITOR_HEIGHT = 56;
const MAX_EDITOR_HEIGHT = 192;
const ALL_DATES = 'all';

const TRENDING_CARDS = [
  {
    title: 'Palm-Sized Reality',
    accent: 'from-[#3f2b25] via-[#7a5d54] to-[#1c1716]',
    artwork: 'from-[#b98e73]/60 via-[#f6e0c8]/25 to-transparent',
  },
  {
    title: 'A Travel Diary in Four Frames',
    accent: 'from-[#5d6670] via-[#94a3ab] to-[#eeebe2]',
    artwork: 'from-[#f8d7a2]/55 via-[#ffffff]/28 to-transparent',
  },
  {
    title: 'Product-to-Scene Replacement',
    accent: 'from-[#0a5573] via-[#32a6db] to-[#182332]',
    artwork: 'from-[#9be7ff]/55 via-[#d5f4ff]/24 to-transparent',
  },
];

const generateId = () => Math.random().toString(36).slice(2, 10);

function getImageDateKey(timestamp: number) {
  const date = new Date(timestamp || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = targetDate.getTime();
  const dayDiff = Math.round((todayStart - targetStart) / 86400000);
  const dateText = `${month}月${day}日`;

  if (dayDiff === 0) return `今天 · ${dateText}`;
  if (dayDiff === 1) return `昨天 · ${dateText}`;
  if (targetDate.getFullYear() === today.getFullYear()) return dateText;
  return `${year}年${dateText}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertTextAtCursor(value: string, caretPosition: number, text: string) {
  return `${value.slice(0, caretPosition)}${text}${value.slice(caretPosition)}`;
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function remapMentionLabelsAfterReorder(
  text: string,
  caretPosition: number,
  mentions: PromptMention[],
  nextLabelById: Map<string, string>,
) {
  let nextText = text;
  let nextCaret = caretPosition;

  [...mentions]
    .sort((left, right) => right.start - left.start)
    .forEach((mention) => {
      const replacement = nextLabelById.get(mention.id) ?? mention.label;
      nextText = `${nextText.slice(0, mention.start)}${replacement}${nextText.slice(mention.end)}`;

      const delta = replacement.length - (mention.end - mention.start);
      if (mention.end <= nextCaret) {
        nextCaret += delta;
      } else if (mention.start < nextCaret) {
        nextCaret = mention.start + replacement.length;
      }
    });

  return { nextText, nextCaret };
}

function findMentionMatch(value: string, caretPosition: number): MentionMatch | null {
  const beforeCaret = value.slice(0, caretPosition);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex === -1) return null;

  {
    const rawMentionText = beforeCaret.slice(atIndex + 1);
    if (/[\s\n]/.test(rawMentionText)) return null;

    return {
      start: atIndex,
      end: caretPosition,
      query: rawMentionText,
    };
  }

  const prefix = beforeCaret.slice(0, atIndex);
  if (prefix.length > 0 && !/[\s([{，。；：、]/.test(prefix[prefix.length - 1])) {
    return null;
  }

  const mentionText = beforeCaret.slice(atIndex + 1);
  if (/[\s\n]/.test(mentionText)) return null;

  return {
    start: atIndex,
    end: caretPosition,
    query: mentionText,
  };
}

function extractMentionsFromText(text: string, suggestions: ReferenceSuggestion[]): PromptMention[] {
  const matches: PromptMention[] = [];

  for (const suggestion of suggestions) {
    const regexp = new RegExp(escapeRegExp(suggestion.label), 'g');
    let match: RegExpExecArray | null;
    while ((match = regexp.exec(text)) !== null) {
      matches.push({
        id: suggestion.id,
        name: suggestion.label,
        label: suggestion.label,
        url: suggestion.url,
        start: match.index,
        end: match.index + suggestion.label.length,
      });
    }
  }

  return matches
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((mention, index, array) => {
      if (index === 0) return true;
      return mention.start >= array[index - 1].end;
    });
}

function buildModelPrompt(text: string, mentions: PromptMention[]) {
  if (!mentions.length) return text;

  const orderedUniqueMentions = mentions.filter(
    (mention, index, array) => array.findIndex((candidate) => candidate.id === mention.id) === index,
  );
  const referenceMap = orderedUniqueMentions
    .map((mention, index) => `${mention.label}=你收到的第${index + 1}张参考图`)
    .join('；');

  return `${text}\n\n[系统参考图映射：${referenceMap}。当提示词中出现这些标签时，请严格按对应参考图理解，不要混淆。]`;
}

function renderPromptOverlay(text: string, mentions: PromptMention[], references: ReferenceSuggestion[]) {
  if (!text) {
    return <span className="text-[#b1b0a8]">描述你想生成的画面，输入 @ 选择已上传参考图</span>;
  }

  const previewById = new Map(references.map((item) => [item.id, item.preview || item.url]));
  const segments: Array<string | { key: string; mention: PromptMention }> = [];
  let cursor = 0;

  for (const mention of mentions) {
    if (mention.start > cursor) {
      segments.push(text.slice(cursor, mention.start));
    }

    segments.push({
      key: `${mention.id}-${mention.start}-${mention.end}`,
      mention,
    });
    cursor = mention.end;
  }

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments.map((segment, index) => {
    if (typeof segment === 'string') {
      return <span key={`text-${index}`}>{segment}</span>;
    }

    const preview = previewById.get(segment.mention.id) || segment.mention.url;
    return (
      <span
        key={segment.key}
        className="relative inline-block overflow-hidden rounded-[6px] bg-[#eceae3] text-[#24241f] shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)]"
      >
        {preview ? (
          <img
            src={preview}
            alt={segment.mention.label}
            className="absolute inset-y-0 left-0 h-full w-[0.95em] rounded-[6px] object-cover opacity-65 mix-blend-multiply"
          />
        ) : null}
        <span className="relative z-10">{segment.mention.label}</span>
      </span>
    );
  });
}

function MasonryCard({
  image,
  onDownload,
  onDelete,
  onToggleFavorite,
  onPreview,
  isFavorited,
}: {
  image: GeneratedImage;
  onDownload: (url: string) => void;
  onDelete: (image: GeneratedImage) => void;
  onToggleFavorite: (url: string) => void;
  onPreview: (image: GeneratedImage) => void;
  isFavorited: boolean;
}) {
  if (image.pending) {
    return (
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_40px_rgba(20,20,20,0.06)]">
        <div className="flex aspect-[4/5] flex-col items-center justify-center bg-[#efefea]">
          <LoaderCircle className="h-8 w-8 animate-spin text-[#8a8a83]" />
          <p className="mt-3 text-sm text-[#8a8a83]">正在生成...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-zoom-in overflow-hidden rounded-[24px] bg-white shadow-[0_10px_36px_rgba(20,20,20,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(20,20,20,0.08)]"
      onClick={() => onPreview(image)}
    >
      <div className="relative flex aspect-[4/5] items-center justify-center bg-white p-3">
        <img
          src={image.url}
          alt={image.params.prompt}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(image.url);
          }}
          className={`absolute right-3 top-3 rounded-xl p-2 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white ${
            isFavorited ? 'bg-[#fff4d6] text-[#bf7a00]' : 'bg-white/88 text-[#4d4d45] opacity-0'
          }`}
          title="收藏"
        >
          <Star className="h-4 w-4" fill={isFavorited ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDownload(image.url);
          }}
          className="absolute right-3 top-[52px] rounded-xl bg-white/88 p-2 text-[#4d4d45] opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white"
          title="下载"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(image);
          }}
          className="absolute right-3 top-[101px] rounded-xl bg-white/88 p-2 text-[#8b3c34] opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white"
          title="删除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SelectChip({
  value,
  open,
  onToggle,
}: {
  value: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition ${
        open
          ? 'border-[#d7d7ce] bg-[#f7f7f3] text-[#23231f]'
          : 'border-[#e6e6de] bg-white text-[#56564f] shadow-[0_1px_3px_rgba(0,0,0,0.03)]'
      }`}
    >
      <span>{value}</span>
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}

export function HailuoOverseasPage({ active: _active }: { active: boolean }) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [galleryHydrated, setGalleryHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(MODELS[0].value);
  const [imageSize, setImageSize] = useState('1K');
  const [aspectRatio, setAspectRatio] = useState('自动');
  const [numImages, setNumImages] = useState(1);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeGenerationCount, setActiveGenerationCount] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [caretPosition, setCaretPosition] = useState(0);
  const [inputScrollActive, setInputScrollActive] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showCountMenu, setShowCountMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(ALL_DATES);
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [previewReference, setPreviewReference] = useState<ReferenceSuggestion | null>(null);
  const [draggedReferenceIndex, setDraggedReferenceIndex] = useState<number | null>(null);
  const [dragOverReferenceIndex, setDragOverReferenceIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const ratioMenuRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const countMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  const referenceSuggestions = useMemo<ReferenceSuggestion[]>(
    () =>
      refImages.map((url, index) => ({
        id: `ref:${url}`,
        label: `图${index + 1}`,
        url,
        preview: refPreviews[index] || url,
      })),
    [refImages, refPreviews],
  );

  const previewMentions = useMemo(
    () => extractMentionsFromText(input, referenceSuggestions),
    [input, referenceSuggestions],
  );
  const mentionMatch = useMemo(() => findMentionMatch(input, caretPosition), [input, caretPosition]);

  const filteredReferenceSuggestions = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    return referenceSuggestions.filter((item) => item.label.toLowerCase().includes(query));
  }, [mentionQuery, referenceSuggestions]);
  const showRichPromptOverlay = !inputFocused;

  const dateOptions = useMemo(
    () => Array.from(new Set(images.map((image) => getImageDateKey(image.timestamp)))).sort((left, right) => right.localeCompare(left)),
    [images],
  );

  const dateGroups = useMemo(() => {
    const groupMap = new Map<string, GeneratedImage[]>();
    images.forEach((image) => {
      const dateKey = getImageDateKey(image.timestamp);
      if (selectedDateKey !== ALL_DATES && selectedDateKey !== dateKey) return;
      const groupImages = groupMap.get(dateKey) ?? [];
      groupImages.push(image);
      groupMap.set(dateKey, groupImages);
    });

    return Array.from(groupMap.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([dateKey, groupImages]) => ({
        dateKey,
        images: groupImages,
      }));
  }, [images, selectedDateKey]);

  const visibleImageCount = useMemo(
    () => dateGroups.reduce((total, group) => total + group.images.length, 0),
    [dateGroups],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        setImages(saved ? JSON.parse(saved) : []);
      } catch {
        setImages([]);
      } finally {
        setGalleryHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!galleryHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    } catch {
      // ignore storage errors
    }
  }, [galleryHydrated, images]);

  useEffect(() => {
    if (selectedDateKey !== ALL_DATES && !dateOptions.includes(selectedDateKey)) {
      setSelectedDateKey(ALL_DATES);
    }
  }, [dateOptions, selectedDateKey]);

  useEffect(() => {
    fetch('/api/favorites')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.favorites) {
          setFavorites(new Set(data.favorites));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_EDITOR_HEIGHT);
    textarea.style.height = `${Math.max(nextHeight, MIN_EDITOR_HEIGHT)}px`;
    setInputScrollActive(textarea.scrollHeight > MAX_EDITOR_HEIGHT);
  }, [input]);

  useEffect(() => {
    if (!mentionMatch || !inputFocused) {
      setShowMentionMenu(false);
      setMentionQuery('');
      setMentionActiveIndex(0);
      return;
    }

    setShowMentionMenu(true);
    setMentionQuery(mentionMatch.query);
    setMentionActiveIndex(0);
  }, [inputFocused, mentionMatch]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelMenuRef.current && !modelMenuRef.current.contains(target)) setShowModelMenu(false);
      if (ratioMenuRef.current && !ratioMenuRef.current.contains(target)) setShowRatioMenu(false);
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(target)) setShowSizeMenu(false);
      if (countMenuRef.current && !countMenuRef.current.contains(target)) setShowCountMenu(false);
      if (dateMenuRef.current && !dateMenuRef.current.contains(target)) setShowDateMenu(false);
    };

    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewImage(null);
        setPreviewReference(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    previewUrlsRef.current = refPreviews;
  }, [refPreviews]);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((preview) => {
        if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
      });
    },
    [],
  );

  const syncOverlayScroll = () => {
    if (!textareaRef.current || !overlayScrollRef.current) return;
    overlayScrollRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const updateCaretFromTextarea = (target: HTMLTextAreaElement) => {
    setCaretPosition(target.selectionStart ?? target.value.length);
  };

  const focusTextareaAt = (nextCaret: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      syncOverlayScroll();
    });
  };

  const insertReferenceTag = (suggestion: ReferenceSuggestion) => {
    if (!mentionMatch) return;

    const nextValue = `${input.slice(0, mentionMatch.start)}${suggestion.label}${input.slice(mentionMatch.end)}`;
    const nextCaret = mentionMatch.start + suggestion.label.length;
    setInput(nextValue);
    setCaretPosition(nextCaret);
    setShowMentionMenu(false);
    focusTextareaAt(nextCaret);
  };

  const handleUpload = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const remaining = 14 - refImages.length;
    if (!imageFiles.length || remaining <= 0) return;

    setUploading(true);
    for (const file of imageFiles.slice(0, remaining)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!response.ok) continue;

        const data = await response.json();
        setRefImages((current) => [...current, data.url]);
        setRefPreviews((current) => [...current, URL.createObjectURL(file)]);
      } catch {
        // ignore upload failures
      }
    }
    setUploading(false);
  };

  const removeReference = (index: number) => {
    setRefImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setRefPreviews((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed?.startsWith('blob:')) URL.revokeObjectURL(removed);
      return next;
    });
  };

  const reorderReferences = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const nextRefImages = moveArrayItem(refImages, fromIndex, toIndex);
    const nextRefPreviews = moveArrayItem(refPreviews, fromIndex, toIndex);
    const nextLabelById = new Map(nextRefImages.map((url, index) => [`ref:${url}`, `图${index + 1}`]));
    const currentMentions = extractMentionsFromText(input, referenceSuggestions);
    const { nextText, nextCaret } = remapMentionLabelsAfterReorder(input, caretPosition, currentMentions, nextLabelById);

    setRefImages(nextRefImages);
    setRefPreviews(nextRefPreviews);
    setInput(nextText);
    setCaretPosition(nextCaret);
    setDraggedReferenceIndex(null);
    setDragOverReferenceIndex(null);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt) return;

    const currentModel = model;
    const currentSize = imageSize;
    const currentRatio = aspectRatio === '自动' ? '1:1' : aspectRatio;
    const currentCount = numImages;
    const currentRefs = [...refImages];
    const currentMentions = extractMentionsFromText(prompt, referenceSuggestions);
    const modelPrompt = buildModelPrompt(prompt, currentMentions);

    const placeholders: GeneratedImage[] = Array.from({ length: currentCount }, () => ({
      id: generateId(),
      url: '',
      pending: true,
      timestamp: Date.now(),
      params: {
        prompt,
        modelPrompt,
        model: currentModel,
        imageSize: currentSize,
        aspectRatio: currentRatio,
        numImages: currentCount,
        refImages: currentRefs,
        mentions: currentMentions,
      },
    }));

    setImages((current) => [...current, ...placeholders]);
    setActiveGenerationCount((current) => current + 1);

    try {
      const buildRequestBody = (): Record<string, unknown> => {
        const body: Record<string, unknown> = {
          prompt: modelPrompt,
          model: currentModel,
          width: 1024,
          height: 1024,
          num_images: 1,
          image_size: currentSize,
          aspect_ratio: currentRatio,
          mentions: currentMentions.map((mention) => ({
            id: mention.id,
            name: mention.name,
            label: mention.label,
            image_url: mention.url,
            start: mention.start,
            end: mention.end,
          })),
        };

        if (currentRefs.length > 0) {
          body.image_urls = currentRefs;
        }
        return body;
      };

      const results = await Promise.allSettled(
        Array.from({ length: currentCount }, async () => {
          const response = await fetch('/api/generate/image?provider=bltcy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRequestBody()),
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '生成失败');
          }
          const data = await response.json();
          const generatedImages: string[] = Array.isArray(data?.images) ? data.images : [];
          return generatedImages[0] || null;
        }),
      );

      const remoteImages = results
        .filter((item): item is PromiseFulfilledResult<string | null> => item.status === 'fulfilled')
        .map((item) => item.value)
        .filter((item): item is string => Boolean(item));

      if (!remoteImages.length) {
        const firstRejected = results.find((item): item is PromiseRejectedResult => item.status === 'rejected');
        throw new Error(firstRejected?.reason?.message || '生成失败');
      }

      const savedImages: string[] = [];
      for (const imageUrl of remoteImages) {
        try {
          const saveResponse = await fetch('/api/save-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl, prompt, model: currentModel }),
          });
          if (!saveResponse.ok) {
            savedImages.push(imageUrl);
            continue;
          }
          const saveData = await saveResponse.json();
          savedImages.push(saveData.local_url ?? imageUrl);
        } catch {
          savedImages.push(imageUrl);
        }
      }

      setImages((current) =>
        current
          .map((image) => {
            const placeholderIndex = placeholders.findIndex((placeholder) => placeholder.id === image.id);
            if (placeholderIndex === -1) return image;
            const nextUrl = savedImages[placeholderIndex];
            if (!nextUrl) return null;
            return { ...image, url: nextUrl, pending: false };
          })
          .filter(Boolean) as GeneratedImage[],
      );
    } catch (error) {
      console.error(error);
      setImages((current) => current.filter((image) => !placeholders.some((placeholder) => placeholder.id === image.id)));
    } finally {
      setActiveGenerationCount((current) => Math.max(0, current - 1));
    }
  };

  const addImageToReferences = (url: string) => {
    if (!url || refImages.includes(url) || refImages.length >= 14) return;
    setRefImages((current) => [...current, url]);
    setRefPreviews((current) => [...current, url]);
  };

  const generateSameStyle = async (image: GeneratedImage) => {
    if (image.pending) return;

    const prompt = image.params.prompt.trim();
    if (!prompt) return;

    setInput(prompt);
    setCaretPosition(prompt.length);
    setPreviewImage(null);
    focusTextareaAt(prompt.length);
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && filteredReferenceSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionActiveIndex((current) => (current + 1) % filteredReferenceSuggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionActiveIndex((current) => (current - 1 + filteredReferenceSuggestions.length) % filteredReferenceSuggestions.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        insertReferenceTag(filteredReferenceSuggestions[mentionActiveIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const insertAtSign = () => {
    const currentCaret = textareaRef.current?.selectionStart ?? caretPosition;
    const nextValue = insertTextAtCursor(input, currentCaret, '@');
    const nextCaret = currentCaret + 1;
    setInput(nextValue);
    setCaretPosition(nextCaret);
    focusTextareaAt(nextCaret);
  };

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `hailuo-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(anchor.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  const isFavoriteImage = (url: string) => {
    const filename = url.split('/').pop() || url;
    return favorites.has(filename);
  };

  const toggleFavorite = async (url: string) => {
    const filename = url.split('/').pop() || url;
    const next = new Set(favorites);
    if (next.has(filename)) {
      next.delete(filename);
    } else {
      next.add(filename);
    }
    setFavorites(next);
    try {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: Array.from(next) }),
      });
    } catch {}
  };

  const deleteGeneratedImage = (targetImage: GeneratedImage) => {
    setImages((current) => current.filter((image) => image.id !== targetImage.id));
    setPreviewImage((current) => (current?.id === targetImage.id ? null : current));
  };

  const toggleDateGroup = (dateKey: string) => {
    setCollapsedDateKeys((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto bg-[#f8f8f5] text-[#20211d]">
      {!galleryHydrated ? (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col items-center justify-center px-6 text-center">
          <div className="rounded-[22px] border border-[#ecece5] bg-white px-6 py-5 shadow-[0_20px_48px_rgba(0,0,0,0.06)]">
            <div className="text-lg font-semibold text-[#23231f]">加载中</div>
            <div className="mt-2 text-sm text-[#8a8a82]">正在读取本地图库和网页生图工作台...</div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-[1560px] px-6 pb-[420px] pt-5 xl:px-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button className="inline-flex items-center gap-2 rounded-2xl border border-[#ecece5] bg-white px-4 py-3 text-sm text-[#4d4d45] shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
            <span>默认项目</span>
            <ChevronDown className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            <div ref={dateMenuRef} className="relative z-30">
              <button
                onClick={() => setShowDateMenu((current) => !current)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#ecece5] bg-white px-4 py-3 text-sm text-[#6b6b64] shadow-[0_2px_14px_rgba(0,0,0,0.03)] transition hover:bg-[#fbfbf8]"
              >
                <Search className="h-4 w-4" />
                <span>{selectedDateKey === ALL_DATES ? '全部日期' : formatDateLabel(selectedDateKey)}</span>
                <ChevronDown className={`h-4 w-4 transition ${showDateMenu ? 'rotate-180' : ''}`} />
              </button>
              {showDateMenu ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[220px] rounded-[18px] border border-[#e6e6de] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  <button
                    onClick={() => {
                      setSelectedDateKey(ALL_DATES);
                      setShowDateMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                      selectedDateKey === ALL_DATES ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                    }`}
                  >
                    <span>全部日期</span>
                    <span className="text-xs text-[#9b9b93]">{images.length}</span>
                  </button>
                  {dateOptions.map((dateKey) => {
                    const count = images.filter((image) => getImageDateKey(image.timestamp) === dateKey).length;
                    return (
                      <button
                        key={dateKey}
                        onClick={() => {
                          setSelectedDateKey(dateKey);
                          setShowDateMenu(false);
                          setCollapsedDateKeys((current) => {
                            const next = new Set(current);
                            next.delete(dateKey);
                            return next;
                          });
                        }}
                        className={`mt-1 flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                          selectedDateKey === dateKey ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                        }`}
                      >
                        <span>{formatDateLabel(dateKey)}</span>
                        <span className="text-xs text-[#9b9b93]">{count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button className="rounded-2xl border border-[#ecece5] bg-white p-3 text-[#6b6b64] shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
              <Grid2x2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {images.length === 0 ? (
          <div className="flex min-h-[62vh] flex-col items-center justify-center px-4 pb-8">
            <div className="mb-10 flex items-center gap-3 text-center">
              <span className="text-[28px] font-semibold tracking-tight text-[#181915]">使用</span>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#ecece5] bg-white px-4 py-2 text-[#55564f] shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                <Clapperboard className="h-4 w-4" />
                <ImageIcon className="h-4 w-4" />
                <AudioLines className="h-4 w-4" />
              </div>
              <span className="text-[28px] font-semibold tracking-tight text-[#181915]">来创建</span>
            </div>

            <div className="grid w-full max-w-[980px] gap-5 md:grid-cols-3">
              {TRENDING_CARDS.map((card) => (
                <button
                  key={card.title}
                  className={`relative overflow-hidden rounded-[24px] bg-gradient-to-br ${card.accent} p-4 text-left shadow-[0_20px_48px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5`}
                >
                  <span className="inline-flex rounded-lg bg-[#f6f34c] px-2 py-1 text-[11px] font-semibold text-[#25251e]">
                    Trending
                  </span>
                  <div className="mt-3 text-[17px] font-semibold leading-snug text-white">{card.title}</div>
                  <div className="relative mt-5 h-[118px] overflow-hidden rounded-[18px] bg-white/12">
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.artwork}`} />
                    <div className="absolute bottom-0 right-4 h-[96px] w-[92px] rounded-[18px] border border-white/20 bg-white/18 backdrop-blur-sm" />
                    <div className="absolute bottom-8 left-5 h-[78px] w-[74px] rounded-[18px] border border-white/16 bg-black/12 backdrop-blur-sm" />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_26%,rgba(255,255,255,0.32),transparent_24%)]" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-8">
              {visibleImageCount === 0 ? (
                <div className="flex min-h-[42vh] items-center justify-center rounded-[24px] border border-dashed border-[#ddddd3] bg-white/55 px-6 text-center text-sm text-[#85857d]">
                  这一天暂时没有生成记录
                </div>
              ) : null}

              {dateGroups.map((group) => {
                const collapsed = collapsedDateKeys.has(group.dateKey);
                return (
                  <section key={group.dateKey} className="space-y-4">
                    <button
                      onClick={() => toggleDateGroup(group.dateKey)}
                      className="flex w-full items-center justify-between border-b border-[#e8e8df] pb-3 text-left transition hover:border-[#d9d9ce]"
                    >
                      <div>
                        <div className="text-lg font-semibold tracking-tight text-[#23231f]">{formatDateLabel(group.dateKey)}</div>
                        <div className="mt-1 text-xs text-[#8b8b83]">{group.images.length} 张图片</div>
                      </div>
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#686861] shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                        <ChevronDown className={`h-4 w-4 transition ${collapsed ? '-rotate-90' : ''}`} />
                      </div>
                    </button>

                    {!collapsed ? (
                      <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {group.images.map((image) => (
                          <MasonryCard
                            key={image.id}
                            image={image}
                            onDelete={deleteGeneratedImage}
                            onDownload={downloadImage}
                            onToggleFavorite={toggleFavorite}
                            onPreview={setPreviewImage}
                            isFavorited={isFavoriteImage(image.url)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <div aria-hidden="true" className="h-[360px] w-full" />
          </>
        )}
      </div>

      {previewImage ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/56 px-4 py-6 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setPreviewImage(null)}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.24)] lg:flex-row">
            <div className="flex min-h-[320px] flex-1 items-center justify-center bg-[#f5f5f1] p-4 lg:p-6">
              <img
                src={previewImage.url}
                alt={previewImage.params.prompt}
                className="max-h-[78vh] w-auto max-w-full rounded-[22px] object-contain shadow-[0_16px_44px_rgba(0,0,0,0.12)]"
              />
            </div>

            <div className="flex w-full flex-col border-t border-[#efefe8] bg-white lg:w-[380px] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between border-b border-[#efefe8] px-5 py-4">
                <div>
                  <div className="text-lg font-semibold text-[#23231f]">图片详情</div>
                  <div className="mt-1 text-xs text-[#8b8b83]">
                    {MODELS.find((item) => item.value === previewImage.params.model)?.label || previewImage.params.model}
                  </div>
                </div>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="rounded-full bg-[#f5f5f1] p-2 text-[#55554d] transition hover:bg-[#ecece6]"
                  title="关闭预览"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#96968d]">Prompt</div>
                  <div className="rounded-[18px] bg-[#f8f8f4] px-4 py-3 text-sm leading-7 text-[#24241f]">
                    {previewImage.params.prompt || '暂无提示词'}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#96968d]">Reference</div>
                  {previewImage.params.refImages && previewImage.params.refImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {[...new Set(previewImage.params.refImages)].map((url, index) => (
                        <div key={`${url}-${index}`} className="overflow-hidden rounded-[16px] border border-[#ecece5] bg-[#f8f8f4]">
                          <img src={url} alt={`参考图${index + 1}`} className="aspect-square w-full object-cover" />
                          <div className="px-2 py-2 text-center text-xs text-[#66665f]">图{index + 1}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] bg-[#f8f8f4] px-4 py-3 text-sm text-[#8b8b83]">这张图没有使用参考图。</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-[#6d6d66]">
                  <div className="rounded-[16px] bg-[#f8f8f4] px-4 py-3">
                    <div className="text-[#9a9a92]">尺寸</div>
                    <div className="mt-1 text-sm text-[#23231f]">{previewImage.params.imageSize}</div>
                  </div>
                  <div className="rounded-[16px] bg-[#f8f8f4] px-4 py-3">
                    <div className="text-[#9a9a92]">比例</div>
                    <div className="mt-1 text-sm text-[#23231f]">{previewImage.params.aspectRatio}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#efefe8] px-5 py-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => void toggleFavorite(previewImage.url)}
                    className={`inline-flex items-center justify-center rounded-[14px] border px-4 py-3 text-sm font-medium transition ${
                      isFavoriteImage(previewImage.url)
                        ? 'border-[#f4d998] bg-[#fff7dc] text-[#9b6a00] hover:bg-[#fff1c4]'
                        : 'border-[#e6e6de] bg-white text-[#2b2b26] hover:bg-[#f8f8f3]'
                    }`}
                  >
                    <Star className="mr-2 h-4 w-4" fill={isFavoriteImage(previewImage.url) ? 'currentColor' : 'none'} />
                    {isFavoriteImage(previewImage.url) ? '已收藏' : '收藏'}
                  </button>
                  <button
                    onClick={() => deleteGeneratedImage(previewImage)}
                    className="inline-flex items-center justify-center rounded-[14px] border border-[#f0d3cd] bg-[#fff5f2] px-4 py-3 text-sm font-medium text-[#8b3c34] transition hover:bg-[#ffede8]"
                  >
                    删除图片
                  </button>
                  <button
                    onClick={() => addImageToReferences(previewImage.url)}
                    className="inline-flex flex-1 items-center justify-center rounded-[14px] border border-[#e6e6de] bg-white px-4 py-3 text-sm font-medium text-[#2b2b26] transition hover:bg-[#f8f8f3]"
                  >
                    添加到参考图
                  </button>
                  <button
                    onClick={() => void generateSameStyle(previewImage)}
                    className="inline-flex flex-1 items-center justify-center rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#0f0f0f]"
                  >
                    生成同款
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewReference ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/56 px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setPreviewReference(null)} />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between border-b border-[#efefe8] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-[#23231f]">{previewReference.label}</div>
                <div className="mt-1 text-xs text-[#8b8b83]">参考图预览</div>
              </div>
              <button
                onClick={() => setPreviewReference(null)}
                className="rounded-full bg-[#f5f5f1] p-2 text-[#55554d] transition hover:bg-[#ecece6]"
                title="关闭预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-[360px] items-center justify-center bg-[#f5f5f1] p-5">
              <img
                src={previewReference.url}
                alt={previewReference.label}
                className="max-h-[76vh] w-auto max-w-full rounded-[22px] object-contain shadow-[0_16px_44px_rgba(0,0,0,0.12)]"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
        <div
          className="pointer-events-auto w-full max-w-[760px] rounded-[28px] border border-[#ecece5] bg-white px-4 pb-4 pt-3 shadow-[0_28px_80px_rgba(36,36,30,0.14)]"
          style={{ width: 'min(760px, calc(100vw - 120px))' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 overflow-x-auto pb-2">
              <div className="flex min-w-max items-center gap-2.5">
                {referenceSuggestions.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onClick={() => setPreviewReference(item)}
                    onDragStart={(event) => {
                      setDraggedReferenceIndex(index);
                      setDragOverReferenceIndex(index);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverReferenceIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedReferenceIndex === null) return;
                      reorderReferences(draggedReferenceIndex, index);
                    }}
                    onDragEnd={() => {
                      setDraggedReferenceIndex(null);
                      setDragOverReferenceIndex(null);
                    }}
                    className={`group relative h-[70px] w-[70px] flex-shrink-0 cursor-zoom-in overflow-hidden rounded-[18px] bg-[#f3f3ee] transition ${
                      draggedReferenceIndex === index ? 'scale-[0.97] opacity-70' : ''
                    } ${
                      dragOverReferenceIndex === index && draggedReferenceIndex !== null
                        ? 'ring-2 ring-[#23231f]/20 ring-offset-2 ring-offset-white'
                        : ''
                    }`}
                  >
                    <img src={item.preview} alt={item.label} className="h-full w-full object-cover" />
                    <div className="absolute inset-x-2 bottom-2 rounded-full bg-black/44 px-2 py-1 text-center text-[11px] text-white backdrop-blur">
                      {item.label}
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeReference(index);
                      }}
                      className="absolute right-1.5 top-1.5 rounded-full bg-white/92 p-1 text-[#55554d] opacity-0 transition group-hover:opacity-100"
                      title="删除参考图"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-[70px] w-[92px] flex-shrink-0 flex-col items-center justify-center rounded-[18px] border border-dashed border-[#dcdcd4] bg-[#fbfbf8] px-2 text-[#7e7e76] transition hover:border-[#cfcfc6] hover:bg-[#f5f5ef]"
                >
                  {uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  <span className="mt-1.5 text-xs">参考图</span>
                  <span className="text-[11px] text-[#9b9b93]">({referenceSuggestions.length}/14)</span>
                </button>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center rounded-2xl bg-[#f8f8f4] p-1">
              <button className="rounded-xl px-3 py-2 text-[#66665f] transition hover:bg-white">
                <Clapperboard className="h-4 w-4" />
              </button>
              <button className="rounded-xl bg-white px-3 py-2 text-[#22231f] shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                <ImageIcon className="h-4 w-4" />
              </button>
              <button className="rounded-xl px-3 py-2 text-[#66665f] transition hover:bg-white">
                <AudioLines className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative mt-2 rounded-[22px] bg-[#fafaf7] px-4 py-3">
            <div
              ref={overlayScrollRef}
              className={`pointer-events-none absolute inset-0 overflow-y-auto px-4 py-3 text-[16px] leading-8 text-[#24241f] transition-opacity ${
                showRichPromptOverlay ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {renderPromptOverlay(input, previewMentions, referenceSuggestions)}
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              rows={2}
              spellCheck={false}
              aria-label="网页生图提示词输入"
              onChange={(event) => {
                setInput(event.target.value);
                updateCaretFromTextarea(event.currentTarget);
              }}
              onKeyDown={handleTextareaKeyDown}
              onClick={(event) => updateCaretFromTextarea(event.currentTarget)}
              onKeyUp={(event) => updateCaretFromTextarea(event.currentTarget)}
              onSelect={(event) => updateCaretFromTextarea(event.currentTarget)}
              onFocus={(event) => {
                setInputFocused(true);
                updateCaretFromTextarea(event.currentTarget);
              }}
              onBlur={() => setInputFocused(false)}
              onScroll={syncOverlayScroll}
              className={`relative z-10 block w-full resize-none border-0 bg-transparent p-0 font-inherit text-[16px] leading-8 outline-none ${
                showRichPromptOverlay ? 'text-transparent caret-[#23231f]' : 'text-[#24241f] caret-[#23231f]'
              } ${
                inputScrollActive ? 'overflow-y-auto' : 'overflow-y-hidden'
              }`}
              style={{ minHeight: MIN_EDITOR_HEIGHT, maxHeight: MAX_EDITOR_HEIGHT, lineHeight: '32px' }}
            />

            {showMentionMenu ? (
              <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[264px] rounded-[20px] border border-[#e6e6de] bg-white p-2 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
                {filteredReferenceSuggestions.length > 0 ? (
                  filteredReferenceSuggestions.map((item, index) => {
                    const isActive = index === mentionActiveIndex;
                    return (
                      <button
                        key={item.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertReferenceTag(item)}
                        className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                          isActive ? 'bg-[#f3f3ef]' : 'hover:bg-[#f7f7f2]'
                        }`}
                      >
                        <img src={item.preview} alt={item.label} className="h-10 w-10 rounded-xl object-cover" />
                        <div>
                          <div className="text-[15px] text-[#2e2e29]">{item.label}</div>
                          <div className="text-xs text-[#97978f]">已上传参考图</div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-3 text-sm text-[#8f8f86]">先上传参考图，再输入 @ 进行引用</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="relative z-20 mt-3 flex flex-wrap items-center gap-2">
            <div ref={modelMenuRef} className="relative z-20">
              <SelectChip
                value={MODELS.find((item) => item.value === model)?.label || MODELS[0].label}
                open={showModelMenu}
                onToggle={() => {
                  setShowModelMenu((current) => !current);
                  setShowRatioMenu(false);
                  setShowSizeMenu(false);
                  setShowCountMenu(false);
                }}
              />
              {showModelMenu ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[220px] rounded-[18px] border border-[#e6e6de] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  {MODELS.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => {
                        setModel(item.value);
                        setShowModelMenu(false);
                      }}
                      className={`w-full rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                        item.value === model ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={ratioMenuRef} className="relative z-20">
              <SelectChip
                value={aspectRatio}
                open={showRatioMenu}
                onToggle={() => {
                  setShowRatioMenu((current) => !current);
                  setShowModelMenu(false);
                  setShowSizeMenu(false);
                  setShowCountMenu(false);
                }}
              />
              {showRatioMenu ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[150px] rounded-[18px] border border-[#e6e6de] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  {ASPECT_RATIOS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setAspectRatio(item);
                        setShowRatioMenu(false);
                      }}
                      className={`w-full rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                        item === aspectRatio ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={sizeMenuRef} className="relative z-20">
              <SelectChip
                value={imageSize}
                open={showSizeMenu}
                onToggle={() => {
                  setShowSizeMenu((current) => !current);
                  setShowModelMenu(false);
                  setShowRatioMenu(false);
                  setShowCountMenu(false);
                }}
              />
              {showSizeMenu ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[120px] rounded-[18px] border border-[#e6e6de] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  {IMAGE_SIZES.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setImageSize(item);
                        setShowSizeMenu(false);
                      }}
                      className={`w-full rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                        item === imageSize ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={countMenuRef} className="relative z-20">
              <SelectChip
                value={`${numImages} 张`}
                open={showCountMenu}
                onToggle={() => {
                  setShowCountMenu((current) => !current);
                  setShowModelMenu(false);
                  setShowRatioMenu(false);
                  setShowSizeMenu(false);
                }}
              />
              {showCountMenu ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[120px] rounded-[18px] border border-[#e6e6de] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  {IMAGE_COUNTS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setNumImages(item);
                        setShowCountMenu(false);
                      }}
                      className={`w-full rounded-[14px] px-3 py-2.5 text-left text-sm transition ${
                        item === numImages ? 'bg-[#f3f3ef] text-[#262621]' : 'text-[#63635b] hover:bg-[#f8f8f3]'
                      }`}
                    >
                      {item} 张
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              onClick={insertAtSign}
              className="inline-flex items-center gap-2 rounded-full border border-[#e6e6de] bg-white px-3 py-2 text-sm text-[#4d4d45] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              title="插入参考图引用"
            >
              <AtSign className="h-4 w-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-[#e6e6de] bg-white px-3 py-2 text-sm text-[#4d4d45] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              title="上传参考图"
            >
              <ImagePlus className="h-4 w-4" />
            </button>

            <button
              onClick={() => {
                setInput('');
                setCaretPosition(0);
                requestAnimationFrame(() => {
                  if (textareaRef.current) {
                    textareaRef.current.scrollTop = 0;
                    syncOverlayScroll();
                  }
                });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[#e6e6de] bg-white px-3 py-2 text-sm text-[#4d4d45] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              title="清空提示词"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="ml-auto flex items-center gap-3">
              <div className="inline-flex items-center gap-1 text-sm text-[#66665f]">
                <Layers3 className="h-4 w-4" />
                <span>{Math.max(previewMentions.length, 1)}</span>
              </div>
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                className={`inline-flex items-center gap-2 rounded-[14px] px-5 py-3 text-sm font-medium transition ${
                  input.trim()
                    ? 'bg-[#161616] text-white hover:bg-[#0f0f0f]'
                    : 'cursor-not-allowed bg-[#e7e7df] text-[#9e9e95]'
                }`}
              >
                {activeGenerationCount > 0 ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>生成</span>
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void handleUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}
