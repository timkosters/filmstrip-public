import React from 'react';
import {loadFont as loadGaramond} from '@remotion/google-fonts/EBGaramond';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {buildWindowLayout} from './layout';
import type {PosterPreset, TextBlock, WindowLayout} from './types';

loadGaramond('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin']});
loadGaramond('italic', {weights: ['400', '500', '600'], subsets: ['latin']});

const BASE_WIDTH = 900;
const BASE_HEIGHT = 674;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const coverPosition = (window: WindowLayout) => {
  const x = clamp(window.cropX * 100, 12, 88);
  const y = clamp(window.cropY * 100, 18, 82);
  return `${x}% ${y}%`;
};

const visibilityFor = (frame: number, layout: WindowLayout) => {
  if (frame < layout.posterStartFrame) return 0;
  if (frame > layout.posterEndFrame) return 0;
  const revealFrames = Math.max(0, layout.revealFrames);
  const fadeFrames = Math.max(0, layout.fadeFrames);
  if (revealFrames > 0 && frame < layout.posterStartFrame + revealFrames) {
    return interpolate(
      frame,
      [layout.posterStartFrame, layout.posterStartFrame + revealFrames],
      [0, 1],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)},
    );
  }
  if (fadeFrames > 0 && frame > layout.posterEndFrame - fadeFrames) {
    return interpolate(
      frame,
      [layout.posterEndFrame - fadeFrames, layout.posterEndFrame],
      [1, 0],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)},
    );
  }
  return 1;
};

const PaperTexture: React.FC<{preset: PosterPreset}> = ({preset}) => {
  const flecks = Array.from({length: 95}, (_, index) => {
    const x = ((index * 47) % preset.width) + ((index * 13) % 17);
    const y = ((index * 83) % preset.height) + ((index * 7) % 19);
    const opacity = 0.02 + ((index * 11) % 7) / 500;
    return (
      <div
        key={index}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 1,
          height: 1,
          background: `rgba(0,0,0,${opacity})`,
        }}
      />
    );
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: preset.background.color,
        overflow: 'hidden',
      }}
    >
      {preset.background.image ? (
        <Img
          src={staticFile(preset.background.image)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: preset.background.imageOpacity ?? 0.22,
            filter: 'saturate(0.7) contrast(0.86)',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: preset.background.textureOpacity,
        }}
      >
        {flecks}
      </div>
    </AbsoluteFill>
  );
};

const TextLayer: React.FC<{
  preset: PosterPreset;
  color: string;
  onlyTitleBlocks?: boolean;
}> = ({preset, color, onlyTitleBlocks = false}) => {
  const sx = preset.width / BASE_WIDTH;
  const sy = preset.height / BASE_HEIGHT;
  const scale = Math.min(sx, sy);
  return (
    <>
      {preset.text.blocks.map((block) => {
        if (onlyTitleBlocks && !block.isTitle) return null;
        return <TextBlockView key={block.id} block={block} preset={preset} color={color} sx={sx} sy={sy} scale={scale} />;
      })}
    </>
  );
};

const TextBlockView: React.FC<{
  block: TextBlock;
  preset: PosterPreset;
  color: string;
  sx: number;
  sy: number;
  scale: number;
}> = ({block, preset, color, sx, sy, scale}) => {
  const fontFamily = (block.fontFamily ?? 'title') === 'mono'
    ? preset.text.monoFont
    : preset.text.titleFont;
  const fontSize = Math.round((block.fontSize ?? 40) * scale);
  const lineHeightPx = Math.round((block.lineHeight ?? (block.fontSize ?? 40)) * scale);
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.round(block.left * sx),
        top: Math.round(block.top * sy),
        width: block.width ? Math.round(block.width * sx) : undefined,
        color,
        fontFamily,
        fontSize,
        lineHeight: `${lineHeightPx}px`,
        fontWeight: block.fontWeight ?? 500,
        fontStyle: block.italic ? 'italic' : 'normal',
        textAlign: block.textAlign ?? 'left',
        letterSpacing: 0,
        transform: block.rotate ? `rotate(${block.rotate}deg)` : undefined,
        transformOrigin: 'left top',
      }}
    >
      {block.content.map((line, i) => (
        <div key={i}>{line === '' ? '\u00a0' : line}</div>
      ))}
    </div>
  );
};

const LogoLayer: React.FC<{preset: PosterPreset}> = ({preset}) => {
  const sx = preset.width / BASE_WIDTH;
  const sy = preset.height / BASE_HEIGHT;
  const scale = Math.min(sx, sy);
  if (!preset.logo) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.round(preset.logo.left * sx),
        top: Math.round(preset.logo.top * sy),
        width: Math.round(preset.logo.width * scale),
        height: Math.round(preset.logo.height * scale),
        zIndex: 10,
      }}
    >
      <Img
        src={staticFile(preset.logo.src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'left center',
        }}
      />
    </div>
  );
};

const BaseTypography: React.FC<{preset: PosterPreset}> = ({preset}) => {
  return (
    <AbsoluteFill style={{zIndex: 10}}>
      <TextLayer preset={preset} color={preset.text.color} />
      <LogoLayer preset={preset} />
    </AbsoluteFill>
  );
};

const AssetContent: React.FC<{layout: WindowLayout; preset: PosterPreset}> = ({layout, preset}) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    left: 0,
    top: 0,
    objectFit: 'cover',
    objectPosition: coverPosition(layout),
  };
  if (layout.asset.kind === 'video') {
    const windowDuration = Math.max(1, layout.posterEndFrame - layout.posterStartFrame + 1);
    return (
      <Sequence from={layout.posterStartFrame} durationInFrames={windowDuration} layout="none" name={layout.asset.path}>
        <OffthreadVideo
          src={staticFile(layout.asset.path)}
          muted
          pauseWhenBuffering
          style={style}
        />
      </Sequence>
    );
  }
  return <Img src={staticFile(layout.asset.path)} style={style} />;
};

const ImageWindow: React.FC<{
  layout: WindowLayout;
  frame: number;
  preset: PosterPreset;
}> = ({layout, frame, preset}) => {
  const sx = preset.width / BASE_WIDTH;
  const sy = preset.height / BASE_HEIGHT;
  const visibility = visibilityFor(frame, layout);
  if (visibility <= 0) return null;

  const px = Math.round(layout.x * sx);
  const py = Math.round(layout.y * sy);
  const pw = Math.round(layout.width * sx);
  const ph = Math.round(layout.height * sy);

  return (
    <div
      style={{
        position: 'absolute',
        left: px,
        top: py,
        width: pw,
        height: ph,
        zIndex: layout.zIndex,
        overflow: 'hidden',
        opacity: visibility,
        transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 12px 32px -18px rgba(0,0,0,0.35)',
      }}
    >
      <AssetContent layout={layout} preset={preset} />
      <div
        style={{
          position: 'absolute',
          left: -px,
          top: -py,
          width: preset.width,
          height: preset.height,
          transformOrigin: `${px + pw / 2}px ${py + ph / 2}px`,
          transform: layout.rotation ? `rotate(${-layout.rotation}deg)` : undefined,
        }}
      >
        <TextLayer preset={preset} color={preset.text.overlapColor} onlyTitleBlocks />
      </div>
    </div>
  );
};

const MusicTrack: React.FC<{music: NonNullable<PosterPreset['music']>; durationInFrames: number; fps: number}> = ({music, durationInFrames, fps}) => {
  const baseVolume = music.volume ?? 1;
  const fadeIn = Math.max(0, music.fadeInFrames ?? 0);
  const fadeOut = Math.max(0, music.fadeOutFrames ?? 0);
  const startFromFrames = Math.max(0, Math.round((music.startFrom ?? 0) * fps));
  const volumeFn = (frame: number) => {
    let v = baseVolume;
    if (fadeIn > 0 && frame < fadeIn) v *= frame / fadeIn;
    if (fadeOut > 0 && frame > durationInFrames - fadeOut) {
      v *= Math.max(0, (durationInFrames - frame) / fadeOut);
    }
    return Math.max(0, Math.min(1, v));
  };
  return (
    <Audio
      src={staticFile(music.file)}
      startFrom={startFromFrames}
      volume={volumeFn}
    />
  );
};

export const PosterFilm: React.FC<PosterPreset> = (preset) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = preset.stillFrame ?? currentFrame;
  const layouts = buildWindowLayout(preset);

  return (
    <AbsoluteFill style={{fontSynthesis: 'none'}}>
      <PaperTexture preset={preset} />
      <BaseTypography preset={preset} />
      <AbsoluteFill>
        {layouts.map((layout, index) => (
          <ImageWindow
            key={`${layout.asset.path}-${index}`}
            layout={layout}
            frame={frame}
            preset={preset}
          />
        ))}
      </AbsoluteFill>
      {preset.music && preset.music.file ? (
        <MusicTrack music={preset.music} durationInFrames={preset.durationInFrames} fps={fps} />
      ) : null}
    </AbsoluteFill>
  );
};
