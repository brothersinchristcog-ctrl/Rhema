import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// Matches expo-screen-orientation's OrientationLock enum values without triggering
// top-level requireNativeModule('ExpoScreenOrientation') on older dev clients.
const ORIENTATION_LOCK = {
  DEFAULT: 0,
  PORTRAIT_UP: 3,
  LANDSCAPE: 5,
} as const;

type ScreenOrientationNative = {
  lockAsync?: (orientationLock: number) => Promise<void>;
};

function getScreenOrientationNative(): ScreenOrientationNative | null {
  if (Platform.OS === 'web') return null;
  try {
    return requireOptionalNativeModule<ScreenOrientationNative>('ExpoScreenOrientation') ?? null;
  } catch {
    return null;
  }
}

const activeVideoLeases = new Set<string>();
let orientationRestoreTimer: ReturnType<typeof setTimeout> | null = null;

function clearRestoreTimer() {
  if (orientationRestoreTimer) {
    clearTimeout(orientationRestoreTimer);
    orientationRestoreTimer = null;
  }
}

export async function lockDefaultPortrait(): Promise<void> {
  const mod = getScreenOrientationNative();
  if (!mod?.lockAsync) return;
  try {
    await mod.lockAsync(ORIENTATION_LOCK.PORTRAIT_UP);
  } catch {
    // Non-fatal on unsupported devices/emulators
  }
}

export async function unlockForVideo(): Promise<void> {
  const mod = getScreenOrientationNative();
  if (!mod?.lockAsync) return;
  try {
    await mod.lockAsync(ORIENTATION_LOCK.DEFAULT);
  } catch {
    // Non-fatal on unsupported devices/emulators
  }
}

export async function lockLandscapeForVideo(): Promise<void> {
  const mod = getScreenOrientationNative();
  if (!mod?.lockAsync) return;
  try {
    await mod.lockAsync(ORIENTATION_LOCK.LANDSCAPE);
  } catch {
    // Non-fatal on unsupported devices/emulators
  }
}

export function acquireVideoOrientationLease(leaseId: string): void {
  if (!leaseId) return;
  clearRestoreTimer();
  activeVideoLeases.add(leaseId);
  unlockForVideo();
}

export function releaseVideoOrientationLease(leaseId: string): void {
  if (!leaseId) return;
  activeVideoLeases.delete(leaseId);
  if (activeVideoLeases.size === 0) {
    clearRestoreTimer();
    lockDefaultPortrait();
  }
}

export function getActiveVideoLeaseCount(): number {
  return activeVideoLeases.size;
}

export interface ResponsivePlayerOptions {
  theaterInLandscape?: boolean;
  horizontalPadding?: number;
  maxPortraitWidth?: number;
  landscapeVerticalReserve?: number;
}

export function computeResponsivePlayerSize(
  windowWidth: number,
  windowHeight: number,
  options: ResponsivePlayerOptions = {}
): { isLandscape: boolean; width: number; height: number } {
  const safeW = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 360;
  const safeH = Number.isFinite(windowHeight) && windowHeight > 0 ? windowHeight : 640;
  const isLandscape = safeW > safeH;
  const {
    theaterInLandscape = false,
    horizontalPadding = 32,
    maxPortraitWidth = 600,
    landscapeVerticalReserve = 80,
  } = options;

  if (isLandscape) {
    if (theaterInLandscape) {
      return {
        isLandscape: true,
        width: Math.round(safeW),
        height: Math.round(safeH),
      };
    }
    const maxH = Math.max(160, safeH - landscapeVerticalReserve);
    const maxW = Math.max(240, safeW - horizontalPadding);
    const w = Math.min(maxW, Math.round((maxH * 16) / 9));
    const h = Math.round((w * 9) / 16);
    return {
      isLandscape: true,
      width: w,
      height: h,
    };
  }

  const w = Math.min(Math.max(200, safeW - horizontalPadding), maxPortraitWidth);
  const h = Math.round((w * 9) / 16);
  return {
    isLandscape: false,
    width: w,
    height: h,
  };
}

/**
 * Unlocks device rotation (Portrait + Landscape) while `active` is true,
 * and cleanly restores Portrait lock when all active video surfaces close/blur.
 */
export function useVideoOrientationLease(active: boolean, leaseId: string): void {
  useEffect(() => {
    if (!active) return;
    acquireVideoOrientationLease(leaseId);
    return () => {
      releaseVideoOrientationLease(leaseId);
    };
  }, [active, leaseId]);
}

/**
 * Full orientation & fullscreen lifecycle controller for any video screen or modal.
 * Supports:
 * - Automatic device Portrait/Landscape rotation while active
 * - Native player fullscreen in both Portrait and Landscape
 * - Returning to the appropriate orientation on fullscreen exit
 * - Manual Rotate toggle for devices with System Auto-Rotate disabled
 */
export function useVideoOrientationController(
  active: boolean,
  leaseId: string,
  playerOptions?: ResponsivePlayerOptions
) {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const forcedLandscapeRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useVideoOrientationLease(active, leaseId);

  const dims = computeResponsivePlayerSize(winWidth, winHeight, playerOptions);

  const returnToPortraitThenUnlock = useCallback(() => {
    clearRestoreTimer();
    lockDefaultPortrait();
    // Re-unlock shortly after settling back into Portrait if the video screen is still open
    // so subsequent physical rotations continue to work automatically.
    orientationRestoreTimer = setTimeout(() => {
      if (activeRef.current && activeVideoLeases.size > 0) {
        unlockForVideo();
      }
    }, 550);
  }, []);

  const handleFullScreenChange = useCallback(
    (enteringFullscreen: boolean) => {
      setIsFullScreen(enteringFullscreen);
      if (!activeRef.current) return;

      if (enteringFullscreen) {
        clearRestoreTimer();
        unlockForVideo();
        return;
      }

      // Exiting fullscreen:
      // 1) If user explicitly forced landscape to watch fullscreen, restore Portrait cleanly.
      // 2) Otherwise re-apply unlockAsync() so Android RNCWebViewManager's
      //    initialRequestedOrientation restore does not lock the screen against future rotation.
      if (forcedLandscapeRef.current) {
        forcedLandscapeRef.current = false;
        returnToPortraitThenUnlock();
      } else {
        setTimeout(() => {
          if (activeRef.current && activeVideoLeases.size > 0) {
            unlockForVideo();
          }
        }, 60);
      }
    },
    [returnToPortraitThenUnlock]
  );

  const handleNativeFullscreenUpdate = useCallback(
    (event?: { fullscreenUpdate?: number }) => {
      const code = event?.fullscreenUpdate;
      // 0 = PLAYER_WILL_PRESENT, 1 = PLAYER_DID_PRESENT
      // 2 = PLAYER_WILL_DISMISS, 3 = PLAYER_DID_DISMISS
      if (code === 0 || code === 1) {
        handleFullScreenChange(true);
      } else if (code === 2 || code === 3) {
        handleFullScreenChange(false);
      }
    },
    [handleFullScreenChange]
  );

  const toggleOrientation = useCallback(() => {
    if (!activeRef.current) return;
    if (dims.isLandscape) {
      forcedLandscapeRef.current = false;
      returnToPortraitThenUnlock();
    } else {
      clearRestoreTimer();
      forcedLandscapeRef.current = true;
      lockLandscapeForVideo();
    }
  }, [dims.isLandscape, returnToPortraitThenUnlock]);

  useEffect(() => {
    if (!active) {
      forcedLandscapeRef.current = false;
      setIsFullScreen(false);
    }
  }, [active]);

  return {
    windowWidth: winWidth,
    windowHeight: winHeight,
    isLandscape: dims.isLandscape,
    playerWidth: dims.width,
    playerHeight: dims.height,
    isFullScreen,
    handleFullScreenChange,
    handleNativeFullscreenUpdate,
    toggleOrientation,
  };
}
