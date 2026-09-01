export interface StaticPreviewBackground {
  id: string;
  name: string;
  kind?: 'static';
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export interface ImagePreviewBackground {
  id: string;
  name: string;
  kind: 'image';
  imageUrl: string;
}

export type PreviewBackground = StaticPreviewBackground | ImagePreviewBackground;
