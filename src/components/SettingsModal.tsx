import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, X, Loader2 } from 'lucide-react';
import { getAvailableModels } from '../lib/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  baseUrl: string;
  model: string;
  onSave: (apiKey: string, baseUrl: string, model: string) => void;
}

export default function SettingsModal({ isOpen, onClose, apiKey: initialApiKey, baseUrl: initialBaseUrl, model: initialModel, onSave }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [model, setModel] = useState(initialModel);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setApiKey(initialApiKey);
    setBaseUrl(initialBaseUrl);
    setModel(initialModel);
  }, [initialApiKey, initialBaseUrl, initialModel, isOpen]);

  const handleFetchModels = async () => {
    if (!apiKey) {
      setError('需要 API Key 才能获取模型列表');
      return;
    }
    
    setIsLoadingModels(true);
    setError('');
    
    try {
      const models = await getAvailableModels(apiKey, baseUrl || undefined);
      if (models.length > 0) {
        setAvailableModels(models);
      } else {
        setError('未找到模型或获取失败。');
      }
    } catch (err) {
      setError('获取模型失败，请检查 API Key 和 Base URL。');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = () => {
    onSave(apiKey, baseUrl, model);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            模型配置
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base URL (可选)
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://generativelanguage.googleapis.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              用于代理或自定义端点。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              模型 (Model)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  list="model-options"
                  placeholder="gemini-3-flash-preview"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <datalist id="model-options">
                  {availableModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                  <option value="gemini-3-flash-preview" />
                  <option value="gemini-3.1-pro-preview" />
                  <option value="gemini-2.5-flash-latest" />
                </datalist>
              </div>
              <button
                onClick={handleFetchModels}
                disabled={isLoadingModels || !apiKey}
                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                title="获取可用模型"
              >
                {isLoadingModels ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Save className="w-4 h-4" />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
