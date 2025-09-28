export enum Step {
  HEADLINE_INPUT,
  HEADLINE_SELECTION,
  STYLE_SELECTION,
  IMAGE_UPLOAD,
  PROMPT_GENERATION,
  TEXT_EDITING,
  COMPLETE,
}

export interface UploadedImage {
  data: string;
  mimeType: string;
}

export interface FinalPrompt {
  englishPrompt: string;
  portugueseTranslation: string;
}

export interface TextElement {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  position: { x: number; y: number };
  letterSpacing: number;
  lineHeight: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  useGradient: boolean;
  gradientColor1: string;
  gradientColor2: string;
  gradientAngle: number;
  rotation: number;
  width: number;
  height: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface HeadlineVariation {
  text: string;
  keywords: string[];
}

export interface AppState {
  currentStep: Step;
  originalHeadline: string;
  headlineVariations: HeadlineVariation[];
  selectedHeadline: string;
  selectedStyle: string;
  uploadedImages: UploadedImage[];
  finalPrompt: FinalPrompt | null;
  generatedImage: string | null;
  isLoading: boolean;
  error: string | null;
  textElements: TextElement[];
  activeTextElementId: string | null;
  aspectRatio: string;
}
