import type {PosterPreset, WindowLayout} from './types';

export const buildWindowLayout = (preset: PosterPreset): WindowLayout[] => {
  return preset.windows;
};
