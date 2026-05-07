import {Composition, Still} from 'remotion';
import {PosterFilm} from './poster-film';
import {posterPreset} from './poster-preset';
import type {PosterPreset} from './types';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Poster"
        component={PosterFilm}
        durationInFrames={posterPreset.durationInFrames}
        fps={posterPreset.fps}
        width={posterPreset.width}
        height={posterPreset.height}
        defaultProps={posterPreset}
        calculateMetadata={({props}: {props: PosterPreset}) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
          props,
        })}
      />
      <Still
        id="PosterStill"
        component={PosterFilm}
        width={posterPreset.width}
        height={posterPreset.height}
        defaultProps={{
          ...posterPreset,
          stillFrame: posterPreset.durationInFrames - 1,
        }}
        calculateMetadata={({props}: {props: PosterPreset}) => ({
          width: props.width,
          height: props.height,
          props,
        })}
      />
    </>
  );
};
