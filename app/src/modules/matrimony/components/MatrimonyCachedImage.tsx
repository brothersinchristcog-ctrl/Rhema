import React, { useMemo } from 'react';
import { Image, ImageProps, ImageResizeMode, ImageStyle, StyleProp } from 'react-native';

export interface MatrimonyCachedImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  recyclingKey?: string;
  onError?: ImageProps['onError'];
  onLoad?: ImageProps['onLoad'];
}

/**
 * Memoized image wrapper for Matrimony lists and carousels.
 * Keeps `source` object referentially stable across parent re-renders and disables
 * Android's default 300ms fade-in so cached photos appear instantaneously.
 */
const MatrimonyCachedImageComponent: React.FC<MatrimonyCachedImageProps> = ({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  onLoad,
}) => {
  const source = useMemo(() => ({ uri }), [uri]);

  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      fadeDuration={0}
      progressiveRenderingEnabled
      onError={onError}
      onLoad={onLoad}
    />
  );
};

export const MatrimonyCachedImage = React.memo(
  MatrimonyCachedImageComponent,
  (prev, next) =>
    prev.uri === next.uri &&
    prev.recyclingKey === next.recyclingKey &&
    prev.resizeMode === next.resizeMode &&
    prev.style === next.style
);

export default MatrimonyCachedImage;
