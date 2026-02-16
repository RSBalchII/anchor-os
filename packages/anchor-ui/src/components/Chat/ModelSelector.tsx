import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface ModelInfo {
  id: string;
  name: string;
  size?: number;
  path?: string;
}

import { webLLMConfig } from '../../config/web-llm-models';

interface ModelSelectorProps {
  onModelChange: (modelId: string) => void;
  currentModel: string;
  isRemote: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, currentModel, isRemote }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!isRemote) {
          // --- LOCAL: WebLLM Models ---
          const webModels = webLLMConfig.model_list.map(m => ({
            id: m.model_id,
            name: m.model_id, // Could add prettier names in config if needed
            path: m.model_id
          }));
          setModels(webModels);
          // If current model is not in the new list, select the first one
          if (webModels.length > 0 && !webModels.some(m => m.id === currentModel)) {
            onModelChange(webModels[0].id);
          }
        } else {
          // --- REMOTE: Inference Server Models ---
          const response = await api.getModels();
          let dataToMap = [];
          if (Array.isArray(response)) {
            dataToMap = response;
          } else if (response && Array.isArray(response.data)) {
            dataToMap = response.data;
          }

          const formattedModels = dataToMap.map((model: any) => ({
            id: typeof model === 'string' ? model : model.id || model.name || model,
            name: typeof model === 'string' ? model : model.name || model.id || model,
            path: typeof model === 'string' ? model : model.path,
          }));

          setModels(formattedModels);
          // If current model is not in the new list, select the first one
          if (formattedModels.length > 0 && !formattedModels.some((m: any) => m.id === currentModel)) {
            onModelChange(formattedModels[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
        setError('Failed to load models.');
        if (isRemote) {
          setModels([{ id: 'default', name: 'Default Model (GLM-4)', path: 'default' }]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [isRemote]); // Re-run when mode changes

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedModelId = e.target.value;
    onModelChange(selectedModelId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
        <span className="ml-2 text-xs text-gray-500">Loading models...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <label htmlFor="model-select" className="block text-xs font-mono uppercase tracking-wider text-gray-500 mb-1">
        Select Model
      </label>
      <select
        id="model-select"
        value={currentModel}
        onChange={handleChange}
        className="w-full bg-black/50 border border-gray-700/50 rounded-md px-3 py-2 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono text-xs text-cyan-100"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      {error && (
        <div className="mt-1 text-xs text-red-500 font-mono">
          {error}
        </div>
      )}
    </div>
  );
};