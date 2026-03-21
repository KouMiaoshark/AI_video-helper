/**
 * API 配置面板 - 管理 Provider 和 API Key
 */

import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { X, Plus, Trash2, Save, Key, Globe, Cpu, Sparkles, Eye, EyeOff } from 'lucide-react';

interface ProviderEntry {
  type: string;
  api_key: string;
  base_url: string;
  default_model: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const taskLabels: Record<string, string> = {
  image: 'Image Generation',
  video: 'Video Generation',
  script: 'Script Generation',
  enhance: 'Image Enhancement',
  audio: 'Audio Generation',
};

// 常用预设
const presets: Record<string, ProviderEntry> = {
  siliconflow: {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://api.siliconflow.cn/v1',
    default_model: 'stabilityai/stable-diffusion-xl-base-1.0',
  },
  deepseek: {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-chat',
  },
  groq: {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://api.groq.com/openai/v1',
    default_model: 'llama-3.3-70b-versatile',
  },
  gemini: {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    default_model: 'gemini-2.0-flash',
  },
  openrouter: {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://openrouter.ai/api/v1',
    default_model: 'meta-llama/llama-3.1-70b-instruct:free',
  },
  'nova-ai': {
    type: 'openai_compatible',
    api_key: '',
    base_url: 'https://once.novai.su/v1',
    default_model: 'claude-opus-4-6',
  },
  'bltcy': {
    type: 'bltcy',
    api_key: '',
    base_url: 'https://api.bltcy.ai/v1',
    default_model: 'nano-banana-pro',
  },
};

export function SettingsPanel({ open, onClose }: Props) {
  const [providers, setProviders] = useState<Record<string, ProviderEntry>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showPresets, setShowPresets] = useState(false);

  // 加载已有配置
  useEffect(() => {
    if (open) {
      api.getRawConfig().then((data) => {
        setProviders(data.providers || {});
        setDefaults(data.defaults || {});
      }).catch(() => {
        // 加载失败，使用空配置
        setProviders({});
        setDefaults({ image: '', video: '', script: '', enhance: '', audio: '' });
      });
    }
  }, [open]);

  const handleAddProvider = () => {
    if (!newName.trim()) return;
    if (providers[newName.trim()]) {
      alert('Provider name already exists');
      return;
    }
    setProviders((prev) => ({
      ...prev,
      [newName.trim()]: { type: 'openai_compatible', api_key: '', base_url: '', default_model: '' },
    }));
    setNewName('');
  };

  const handleAddPreset = (name: string) => {
    if (providers[name]) {
      alert(`${name} already exists`);
      return;
    }
    setProviders((prev) => ({
      ...prev,
      [name]: { ...presets[name] },
    }));
    setShowPresets(false);
  };

  const handleRemoveProvider = (name: string) => {
    setProviders((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setDefaults((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] === name) next[key] = '';
      }
      return next;
    });
  };

  const handleUpdateProvider = (name: string, field: string, value: string) => {
    setProviders((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: value },
    }));
  };

  const toggleKeyVisibility = (name: string) => {
    setShowKeys((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateConfig({ providers, defaults });
      alert('Saved and reloaded!');
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const providerNames = Object.keys(providers);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[680px] max-h-[85vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-200">API Configuration</h2>
            <span className="text-xs text-gray-500 ml-2">{providerNames.length} provider(s)</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Task defaults */}
          <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Default Provider per Task</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(taskLabels).map(([task, label]) => (
                <div key={task} className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-32 shrink-0">{label}</label>
                  <select
                    value={defaults[task] || ''}
                    onChange={(e) => setDefaults((prev) => ({ ...prev, [task]: e.target.value }))}
                    className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300
                      focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- Not set --</option>
                    {providerNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Provider list */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Providers</h3>
            {providerNames.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm mb-1">No providers configured</p>
                <p className="text-xs">Add a preset or create a custom provider below</p>
              </div>
            ) : (
              <div className="space-y-4">
                {providerNames.map((name) => {
                  const provider = providers[name];
                  const isKeyVisible = showKeys[name];
                  return (
                    <div key={name} className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3">
                      {/* Provider header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                          <span className="text-sm font-semibold text-gray-200">{name}</span>
                          <span className="text-xs text-gray-600 px-1.5 py-0.5 bg-gray-800 rounded">
                            {provider.type}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveProvider(name)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Base URL + Model */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                            <Globe className="w-3 h-3" /> Base URL
                          </label>
                          <input
                            type="text"
                            value={provider.base_url}
                            onChange={(e) => handleUpdateProvider(name, 'base_url', e.target.value)}
                            placeholder="https://api.example.com/v1"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg
                              text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                            <Cpu className="w-3 h-3" /> Default Model
                          </label>
                          <input
                            type="text"
                            value={provider.default_model}
                            onChange={(e) => handleUpdateProvider(name, 'default_model', e.target.value)}
                            placeholder="model-name"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg
                              text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      {/* API Key */}
                      <div>
                        <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                          <Key className="w-3 h-3" /> API Key
                        </label>
                        <div className="relative">
                          <input
                            type={isKeyVisible ? 'text' : 'password'}
                            value={provider.api_key}
                            onChange={(e) => handleUpdateProvider(name, 'api_key', e.target.value)}
                            placeholder="sk-..."
                            className="w-full px-3 py-2 pr-9 bg-gray-900 border border-gray-700 rounded-lg
                              text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500
                              font-mono"
                          />
                          <button
                            onClick={() => toggleKeyVisibility(name)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                          >
                            {isKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add provider */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddProvider()}
                placeholder="Custom provider name..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleAddProvider}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700
                  text-gray-300 text-sm rounded-lg transition-colors border border-gray-700"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30
                  text-purple-300 text-sm rounded-lg transition-colors border border-purple-600/30"
              >
                <Sparkles className="w-4 h-4" />
                Presets
              </button>
            </div>

            {/* Preset dropdown */}
            {showPresets && (
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-800/50 rounded-xl border border-gray-700">
                {Object.entries(presets).map(([name, preset]) => (
                  <button
                    key={name}
                    onClick={() => handleAddPreset(name)}
                    disabled={!!providers[name]}
                    className="flex items-center gap-2 px-3 py-2 text-left rounded-lg
                      bg-gray-900/50 hover:bg-gray-800 border border-gray-700/50
                      disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div>
                      <div className="text-sm text-gray-200 font-medium">{name}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">{preset.base_url}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-purple-600 hover:bg-purple-500
              disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save & Reload'}
          </button>
        </div>
      </div>
    </div>
  );
}
