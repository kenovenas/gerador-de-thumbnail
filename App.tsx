import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { generateHeadlineVariations, generateThumbnailPrompt, generateFinalImage } from './services/geminiService';
import { Step, AppState, UploadedImage, TextElement, HeadlineVariation } from './types';
import { FONTS, STYLES } from './constants';
import StepCard from './components/StepCard';
import LoadingSpinner from './components/LoadingSpinner';
import PromptDisplay from './components/PromptDisplay';

const highlightKeywords = (text: string, keywords: string[]) => {
  if (!keywords || keywords.length === 0) {
    return text;
  }

  const escapedKeywords = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (escapedKeywords.length === 0) {
      return text;
  }
  
  const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <React.Fragment>
      {parts.map((part, index) => {
        const isKeyword = keywords.some(kw => kw.toLowerCase() === part.toLowerCase());
        return isKeyword ? (
          <span key={index} className="text-indigo-400 font-bold">
            {part}
          </span>
        ) : (
          part
        );
      })}
    </React.Fragment>
  );
};

// Helper function to create more user-friendly API error messages
const getApiErrorMessage = (error: unknown, contextMessage: string): string => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("quota") || message.includes("resource_exhausted") || message.includes("429")) {
      return "Você excedeu sua cota de uso da API do Gemini. Verifique se sua chave de API está configurada com um plano de faturamento no Google AI Studio ou Google Cloud, pois a API gratuita tem limites rígidos.";
    }
     if (message.includes("api key not valid")) {
      return "Sua chave de API parece ser inválida. Verifique se copiou a chave corretamente.";
    }
    // Return the original error message if it exists, otherwise the context message
    return error.message || contextMessage;
  }
  return contextMessage;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    currentStep: Step.HEADLINE_INPUT,
    originalHeadline: '',
    headlineVariations: [],
    selectedHeadline: '',
    selectedStyle: '',
    uploadedImages: [],
    finalPrompt: null,
    generatedImage: null,
    isLoading: false,
    error: null,
    textElements: [],
    activeTextElementId: null,
    aspectRatio: '16:9',
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini-api-key') || '');
  const [tempApiKey, setTempApiKey] = useState(() => localStorage.getItem('gemini-api-key') || '');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [customStyle, setCustomStyle] = useState('');
  const [modificationPrompt, setModificationPrompt] = useState('');
  const imageRef = useRef<HTMLImageElement>(null);
  const textElementRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const dragInfo = useRef({
    isDragging: false,
    elementId: null as string | null,
    startPos: { x: 0, y: 0 },
    elementStartPos: { x: 0, y: 0 },
  });
    const resizeInfo = useRef({
    isResizing: false,
    elementId: null as string | null,
    handle: null as 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w' | null,
    startPos: { x: 0, y: 0 },
    startFontSize: 0,
    startWidth: 0,
    startRotation: 0,
    startPosition: { x: 0, y: 0 },
  });

  const textElementDeps = JSON.stringify(appState.textElements.map(el => ({ id: el.id, text: el.text, width: el.width, fontSize: el.fontSize, lineHeight: el.lineHeight, letterSpacing: el.letterSpacing, fontFamily: el.fontFamily })));

  useEffect(() => {
    const timeoutId = setTimeout(() => {
        let needsUpdate = false;
        const updates: Record<string, { height: number }> = {};

        appState.textElements.forEach(el => {
            const node = textElementRefs.current[el.id];
            if (node) {
                const currentHeight = node.scrollHeight;
                if (currentHeight > 0 && Math.abs(currentHeight - el.height) > 1) {
                    updates[el.id] = { height: currentHeight };
                    needsUpdate = true;
                }
            }
        });

        if (needsUpdate) {
            setAppState(prev => ({
                ...prev,
                textElements: prev.textElements.map(el =>
                    updates[el.id] ? { ...el, ...updates[el.id] } : el
                ),
            }));
        }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [textElementDeps]); // Intentionally using the stringified dependency


  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = tempApiKey.trim();
    if (trimmedKey) {
        localStorage.setItem('gemini-api-key', trimmedKey);
        setApiKey(trimmedKey);
        // Clear any previous errors when a new key is saved
        setAppState(prev => ({ ...prev, error: null }));
    }
  };

  const handleHeadlineSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!apiKey) {
      setAppState(prev => ({ ...prev, error: 'Por favor, insira e salve sua chave de API do Google Gemini para continuar.' }));
      return;
    }
    const formData = new FormData(e.currentTarget);
    const headline = formData.get('headline') as string;
    if (!headline.trim()) return;

    setAppState(prev => ({ ...prev, isLoading: true, error: null, originalHeadline: headline }));

    try {
      const variations = await generateHeadlineVariations(headline, apiKey);
      setAppState(prev => ({
        ...prev,
        isLoading: false,
        headlineVariations: variations,
        currentStep: Step.HEADLINE_SELECTION,
      }));
    } catch (err) {
      console.error(err);
      const errorMessage = getApiErrorMessage(err, 'Falha ao gerar variações de headline. Tente novamente.');
      setAppState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  };

  const handleHeadlineSelection = (headline: string) => {
    setAppState(prev => ({
      ...prev,
      selectedHeadline: headline,
      currentStep: Step.STYLE_SELECTION,
    }));
  };

  const handleStyleSelection = (style: string) => {
    setAppState(prev => ({
      ...prev,
      selectedStyle: style,
      currentStep: Step.IMAGE_UPLOAD,
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // FIX: Explicitly type `file` as `File` to prevent TypeScript from inferring it as `unknown`.
    // This resolves errors when accessing `file.type` and passing `file` to `readAsDataURL`.
    const filePromises = Array.from(files).map((file: File) => {
      return new Promise<UploadedImage>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          const mimeType = file.type;
          const data = base64String.split(',')[1];
          resolve({ data, mimeType });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises)
      .then(newImages => {
        setAppState(prev => ({
          ...prev,
          uploadedImages: [...prev.uploadedImages, ...newImages],
        }));
      })
      .catch(err => {
        console.error("Error reading files:", err);
        setAppState(prev => ({ ...prev, error: "Falha ao carregar uma ou mais imagens." }));
      });

    e.target.value = ''; // Allow re-uploading the same file(s)
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setAppState(prev => ({
      ...prev,
      uploadedImages: prev.uploadedImages.filter((_, index) => index !== indexToRemove)
    }));
  };


  const handleGenerateFinalImage = async () => {
    if (!apiKey) {
      setAppState(prev => ({ ...prev, error: 'Por favor, insira e salve sua chave de API do Google Gemini para continuar.' }));
      return;
    }
    setAppState(prev => ({ ...prev, isLoading: true, error: null, currentStep: Step.PROMPT_GENERATION }));
    try {
      setLoadingMessage('Gerando prompt de arte...');
      const promptResult = await generateThumbnailPrompt(
        appState.selectedHeadline,
        appState.selectedStyle,
        appState.uploadedImages,
        apiKey
      );
      setAppState(prev => ({ ...prev, finalPrompt: promptResult }));

      setLoadingMessage('Criando sua thumbnail mágica...');
      const generatedImageBase64 = await generateFinalImage(
        promptResult.englishPrompt,
        apiKey,
        appState.uploadedImages,
        appState.aspectRatio as any
      );

      const defaultTextElement: TextElement = {
        id: `text-${Date.now()}`,
        text: appState.selectedHeadline.toUpperCase(),
        fontFamily: FONTS[0].value, // Anton for impact
        fontSize: 80,
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 4,
        position: { x: 50, y: 50 }, // Start near top-left
        letterSpacing: 0,
        lineHeight: 1.2,
        shadowColor: '#000000',
        shadowBlur: 5,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
        useGradient: false,
        gradientColor1: '#FFFF00',
        gradientColor2: '#FF8A00',
        gradientAngle: 90,
        rotation: 0,
        width: 700,
        height: 100, // Initial estimate
        textAlign: 'left',
      };

      setAppState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: generatedImageBase64,
        currentStep: Step.TEXT_EDITING,
        textElements: [defaultTextElement],
        activeTextElementId: defaultTextElement.id,
      }));

    } catch (err) {
      console.error(err);
      const errorMessage = getApiErrorMessage(err, 'Falha ao gerar a thumbnail. Tente novamente.');
      setAppState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        currentStep: Step.IMAGE_UPLOAD,
      }));
    } finally {
      setLoadingMessage('');
    }
  };

  const handleModifyImage = async () => {
      if (!modificationPrompt.trim() || !appState.generatedImage) return;
      if (!apiKey) {
        setAppState(prev => ({ ...prev, error: 'Por favor, insira e salve sua chave de API do Google Gemini para continuar.' }));
        return;
      }

      setAppState(prev => ({ ...prev, isLoading: true, error: null }));
      setLoadingMessage('Aplicando modificações...');

      try {
        const currentImage: UploadedImage = {
          data: appState.generatedImage,
          mimeType: 'image/png' // Assuming PNG output from generation
        };

        const newImageBase64 = await generateFinalImage(
          modificationPrompt,
          apiKey,
          [currentImage]
        );

        setAppState(prev => ({
          ...prev,
          isLoading: false,
          generatedImage: newImageBase64,
        }));
        setModificationPrompt(''); // Clear input on success

      } catch (err) {
        console.error(err);
        const errorMessage = getApiErrorMessage(err, 'Falha ao modificar a imagem.');
        setAppState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      } finally {
        setLoadingMessage('');
      }
    };


  const handleReset = () => {
    setAppState({
      currentStep: Step.HEADLINE_INPUT,
      originalHeadline: '',
      headlineVariations: [],
      selectedHeadline: '',
      selectedStyle: '',
      uploadedImages: [],
      finalPrompt: null,
      generatedImage: null,
      isLoading: false,
      error: null,
      textElements: [],
      activeTextElementId: null,
      aspectRatio: '16:9',
    });
  };

  const handleAddText = () => {
    const newText: TextElement = {
      id: `text-${Date.now()}`,
      text: 'TEXTO INCRÍVEL',
      fontFamily: FONTS[0].value,
      fontSize: 50,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
      position: { x: 50, y: 150 },
      letterSpacing: 0,
      lineHeight: 1.2,
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      useGradient: false,
      gradientColor1: '#FFFFFF',
      gradientColor2: '#CCCCCC',
      gradientAngle: 90,
      rotation: 0,
      width: 300,
      height: 60, // Initial estimate
      textAlign: 'left',
    };
    setAppState(prev => ({
      ...prev,
      textElements: [...prev.textElements, newText],
      activeTextElementId: newText.id,
    }));
  };

  const handleUpdateActiveTextElement = (updates: Partial<TextElement>) => {
    if (!appState.activeTextElementId) return;
    setAppState(prev => ({
      ...prev,
      textElements: prev.textElements.map(el =>
        el.id === prev.activeTextElementId ? { ...el, ...updates } : el
      ),
    }));
  };

  const handleRemoveActiveTextElement = () => {
    if (!appState.activeTextElementId) return;
    setAppState(prev => ({
      ...prev,
      textElements: prev.textElements.filter(el => el.id !== prev.activeTextElementId),
      activeTextElementId: null,
    }));
  };
  
  const handleDownloadWithText = () => {
    const image = imageRef.current;
    if (!image || !appState.generatedImage) return;

    const canvas = document.createElement('canvas');
    const scale = image.naturalWidth / image.width;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
        if (maxWidth <= 0) return [text];
        const words = text.split(' ');
        if (words.length <= 1) return [text];

        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + ' ' + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width < maxWidth) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    };

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);

      appState.textElements.forEach(textEl => {
        ctx.save();

        const font = `bold ${textEl.fontSize * scale}px ${textEl.fontFamily}`;
        ctx.font = font;
        ctx.letterSpacing = `${textEl.letterSpacing * scale}px`;
        ctx.strokeStyle = textEl.strokeColor;
        ctx.lineWidth = textEl.strokeWidth * scale;
        ctx.textAlign = textEl.textAlign;
        ctx.textBaseline = 'top';

        const initialLines = textEl.text.split('\n');
        const textLines: string[] = [];
        initialLines.forEach(line => {
             textLines.push(...getWrappedLines(ctx, line, textEl.width * scale));
        });
        
        const lineHeight = textEl.fontSize * scale * textEl.lineHeight;

        let maxWidth = 0;
        textLines.forEach(line => {
          const metrics = ctx.measureText(line);
          if (metrics.width > maxWidth) maxWidth = metrics.width;
        });
        const textBlockHeight = (textLines.length - 1) * lineHeight + (textEl.fontSize * scale);

        const x = textEl.position.x * scale;
        const y = textEl.position.y * scale;

        ctx.translate(x, y);
        ctx.rotate(textEl.rotation * Math.PI / 180);

        let drawX = 0;
        if (textEl.textAlign === 'center') {
          drawX = (textEl.width * scale) / 2;
        } else if (textEl.textAlign === 'right') {
          drawX = textEl.width * scale;
        }

        if (textEl.useGradient) {
          const angleRad = (textEl.gradientAngle - 90) * Math.PI / 180;
          const x0 = maxWidth / 2 - Math.cos(angleRad) * maxWidth / 2;
          const y0 = textBlockHeight / 2 - Math.sin(angleRad) * textBlockHeight / 2;
          const x1 = maxWidth / 2 + Math.cos(angleRad) * maxWidth / 2;
          const y1 = textBlockHeight / 2 + Math.sin(angleRad) * textBlockHeight / 2;
          const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
          gradient.addColorStop(0, textEl.gradientColor1);
          gradient.addColorStop(1, textEl.gradientColor2);
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = textEl.color;
        }

        ctx.shadowColor = textEl.shadowColor;
        ctx.shadowBlur = textEl.shadowBlur * scale;
        ctx.shadowOffsetX = textEl.shadowOffsetX * scale;
        ctx.shadowOffsetY = textEl.shadowOffsetY * scale;
        
        textLines.forEach((line, index) => {
          const lineY = index * lineHeight;
          ctx.strokeText(line, drawX, lineY);
          ctx.fillText(line, drawX, lineY);
        });

        ctx.restore();
      });

      const link = document.createElement('a');
      link.download = 'thumbnail_final.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = `data:image/png;base64,${appState.generatedImage}`;
  };
  
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    const element = e.currentTarget;
    const currentElementState = appState.textElements.find(el => el.id === id);
    if (!currentElementState) return;

    dragInfo.current = {
      isDragging: true,
      elementId: id,
      startPos: { x: e.clientX, y: e.clientY },
      elementStartPos: currentElementState.position,
    };
    
    element.style.cursor = 'grabbing';
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragInfo.current.isDragging || dragInfo.current.elementId !== id) return;

      const dx = moveEvent.clientX - dragInfo.current.startPos.x;
      const dy = moveEvent.clientY - dragInfo.current.startPos.y;
      
      setAppState(prev => ({
        ...prev,
        textElements: prev.textElements.map(el =>
          el.id === id
            ? {
                ...el,
                position: {
                  x: dragInfo.current.elementStartPos.x + dx,
                  y: dragInfo.current.elementStartPos.y + dy,
                },
              }
            : el
        ),
      }));
    };

    const handleMouseUp = () => {
      dragInfo.current.isDragging = false;
      dragInfo.current.elementId = null;
      element.style.cursor = 'move';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, id: string, handle: 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w') => {
    e.stopPropagation(); 
    const currentElementState = appState.textElements.find(el => el.id === id);
    if (!currentElementState) return;

    setAppState(prev => ({ ...prev, activeTextElementId: id }));

    resizeInfo.current = {
      isResizing: true,
      elementId: id,
      handle,
      startPos: { x: e.clientX, y: e.clientY },
      startFontSize: currentElementState.fontSize,
      startWidth: currentElementState.width,
      startRotation: currentElementState.rotation,
      startPosition: currentElementState.position,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeInfo.current.isResizing || resizeInfo.current.elementId !== id) return;

      const dx = moveEvent.clientX - resizeInfo.current.startPos.x;
      const dy = moveEvent.clientY - resizeInfo.current.startPos.y;
      
      setAppState(prev => {
          const newTextElements = prev.textElements.map(el => {
              if (el.id !== id) return el;
              
              const startState = resizeInfo.current;
              const angle = startState.startRotation * Math.PI / 180;
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);

              // De-rotate the mouse delta to align with the element's coordinate system
              const rotatedDx = dx * cos + dy * sin;
              const rotatedDy = -dx * sin + dy * cos;

              switch(startState.handle) {
                // Corner handles adjust font size for intuitive scaling
                case 'se': {
                  const change = (rotatedDx + rotatedDy) / 4;
                  const newFontSize = Math.max(10, Math.round(startState.startFontSize + change));
                  return { ...el, fontSize: newFontSize };
                }
                 case 'sw': {
                  const change = (-rotatedDx + rotatedDy) / 4;
                  const newFontSize = Math.max(10, Math.round(startState.startFontSize + change));
                  return { ...el, fontSize: newFontSize };
                }
                case 'ne': {
                  const change = (rotatedDx - rotatedDy) / 4;
                  const newFontSize = Math.max(10, Math.round(startState.startFontSize + change));
                  return { ...el, fontSize: newFontSize };
                }
                case 'nw': {
                  const change = (-rotatedDx - rotatedDy) / 4;
                  const newFontSize = Math.max(10, Math.round(startState.startFontSize + change));
                  return { ...el, fontSize: newFontSize };
                }

                // Side handles adjust width
                case 'e': {
                  const newWidth = Math.max(50, Math.round(startState.startWidth + rotatedDx));
                  return { ...el, width: newWidth };
                }
                case 'w': {
                    const newWidth = Math.max(50, Math.round(startState.startWidth - rotatedDx));
                    // To make the element resize from the left, we need to shift its position
                    const newPosition = {
                        x: startState.startPosition.x + rotatedDx * cos,
                        y: startState.startPosition.y + rotatedDx * sin,
                    };
                    return { ...el, width: newWidth, position: newPosition };
                }
                default:
                    return el;
              }
          });
          return { ...prev, textElements: newTextElements };
      });
    };

    const handleMouseUp = () => {
      resizeInfo.current.isResizing = false;
      resizeInfo.current.elementId = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const headlineOptions = useMemo(() => {
    const original: HeadlineVariation = { text: appState.originalHeadline, keywords: [] };
    return [original, ...appState.headlineVariations].filter(h => h.text);
  }, [appState.originalHeadline, appState.headlineVariations]);
  const activeTextElement = useMemo(() => appState.textElements.find(el => el.id === appState.activeTextElementId), [appState.textElements, appState.activeTextElementId]);

  const aspectRatioOptions = [
      { value: '16:9', label: 'Thumbnail (16:9)', icon: 'fa-solid fa-tv' },
      { value: '9:16', label: 'Story (9:16)', icon: 'fa-solid fa-mobile-screen-button' },
      { value: '1:1', label: 'Quadrado (1:1)', icon: 'fa-solid fa-square' },
      { value: '4:3', label: 'Clássico (4:3)', icon: 'fa-solid fa-display' },
      { value: '3:4', label: 'Retrato (3:4)', icon: 'fa-solid fa-portrait' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            Gerador de Thumbnail Viral
          </h1>
          <p className="text-gray-500 mt-1 text-sm">By Adriano Santos</p>
          <p className="text-gray-400 mt-2 text-lg">
            Seu diretor de arte de IA para thumbnails de alto impacto.
          </p>
        </header>

        <main className="space-y-6">
          <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6">
              <div className="flex items-center mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${apiKey ? 'bg-green-600' : 'bg-yellow-600'} text-white font-bold text-sm mr-4`}>
                  <i className={`fas ${apiKey ? 'fa-check' : 'fa-key'}`}></i>
                </div>
                <h2 className="text-xl font-bold text-white">Sua Chave de API Gemini</h2>
              </div>
              <div className="pl-12">
                <p className="text-gray-400 text-sm mb-3">
                  Para usar esta ferramenta, você precisa de uma chave de API do Google Gemini. A chave é salva localmente no seu navegador.
                  {' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                    Obtenha sua chave aqui.
                  </a>
                </p>
                <form onSubmit={handleSaveApiKey} className="flex items-center gap-3">
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="Cole sua chave de API aqui"
                    className="flex-grow bg-gray-700 border-2 border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-md transition"
                  >
                    Salvar
                  </button>
                </form>
              </div>
            </div>

          {appState.error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative" role="alert">
              <strong className="font-bold">Oops! </strong>
              <span className="block sm:inline">{appState.error}</span>
            </div>
          )}
          
          <StepCard
            stepNumber={1}
            title="Insira a Headline do Vídeo"
            isActive={appState.currentStep === Step.HEADLINE_INPUT}
            isComplete={appState.currentStep > Step.HEADLINE_INPUT}
          >
            {appState.currentStep === Step.HEADLINE_INPUT && (
              <form onSubmit={handleHeadlineSubmit}>
                <input
                  type="text"
                  name="headline"
                  placeholder="Ex: Como eu fiz meu primeiro milhão..."
                  className="w-full bg-gray-800 border-2 border-gray-700 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  required
                />
                <button
                  type="submit"
                  disabled={appState.isLoading || !apiKey}
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                >
                  {!apiKey ? 'Insira a Chave de API para continuar' : (appState.isLoading ? <LoadingSpinner /> : 'Analisar e Gerar Variações')}
                </button>
              </form>
            )}
          </StepCard>

          <StepCard
            stepNumber={2}
            title="Escolha a Melhor Headline"
            isActive={appState.currentStep === Step.HEADLINE_SELECTION}
            isComplete={appState.currentStep > Step.HEADLINE_SELECTION}
          >
            {appState.currentStep === Step.HEADLINE_SELECTION && (
              <div className="space-y-3">
                <p className="text-gray-400 mb-2">Selecione a headline que será usada na thumbnail. As palavras-chave estão <span className="text-indigo-400 font-bold">destacadas</span> para você.</p>
                {headlineOptions.map((headline, index) => (
                  <button
                    key={index}
                    onClick={() => handleHeadlineSelection(headline.text)}
                    className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md transition"
                  >
                    {headline.text === appState.originalHeadline ? <span className="font-bold text-purple-400">[Original] </span> : ''}
                    {highlightKeywords(headline.text, headline.keywords)}
                  </button>
                ))}
              </div>
            )}
          </StepCard>
          
          <StepCard
            stepNumber={3}
            title="Escolha o Estilo Visual"
            isActive={appState.currentStep === Step.STYLE_SELECTION}
            isComplete={appState.currentStep > Step.STYLE_SELECTION}
          >
            {appState.currentStep === Step.STYLE_SELECTION && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => handleStyleSelection(style.value)}
                      className="p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md transition text-center flex flex-col items-center justify-center h-24"
                    >
                      <span className="text-3xl">{style.icon}</span>
                      <span className="mt-1 text-sm font-semibold">{style.label}</span>
                    </button>
                  ))}
                </div>
                <div className="relative pt-4">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-600" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-gray-800 px-2 text-sm text-gray-400">Ou digite um estilo customizado</span>
                  </div>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (customStyle.trim()) handleStyleSelection(customStyle); }}>
                  <input
                    type="text"
                    value={customStyle}
                    onChange={(e) => setCustomStyle(e.target.value)}
                    placeholder="Ex: Arte com giz de cera, Steampunk, Vaporwave"
                    className="w-full bg-gray-700 border-2 border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={!customStyle.trim()}
                    className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition"
                  >
                    Usar Estilo Customizado
                  </button>
                </form>
              </div>
            )}
          </StepCard>

          <StepCard
            stepNumber={4}
            title={appState.currentStep >= Step.TEXT_EDITING ? "Ajuste Fino da Thumbnail" : "Gere a Imagem Base"}
            isActive={appState.currentStep === Step.IMAGE_UPLOAD || appState.currentStep === Step.TEXT_EDITING}
            isComplete={appState.currentStep > Step.TEXT_EDITING}
          >
            {appState.currentStep === Step.IMAGE_UPLOAD && (
              <div className="space-y-4">
                 <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-800 hover:bg-gray-700">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <i className="fa-solid fa-cloud-arrow-up text-4xl text-gray-400"></i>
                            <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Clique para fazer upload</span> ou arraste e solte</p>
                            <p className="text-xs text-gray-500">PNG, JPG, WEBP (MAX. 5MB)</p>
                        </div>
                        <input id="dropzone-file" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} multiple />
                    </label>
                </div> 

                {appState.uploadedImages.length > 0 && (
                  <div className="mt-4">
                    <p className="font-semibold mb-2 text-gray-300">Imagens Carregadas:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {appState.uploadedImages.map((image, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={`data:${image.mimeType};base64,${image.data}`}
                            alt={`Upload preview ${index + 1}`}
                            className="rounded-md w-full h-24 object-cover"
                          />
                          <button
                            onClick={() => handleRemoveImage(index)}
                            className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remover imagem"
                          >
                            <i className="fa-solid fa-times text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="pt-4 space-y-3">
                  <label className="block text-center text-sm font-medium text-gray-400">Proporção da Imagem</label>
                  <div className="grid grid-cols-5 gap-2">
                      {aspectRatioOptions.map(option => (
                          <button
                              key={option.value}
                              onClick={() => setAppState(prev => ({ ...prev, aspectRatio: option.value }))}
                              className={`p-2 border-2 rounded-lg flex flex-col items-center justify-center transition-all duration-200 ${
                                appState.aspectRatio === option.value
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-gray-700 border-gray-600 hover:border-indigo-500 text-gray-300'
                              }`}
                              title={option.label}
                          >
                              <i className={`${option.icon} text-xl`}></i>
                              <span className="text-xs mt-1">{option.value}</span>
                          </button>
                      ))}
                  </div>
                </div>

                <p className="pt-4 text-center text-gray-500 text-sm">Se não tiver uma imagem de base, não se preocupe! A IA criará uma do zero.</p>
                <button
                  onClick={handleGenerateFinalImage}
                  disabled={appState.isLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                >
                  {appState.isLoading ? <><LoadingSpinner /> {loadingMessage}</> : 'Gerar Imagem Base'}
                </button>
              </div>
            )}
             {appState.currentStep === Step.TEXT_EDITING && appState.generatedImage && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Editor Preview */}
                <div className="md:col-span-2 relative w-full bg-gray-900 rounded-lg overflow-hidden shadow-lg border-2 border-gray-700" style={{aspectRatio: appState.aspectRatio.replace(':', '/')}}>
                  <img ref={imageRef} src={`data:image/png;base64,${appState.generatedImage}`} alt="Generated Thumbnail" className="w-full h-full object-contain" />
                  {appState.textElements.map(el => {
                     const textStyles: React.CSSProperties = {
                        fontFamily: el.fontFamily,
                        fontSize: `${el.fontSize}px`,
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        WebkitTextStroke: `${el.strokeWidth}px ${el.strokeColor}`,
                        paintOrder: 'stroke fill',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        letterSpacing: `${el.letterSpacing}px`,
                        lineHeight: el.lineHeight,
                        textShadow: `${el.shadowOffsetX}px ${el.shadowOffsetY}px ${el.shadowBlur}px ${el.shadowColor}`,
                        textAlign: el.textAlign,
                      };

                      if (el.useGradient) {
                        textStyles.background = `linear-gradient(${el.gradientAngle}deg, ${el.gradientColor1}, ${el.gradientColor2})`;
                        textStyles.WebkitBackgroundClip = 'text';
                        textStyles.color = 'transparent';
                      } else {
                        textStyles.color = el.color;
                      }

                    return (
                    <div
                      key={el.id}
                      className="absolute"
                      style={{
                        left: 0,
                        top: 0,
                        width: `${el.width}px`,
                        height: `${el.height}px`,
                        transform: `translate(${el.position.x}px, ${el.position.y}px) rotate(${el.rotation}deg)`,
                        transformOrigin: 'top left',
                        border: appState.activeTextElementId === el.id ? '2px dashed #818cf8' : '2px dashed transparent',
                        padding: '2px',
                        cursor: 'move',
                        userSelect: 'none',
                      }}
                       onMouseDown={(e) => {
                        handleDragStart(e, el.id);
                        setAppState(prev => ({...prev, activeTextElementId: el.id}));
                      }}
                    >
                      {/* FIX: The ref callback function was implicitly returning the assigned `node`, which is not permitted by React's `ref` prop type. Encapsulating the assignment in curly braces `{}` ensures the function returns `undefined` and resolves the type error. */}
                      <div ref={node => { textElementRefs.current[el.id] = node; }} style={textStyles}>
                         {el.text || ' '}
                      </div>
                      {appState.activeTextElementId === el.id && (
                        <>
                          {/* Corner Handles */}
                          <div
                            className="absolute -top-2 -left-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-nwse-resize"
                            onMouseDown={(e) => handleResizeStart(e, el.id, 'nw')}
                          />
                           <div
                            className="absolute -top-2 -right-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-nesw-resize"
                            onMouseDown={(e) => handleResizeStart(e, el.id, 'ne')}
                          />
                          <div
                            className="absolute -bottom-2 -left-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-nesw-resize"
                            onMouseDown={(e) => handleResizeStart(e, el.id, 'sw')}
                          />
                          <div
                            className="absolute -bottom-2 -right-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-nwse-resize"
                            onMouseDown={(e) => handleResizeStart(e, el.id, 'se')}
                          />

                          {/* Side Handles */}
                          <div
                              className="absolute top-1/2 -right-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-ew-resize"
                              style={{ transform: 'translateY(-50%)' }}
                              onMouseDown={(e) => handleResizeStart(e, el.id, 'e')}
                            />
                            <div
                              className="absolute top-1/2 -left-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-ew-resize"
                              style={{ transform: 'translateY(-50%)' }}
                              onMouseDown={(e) => handleResizeStart(e, el.id, 'w')}
                            />
                        </>
                      )}
                    </div>
                  )})}
                </div>

                {/* Controls */}
                <div className="md:col-span-1 bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4 overflow-y-auto max-h-[60vh]">
                  <button onClick={handleAddText} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 flex items-center justify-center">
                    <i className="fa-solid fa-plus mr-2"></i> Adicionar Texto
                  </button>
                  {activeTextElement ? (
                    <div className="space-y-4 divide-y divide-gray-700">
                      <div className="pt-2">
                        <label className="block text-sm font-medium text-gray-400">Texto</label>
                        <textarea
                            value={activeTextElement.text}
                            onChange={e => handleUpdateActiveTextElement({ text: e.target.value.toUpperCase() })}
                            className="w-full mt-1 bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={3}
                        />
                      </div>
                      <div className="pt-4">
                         <h3 className="text-sm font-bold text-gray-300 mb-2">Fonte</h3>
                        <select value={activeTextElement.fontFamily} onChange={e => handleUpdateActiveTextElement({ fontFamily: e.target.value })} className="w-full mt-1 bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500">
                          {FONTS.map(font => <option key={font.name} value={font.value}>{font.name}</option>)}
                        </select>
                        <label className="block text-sm font-medium text-gray-400 mt-2">Tamanho ({activeTextElement.fontSize}px)</label>
                        <input type="range" min="10" max="200" value={activeTextElement.fontSize} onChange={e => handleUpdateActiveTextElement({ fontSize: parseInt(e.target.value) })} className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                        <label className="block text-sm font-medium text-gray-400 mt-2">Espaçamento Letras ({activeTextElement.letterSpacing}px)</label>
                        <input type="range" min="-10" max="25" value={activeTextElement.letterSpacing} onChange={e => handleUpdateActiveTextElement({ letterSpacing: parseInt(e.target.value) })} className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                        <label className="block text-sm font-medium text-gray-400 mt-2">Altura Linha ({activeTextElement.lineHeight.toFixed(1)})</label>
                        <input type="range" min="0.8" max="3" step="0.1" value={activeTextElement.lineHeight} onChange={e => handleUpdateActiveTextElement({ lineHeight: parseFloat(e.target.value) })} className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                         <div className="flex items-center justify-between mt-3">
                            <label className="block text-sm font-medium text-gray-400">Alinhamento</label>
                            <div className="flex items-center space-x-1 bg-gray-900/50 p-1 rounded-md">
                                <button
                                    onClick={() => handleUpdateActiveTextElement({ textAlign: 'left' })}
                                    className={`px-3 py-1 text-sm rounded transition-colors ${activeTextElement.textAlign === 'left' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                    aria-label="Alinhar à esquerda"
                                    title="Alinhar à esquerda"
                                >
                                    <i className="fa-solid fa-align-left"></i>
                                </button>
                                <button
                                    onClick={() => handleUpdateActiveTextElement({ textAlign: 'center' })}
                                    className={`px-3 py-1 text-sm rounded transition-colors ${activeTextElement.textAlign === 'center' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                    aria-label="Centralizar"
                                    title="Centralizar"
                                >
                                    <i className="fa-solid fa-align-center"></i>
                                </button>
                                <button
                                    onClick={() => handleUpdateActiveTextElement({ textAlign: 'right' })}
                                    className={`px-3 py-1 text-sm rounded transition-colors ${activeTextElement.textAlign === 'right' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                    aria-label="Alinhar à direita"
                                    title="Alinhar à direita"
                                >
                                    <i className="fa-solid fa-align-right"></i>
                                </button>
                            </div>
                        </div>
                      </div>
                       <div className="pt-4">
                          <h3 className="text-sm font-bold text-gray-300 mb-2">Cor</h3>
                           <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={activeTextElement.useGradient} onChange={e => handleUpdateActiveTextElement({ useGradient: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-400">Usar Gradiente</span>
                          </label>
                          {activeTextElement.useGradient ? (
                            <div className="mt-2 space-y-2">
                               <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-gray-400">Cor 1</label>
                                  <input type="color" value={activeTextElement.gradientColor1} onChange={e => handleUpdateActiveTextElement({ gradientColor1: e.target.value })} className="w-full mt-1 h-10 bg-gray-700 border-gray-600 rounded-md p-1" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-400">Cor 2</label>
                                  <input type="color" value={activeTextElement.gradientColor2} onChange={e => handleUpdateActiveTextElement({ gradientColor2: e.target.value })} className="w-full mt-1 h-10 bg-gray-700 border-gray-600 rounded-md p-1" />
                                </div>
                              </div>
                              <label className="block text-sm font-medium text-gray-400">Ângulo ({activeTextElement.gradientAngle}°)</label>
                              <input type="range" min="0" max="360" value={activeTextElement.gradientAngle} onChange={e => handleUpdateActiveTextElement({ gradientAngle: parseInt(e.target.value) })} className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                            </div>
                          ) : (
                            <div className="mt-2">
                              <label className="block text-sm font-medium text-gray-400">Cor Sólida</label>
                              <input type="color" value={activeTextElement.color} onChange={e => handleUpdateActiveTextElement({ color: e.target.value })} className="w-full mt-1 h-10 bg-gray-700 border-gray-600 rounded-md p-1" />
                            </div>
                          )}
                       </div>
                       <div className="pt-4">
                          <h3 className="text-sm font-bold text-gray-300 mb-2">Contorno</h3>
                           <input type="color" value={activeTextElement.strokeColor} onChange={e => handleUpdateActiveTextElement({ strokeColor: e.target.value })} className="w-full mt-1 h-10 bg-gray-700 border-gray-600 rounded-md p-1" />
                           <label className="block text-sm font-medium text-gray-400 mt-2">Largura Contorno ({activeTextElement.strokeWidth}px)</label>
                           <input type="range" min="0" max="15" value={activeTextElement.strokeWidth} onChange={e => handleUpdateActiveTextElement({ strokeWidth: parseInt(e.target.value) })} className="w-full mt-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                       </div>
                        <div className="pt-4">
                          <h3 className="text-sm font-bold text-gray-300 mb-2">Sombra</h3>
                          <label className="block text-sm font-medium text-gray-400">Cor</label>
                          <input type="color" value={activeTextElement.shadowColor} onChange={e => handleUpdateActiveTextElement({ shadowColor: e.target.value })} className="w-full mt-1 h-10 bg-gray-700 border-gray-600 rounded-md p-1" />
                          <label className="block text-sm font-medium text-gray-400 mt-2">Desfoque ({activeTextElement.shadowBlur}px)</label>
                          <input type="range" min="0" max="50" value={activeTextElement.shadowBlur} onChange={e => handleUpdateActiveTextElement({ shadowBlur: parseInt(e.target.value) })} className="w-full mt-1" />
                          <label className="block text-sm font-medium text-gray-400 mt-2">Offset X ({activeTextElement.shadowOffsetX}px)</label>
                          <input type="range" min="-50" max="50" value={activeTextElement.shadowOffsetX} onChange={e => handleUpdateActiveTextElement({ shadowOffsetX: parseInt(e.target.value) })} className="w-full mt-1" />
                          <label className="block text-sm font-medium text-gray-400 mt-2">Offset Y ({activeTextElement.shadowOffsetY}px)</label>
                          <input type="range" min="-50" max="50" value={activeTextElement.shadowOffsetY} onChange={e => handleUpdateActiveTextElement({ shadowOffsetY: parseInt(e.target.value) })} className="w-full mt-1" />
                        </div>
                         <div className="pt-4">
                          <h3 className="text-sm font-bold text-gray-300 mb-2">Transformação</h3>
                          <label className="block text-sm font-medium text-gray-400">Rotação ({activeTextElement.rotation}°)</label>
                          <input type="range" min="-45" max="45" value={activeTextElement.rotation} onChange={e => handleUpdateActiveTextElement({ rotation: parseInt(e.target.value) })} className="w-full mt-1" />
                        </div>
                      <div className="pt-4">
                        <button onClick={handleRemoveActiveTextElement} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 flex items-center justify-center">
                           <i className="fa-solid fa-trash mr-2"></i> Remover Texto
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 p-4 border-2 border-dashed border-gray-700 rounded-lg">
                      <p>Clique em "Adicionar Texto" para começar ou selecione um texto na imagem para editar.</p>
                    </div>
                  )}
                </div>

                 <div className="md:col-span-3 mt-4 space-y-4">
                    {appState.finalPrompt && (
                      <PromptDisplay prompt={appState.finalPrompt} />
                    )}
                    
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                        <h3 className="text-base font-bold text-gray-200">
                          <i className="fa-solid fa-wand-magic-sparkles mr-2 text-indigo-400"></i>
                          Modificar Imagem
                        </h3>
                        <p className="text-sm text-gray-400">Descreva a alteração que você quer fazer na imagem atual (em português).</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={modificationPrompt}
                                onChange={(e) => setModificationPrompt(e.target.value)}
                                placeholder="Ex: adicione um chapéu de pirata, mude o fundo para uma praia"
                                className="w-full bg-gray-700 border-2 border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 transition"
                                disabled={appState.isLoading}
                            />
                            <button
                                onClick={handleModifyImage}
                                disabled={appState.isLoading || !modificationPrompt.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md flex items-center justify-center"
                                title="Aplicar Modificação"
                            >
                                {appState.isLoading && loadingMessage === 'Aplicando modificações...' ? <LoadingSpinner /> : <i className="fa-solid fa-arrow-right"></i>}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                       <button
                        onClick={handleDownloadWithText}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                      >
                        <i className="fa-solid fa-download mr-2"></i>
                        Finalizar e Baixar
                      </button>
                      <button
                        onClick={handleGenerateFinalImage}
                        disabled={appState.isLoading}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center disabled:bg-purple-900/50 disabled:cursor-not-allowed"
                      >
                        <i className="fa-solid fa-arrows-rotate mr-2"></i>
                        Gerar Novamente
                      </button>
                      <button
                        onClick={handleReset}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                      >
                        <i className="fa-solid fa-arrow-rotate-left mr-2"></i>
                        Começar Novamente
                      </button>
                    </div>
                  </div>
              </div>
            )}
          </StepCard>

          {appState.isLoading && appState.currentStep === Step.PROMPT_GENERATION && (
             <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 animate-fade-in flex flex-col items-center justify-center">
                <h2 className="text-2xl font-bold text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                    <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
                    Gerando sua Thumbnail...
                </h2>
                <div className="flex flex-col items-center justify-center p-8">
                  <LoadingSpinner />
                  <p className="text-gray-300 mt-4 text-lg animate-pulse">{loadingMessage}</p>
                </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default App;