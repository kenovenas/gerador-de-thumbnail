import { GoogleGenAI, Type, Modality } from "@google/genai";
import { FinalPrompt, UploadedImage, HeadlineVariation } from '../types';

const textModel = "gemini-2.5-flash";

export const generateHeadlineVariations = async (originalHeadline: string, apiKey: string): Promise<HeadlineVariation[]> => {
  if (!apiKey) {
    throw new Error("A chave de API do Gemini não foi fornecida.");
  }
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: textModel,
    contents: `Você é um especialista em marketing para YouTube. Dado o título de vídeo "${originalHeadline}", gere 4 variações de headlines mais curtas, impactantes e com alto potencial de clique, em português. Para cada variação, identifique as palavras-chave (keywords) que a tornam poderosa.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          variations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                headline: {
                  type: Type.STRING,
                  description: "A variação da headline."
                },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "As palavras-chave que tornam a headline impactante."
                }
              },
              propertyOrdering: ["headline", "keywords"],
            }
          }
        }
      }
    }
  });

  try {
    const jsonResponse = JSON.parse(response.text);
    return (jsonResponse.variations || []).map((v: { headline: string, keywords: string[] }) => ({
      text: v.headline,
      keywords: v.keywords,
    }));
  } catch (e) {
    console.error("Failed to parse headline variations JSON:", e);
    // Fallback if JSON is malformed
    return response.text.split('\n').map(line => ({ text: line.trim().replace(/^- /, ''), keywords: [] })).filter(v => v.text);
  }
};

export const generateThumbnailPrompt = async (
  headline: string,
  style: string,
  images: UploadedImage[],
  apiKey: string,
): Promise<FinalPrompt> => {
  if (!apiKey) {
    throw new Error("A chave de API do Gemini não foi fornecida.");
  }
  const ai = new GoogleGenAI({ apiKey });

  const isEditing = images.length > 0;

  const imageContext = isEditing
    ? `O usuário forneceu ${images.length} imagem(ns) para usar como assunto(s) principal(is). Sua tarefa é gerar um conjunto de instruções de edição claras e concisas em INGLÊS. Essas instruções devem explicar como combinar os assuntos das imagens fornecidas em uma única cena coesa, aplicando o estilo especificado e o tom emocional inferido da headline.`
    : "O usuário NÃO forneceu uma imagem. Sua tarefa é gerar um prompt descritivo detalhado em INGLÊS para criar uma imagem conceitual adequada e de alto impacto do zero, que se encaixe no tema e siga todas as regras visuais obrigatórias.";

  const systemInstruction = isEditing
  ? `Você é um diretor de arte de IA para thumbnails virais do YouTube. Sua tarefa é gerar um conjunto de INSTRUÇÕES DE EDIÇÃO claras e concisas em INGLÊS para um editor de imagens de IA. A imagem final NÃO deve conter texto. O "Estilo Visual" especificado pelo usuário é a instrução mais importante.

  REGRAS OBRIGATÓRIAS PARA AS INSTRUÇÕES:
  1.  **Formato Instrucional:** A saída deve ser um comando direto, por exemplo: "Combine the subjects from the images. Place the person on the left and the object on the right. Change the background to a dramatic, stormy sky. Apply a '${style}' aesthetic to the entire image. The overall mood should reflect the tone of the headline."
  2.  **Combinar Assuntos:** Dê instruções claras sobre como mesclar os assuntos das imagens fornecidas.
  3.  **Aplicar Estilo e Emoção:** As instruções devem declarar explicitamente para aplicar a estética "${style}" e transmitir o tom emocional implícito na headline.
  4.  **Composição e Fundo:** Forneça direções claras sobre composição, alterações de fundo e iluminação para criar uma thumbnail de alto contraste e legível.
  5.  **Proporção:** A instrução deve especificar que a imagem final precisa ter uma proporção de 16:9.
  6.  **SEM TEXTO:** As instruções devem lembrar a IA que a imagem final deve ser puramente visual e NÃO conter texto.`
  : `Você é um diretor de arte de IA para thumbnails virais do YouTube. Sua tarefa é gerar um PROMPT DESCRITIVO detalhado em INGLÊS para um gerador de imagens de IA. A imagem gerada NÃO deve conter texto. O "Estilo Visual" especificado pelo usuário é o princípio orientador mais importante para toda a composição da imagem.

  REGRAS VISUAIS OBRIGATÓRIAS (aplique-as dentro do estilo escolhido):
  1.  **Estilo Visual:** A imagem INTEIRA deve aderir estritamente à estética "${style}". Isso influencia cores, iluminação, representação do assunto e humor geral. Esta é a principal prioridade.
  2.  **Emoção:** A cena deve irradiar poderosamente a emoção implícita na headline. A expressão do assunto e a atmosfera devem transmitir isso.
  3.  **Assunto Principal:** Descreva um assunto central de alta resolução. Deve ser o ponto focal claro, nitidamente definido e visualmente atraente.
  4.  **Alto Contraste e Legibilidade:** Garanta um contraste extremo entre o assunto em primeiro plano e o fundo. A thumbnail deve ser instantaneamente compreensível mesmo quando pequena.
  5.  **Paleta de Cores:** Use uma paleta de cores vibrante e que chame a atenção, consistente com o **Estilo Visual** e a emoção inferida da headline.
  6.  **Fundo:** O fundo deve ser temático, mas não distrativo, usando profundidade de campo (desfoque) para destacar o assunto principal.
  7.  **Composição:** O prompt final deve descrever uma fotografia 8K dinâmica, cinematográfica e ultrarrealista, com proporção 16:9.
  8.  **SEM TEXTO:** A imagem gerada deve ser puramente visual e NÃO conter texto, letras ou números.`;

  const finalSystemInstruction = `${systemInstruction}

  ENTRADA DO USUÁRIO (para contexto):
  -   **Headline:** "${headline}"
  -   **Estilo Visual:** "${style}"
  -   **Contexto da Imagem:** ${imageContext}
  `;

  const contents = images.length > 0
    ? {
        parts: [
          ...images.map(image => ({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
            },
          })),
          { text: "Use os assuntos dessas imagens para criar as instruções de edição." },
        ],
      }
    : "Gere o prompt com base nas instruções do sistema sem uma imagem fornecida pelo usuário.";

  const response = await ai.models.generateContent({
    model: textModel,
    contents,
    config: {
      systemInstruction: finalSystemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          englishPrompt: {
            type: Type.STRING,
            description: "O prompt detalhado ou as instruções para o gerador de imagem, em inglês."
          },
          portugueseTranslation: {
            type: Type.STRING,
            description: "Uma tradução direta do englishPrompt para verificação do usuário."
          }
        }
      }
    }
  });

  try {
    const jsonResponse: FinalPrompt = JSON.parse(response.text);
    return jsonResponse;
  } catch(e) {
    console.error("Failed to parse final prompt JSON:", e);
    throw new Error("A resposta da IA não estava no formato esperado.");
  }
};

export const generateFinalImage = async (
  prompt: string,
  apiKey: string,
  baseImages: UploadedImage[] = [],
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '16:9'
): Promise<string> => { 
  if (!apiKey) {
    throw new Error("A chave de API do Gemini não foi fornecida.");
  }
  const ai = new GoogleGenAI({ apiKey });

  if (baseImages.length > 0) {
    // Edita a imagem usando gemini-2.5-flash-image-preview
    const imageParts = baseImages.map(image => ({
        inlineData: {
            data: image.data,
            mimeType: image.mimeType,
        }
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [
          ...imageParts,
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart?.inlineData) {
      return imagePart.inlineData.data;
    }
    
    // Se nenhuma imagem for encontrada, verifica se há uma explicação em texto.
    const textPart = response.candidates?.[0]?.content?.parts?.find(part => part.text);
    if (textPart?.text) {
      throw new Error(`A IA de edição falhou e retornou uma mensagem: "${textPart.text}"`);
    }

    throw new Error("Ocorreu um erro inesperado: o modelo de edição de imagem não retornou uma imagem nem uma mensagem de texto.");

  } else {
    // Gera a imagem usando imagen-4.0-generate-001
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: aspectRatio,
      },
    });

    if (response.generatedImages?.[0]?.image?.imageBytes) {
      return response.generatedImages[0].image.imageBytes;
    }
    throw new Error("A IA de geração de imagem não conseguiu criar a imagem. Tente novamente com um prompt ou estilo diferente.");
  }
};