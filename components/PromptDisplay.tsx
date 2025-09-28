
import React, { useState } from 'react';
import { FinalPrompt } from '../types';

interface PromptDisplayProps {
  prompt: FinalPrompt;
}

const PromptDisplay: React.FC<PromptDisplayProps> = ({ prompt }) => {
  const [copyText, setCopyText] = useState('Copiar com 1 clique');

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.englishPrompt).then(() => {
      setCopyText('Copiado!');
      setTimeout(() => setCopyText('Copiar com 1 clique'), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      setCopyText('Falha ao copiar');
       setTimeout(() => setCopyText('Copiar com 1 clique'), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-bold text-gray-400">Prompt em Inglês (para a IA de imagem)</label>
        <div className="relative mt-1">
          <div className="bg-gray-900 border border-gray-600 rounded-lg p-4 pr-28 text-gray-300 font-mono text-sm whitespace-pre-wrap">
            {prompt.englishPrompt}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-1/2 right-3 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-md text-xs transition-all duration-200"
          >
            <i className={`fa-solid ${copyText === 'Copiado!' ? 'fa-check' : 'fa-copy'} mr-2`}></i>
            {copyText}
          </button>
        </div>
      </div>
      <div>
         <details className="text-sm text-gray-500">
            <summary className="cursor-pointer font-medium hover:text-gray-400">Ver tradução em Português</summary>
            <div className="mt-2 p-4 bg-gray-900/50 border border-gray-700 rounded-lg text-gray-400 italic">
                {prompt.portugueseTranslation}
            </div>
        </details>
      </div>
    </div>
  );
};

export default PromptDisplay;
