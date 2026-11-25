import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  ImageBackgroundProps,
  ImageProps,
  ImageResizeMode,
  ImageSourcePropType,
  ImageStyle,
  Platform,
  StyleProp,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { perfMonitor } from '../utils/perfMonitor';

const IMAGE_CACHE_DIR = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}rhema_img_cache/`
  : null;
const MAX_MEM_ENTRIES = 500;
const MEM_LOCAL_URI_CACHE = new Map<string, string>();
const IN_FLIGHT_DOWNLOADS = new Map<string, Promise<string | null>>();
let cacheDirEnsured = false;

function hashUri(uri: string): string {
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) + hash + uri.charCodeAt(i)) >>> 0;
  }
  let ext = 'img';
  const clean = uri.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  if (dot > -1) {
    const candidate = clean.slice(dot + 1).toLowerCase();
    if (/^(jpg|jpeg|png|webp|gif)$/.test(candidate)) {
      ext = candidate;
    }
  }
  return `${hash.toString(16)}_${uri.length}.${ext}`;
}

function setBoundedCache(remoteUri: string, localUri: string): void {
  if (MEM_LOCAL_URI_CACHE.size >= MAX_MEM_ENTRIES) {
    const firstKey = MEM_LOCAL_URI_CACHE.keys().next().value;
    if (firstKey) MEM_LOCAL_URI_CACHE.delete(firstKey);
  }
  MEM_LOCAL_URI_CACHE.set(remoteUri, localUri);
}

async function ensureCacheDir(): Promise<void> {
  if (cacheDirEnsured || !IMAGE_CACHE_DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    }
    cacheDirEnsured = true;
  } catch {
    // Non-fatal: falls back to normal Image loading
  }
}

export async function resolveCachedImageUri(uri?: string | null): Promise<string | null> {
  if (!uri || typeof uri !== 'string') return null;
  if (Platform.OS === 'web' || !IMAGE_CACHE_DIR || !uri.startsWith('http')) {
    return uri;
  }

  const memHit = MEM_LOCAL_URI_CACHE.get(uri);
  if (memHit) return memHit;

  const existing = IN_FLIGHT_DOWNLOADS.get(uri);
  if (existing) return existing;

  const task = (async () => {
    try {
      await ensureCacheDir();
      const targetPath = `${IMAGE_CACHE_DIR}${hashUri(uri)}`;
      const info = await FileSystem.getInfoAsync(targetPath);
      if (info.exists && (info.size || 0) > 0) {
        setBoundedCache(uri, targetPath);
        return targetPath;
      }
      const downloaded = await FileSystem.downloadAsync(uri, targetPath);
      if (downloaded?.status === 200 && downloaded?.uri) {
        setBoundedCache(uri, downloaded.uri);
        return downloaded.uri;
      }
    } catch {
      // Non-fatal fallback
    } finally {
      IN_FLIGHT_DOWNLOADS.delete(uri);
    }
    return null;
  })();

  IN_FLIGHT_DOWNLOADS.set(uri, task);
  return task;
}

export async function prefetchImages(uris: Array<string | null | undefined>, limit = 12): Promise<void> {
  const unique = Array.from(
    new Set(uris.filter((u): u is string => typeof u === 'string' && u.startsWith('http')))
  ).slice(0, limit);
  if (unique.length === 0) return;

  await Promise.allSettled(
    unique.map(async (u) => {
      if (Platform.OS !== 'web') {
        await resolveCachedImageUri(u);
      }
      await Image.prefetch(u).catch(() => false);
    })
  );
}

export async function clearCachedImages(): Promise<void> {
  MEM_LOCAL_URI_CACHE.clear();
  IN_FLIGHT_DOWNLOADS.clear();
  cacheDirEnsured = false;
  if (IMAGE_CACHE_DIR && Platform.OS !== 'web') {
    try {
      await FileSystem.deleteAsync(IMAGE_CACHE_DIR, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export interface CachedImageProps extends Omit<ImageProps, 'source'> {
  uri?: string | null;
  source?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
}

function isRemoteUriSource(source: ImageSourcePropType | undefined): source is { uri: string } {
  return Boolean(
    source &&
      typeof source === 'object' &&
      !Array.isArray(source) &&
      typeof (source as any).uri === 'string'
  );
}

const CachedImageComponent: React.FC<CachedImageProps> = ({
  uri,
  source,
  resizeMode = 'cover',
  fadeDuration = 0,
  onLoad,
  ...rest
}) => {
  const remoteUri = uri ?? (isRemoteUriSource(source) ? source.uri : undefined);
  const memInitial = remoteUri ? MEM_LOCAL_URI_CACHE.get(remoteUri) : undefined;
  const [resolvedUri, setResolvedUri] = useState<string | undefined>(memInitial || remoteUri);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    if (!remoteUri) {
      setResolvedUri(undefined);
      return;
    }
    const cached = MEM_LOCAL_URI_CACHE.get(remoteUri);
    if (cached) {
      setResolvedUri(cached);
      return;
    }
    setResolvedUri(remoteUri);
    let mounted = true;
    resolveCachedImageUri(remoteUri).then((localUri) => {
      if (mounted && localUri) {
        setResolvedUri(localUri);
      }
    });
    return () => {
      mounted = false;
    };
  }, [remoteUri]);

  const effectiveSource = useMemo<ImageSourcePropType | undefined>(() => {
    if (remoteUri) {
      return { uri: resolvedUri || remoteUri };
    }
    return source;
  }, [remoteUri, resolvedUri, source]);

  if (!effectiveSource) return null;

  return (
    <Image
      {...rest}
      source={effectiveSource}
      resizeMode={resizeMode}
      fadeDuration={fadeDuration}
      progressiveRenderingEnabled
      onLoad={(e) => {
        perfMonitor.recordImageLoad(Date.now() - startRef.current);
        onLoad?.(e);
      }}
    />
  );
};

export const CachedImage = React.memo(CachedImageComponent);

export interface CachedImageBackgroundProps extends Omit<ImageBackgroundProps, 'source'> {
  uri?: string | null;
  source?: ImageSourcePropType;
}

const CachedImageBackgroundComponent: React.FC<CachedImageBackgroundProps> = ({
  uri,
  source,
  children,
  fadeDuration = 0,
  onLoad,
  ...rest
}) => {
  const remoteUri = uri ?? (isRemoteUriSource(source) ? source.uri : undefined);
  const memInitial = remoteUri ? MEM_LOCAL_URI_CACHE.get(remoteUri) : undefined;
  const [resolvedUri, setResolvedUri] = useState<string | undefined>(memInitial || remoteUri);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    if (!remoteUri) {
      setResolvedUri(undefined);
      return;
    }
    const cached = MEM_LOCAL_URI_CACHE.get(remoteUri);
    if (cached) {
      setResolvedUri(cached);
      return;
    }
    setResolvedUri(remoteUri);
    let mounted = true;
    resolveCachedImageUri(remoteUri).then((localUri) => {
      if (mounted && localUri) {
        setResolvedUri(localUri);
      }
    });
    return () => {
      mounted = false;
    };
  }, [remoteUri]);

  const effectiveSource = useMemo<ImageSourcePropType | undefined>(() => {
    if (remoteUri) {
      return { uri: resolvedUri || remoteUri };
    }
    return source;
  }, [remoteUri, resolvedUri, source]);

  if (!effectiveSource) {
    return <>{children}</>;
  }

  return (
    <ImageBackground
      {...rest}
      source={effectiveSource}
      fadeDuration={fadeDuration}
      onLoad={(e) => {
        perfMonitor.recordImageLoad(Date.now() - startRef.current);
        onLoad?.(e);
      }}
    >
      {children}
    </ImageBackground>
  );
};

export const CachedImageBackground = React.memo(CachedImageBackgroundComponent);

export default CachedImage;
