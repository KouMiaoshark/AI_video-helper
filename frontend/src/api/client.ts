/**
 * API Client - 与后端通信的统一接口
 */

const API_BASE = '/api';

export interface ImageGenRequest {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_images?: number;
  model?: string;
  image_url?: string;
  image_urls?: string[];
  provider?: string;
  aspect_ratio?: string;
  image_size?: string;
}

export interface ImageGenResponse {
  images: string[];
  model: string;
  provider: string;
}

export interface ScriptGenRequest {
  topic: string;
  style?: string;
  length?: string;
  model?: string;
  provider?: string;
}

export interface Scene {
  scene_num: number;
  description: string;
  shot_type: string;
  duration: number;
  camera_movement?: string;
  dialogue?: string;
  transition?: string;
}

export interface ScriptGenResponse {
  script: string;
  scenes: Scene[];
  model: string;
  provider: string;
}

export interface EnhanceRequest {
  image_url: string;
  mode?: string;
  scale?: number;
  provider?: string;
}

export interface EnhanceResponse {
  image_url: string;
  provider: string;
}

export interface VideoGenRequest {
  prompt: string;
  image_url?: string;
  duration?: number;
  model?: string;
  provider?: string;
}

export interface VideoGenResponse {
  video_url: string;
  model: string;
  provider: string;
}

export interface AudioGenRequest {
  text: string;
  voice?: string;
  model?: string;
  provider?: string;
}

export interface AudioGenResponse {
  audio_url: string;
  provider: string;
}

export interface ProviderInfo {
  name: string;
  supported_tasks: string[];
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  // Extract provider from body, pass as query param
  const provider = body.provider as string | undefined;
  const cleanBody = { ...body };
  delete cleanBody.provider;

  const url = provider
    ? `${API_BASE}${path}?provider=${encodeURIComponent(provider)}`
    : `${API_BASE}${path}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanBody),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return resp.json();
}

export const api = {
  generateImage: (req: ImageGenRequest) =>
    request<ImageGenResponse>('/generate/image', req as unknown as Record<string, unknown>),

  generateScript: (req: ScriptGenRequest) =>
    request<ScriptGenResponse>('/generate/script', req as unknown as Record<string, unknown>),

  enhanceImage: (req: EnhanceRequest) =>
    request<EnhanceResponse>('/generate/enhance', req as unknown as Record<string, unknown>),

  generateVideo: (req: VideoGenRequest) =>
    request<VideoGenResponse>('/generate/video', req as unknown as Record<string, unknown>),

  generateAudio: (req: AudioGenRequest) =>
    request<AudioGenResponse>('/generate/audio', req as unknown as Record<string, unknown>),

  getProviders: async () => {
    const resp = await fetch(`${API_BASE}/config/providers`);
    return resp.json() as Promise<{ providers: ProviderInfo[]; defaults: Record<string, string> }>;
  },

  healthCheck: async () => {
    const resp = await fetch(`${API_BASE}/health`);
    return resp.json();
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) throw new Error('Upload failed');
    return resp.json() as Promise<{ filename: string; url: string; size: number }>;
  },

  updateConfig: async (data: { providers?: Record<string, any>; defaults?: Record<string, string> }) => {
    const resp = await fetch(`${API_BASE}/config/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return resp.json();
  },

  reloadConfig: async () => {
    const resp = await fetch(`${API_BASE}/config/reload`, { method: 'POST' });
    return resp.json();
  },

  getRawConfig: async () => {
    const resp = await fetch(`${API_BASE}/config/raw`);
    return resp.json() as Promise<{
      providers: Record<string, { type: string; api_key: string; base_url: string; default_model: string }>;
      defaults: Record<string, string>;
    }>;
  },
};
