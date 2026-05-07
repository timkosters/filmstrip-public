export type TextBlock = {
  id: string;
  content: string[];
  left: number;
  top: number;
  width?: number;
  fontFamily?: 'title' | 'mono';
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number;
  italic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  rotate?: number;
  isTitle?: boolean;
};

export type LogoSpec = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MusicSpec = {
  file: string;
  startFrom?: number;
  volume?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
};

export type Asset = {
  path: string;
  kind: 'image' | 'video';
};

export type WindowLayout = {
  asset: Asset;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  cropX: number;
  cropY: number;
  zIndex: number;
  posterStartFrame: number;
  posterEndFrame: number;
  revealFrames: number;
  fadeFrames: number;
};

export type PosterPreset = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  seed: number;
  stillFrame: number | null;
  background: {
    color: string;
    textureOpacity: number;
    image?: string;
    imageOpacity?: number;
  };
  text: {
    color: string;
    overlapColor: string;
    titleFont: string;
    monoFont: string;
    blocks: TextBlock[];
  };
  logo?: LogoSpec;
  music?: MusicSpec | null;
  windows: WindowLayout[];
};
