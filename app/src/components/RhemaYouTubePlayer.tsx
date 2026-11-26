import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { unlockForVideo, useVideoOrientationLease } from '../utils/videoOrientation';

interface RhemaYouTubePlayerProps {
  videoId: string;
  height: number;
  width?: number;
  play?: boolean;
  autoPlay?: boolean;
  title?: string;
  isLive?: boolean;
  onReady?: () => void;
  onChangeState?: (state: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  style?: StyleProp<ViewStyle>;
  showExternalButton?: boolean;
}

export function cleanVideoId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();

  // Pure 11-char ID
  if (/^[\w-]{11}$/.test(clean)) return clean;

  // youtube.com/live/VIDEO_ID
  const liveMatch = clean.match(/\/live\/([\w-]{11})/);
  if (liveMatch) return liveMatch[1];

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = clean.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/VIDEO_ID
  const shortMatch = clean.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/VIDEO_ID
  const embedMatch = clean.match(/\/embed\/([\w-]{11})/);
  if (embedMatch) return embedMatch[1];

  return '';
}

const TRUSTED_ORIGIN = 'https://rhema-global-ministries.web.app';
const MODERN_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36';

export default function RhemaYouTubePlayer({
  videoId,
  height,
  width,
  play = true,
  autoPlay = true,
  title,
  isLive = false,
  onReady,
  onChangeState,
  onFullScreenChange,
  style,
}: RhemaYouTubePlayerProps) {
  const finalVideoId = useMemo(() => cleanVideoId(videoId), [videoId]);
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const leaseIdRef = useRef(`yt_player_${Math.random().toString(36).slice(2, 9)}`);

  // Ensure orientation is unlocked whenever an active YouTube player is mounted
  useVideoOrientationLease(Boolean(finalVideoId), leaseIdRef.current);

  useEffect(() => {
    if (!finalVideoId || !webViewRef.current) return;
    const func = play ? 'playVideo' : 'pauseVideo';
    webViewRef.current.injectJavaScript(
      `(function(){var f=document.querySelector('iframe');if(f&&f.contentWindow){f.contentWindow.postMessage(JSON.stringify({event:'command',func:'${func}',args:''}),'*');}})();true;`
    );
  }, [play, finalVideoId]);

  // Direct HTML5 embed with verified ministry domain origin and strict-origin referrer policy
  // This completely eliminates YouTube Error 152-4 (PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_DENIED)
  const htmlEmbedContent = useMemo(() => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:100%; height:100%; background:#000000; overflow:hidden; }
      iframe { width:100%; height:100%; border:none; display:block; }
    </style>
  </head>
  <body>
    <iframe
      src="https://www.youtube-nocookie.com/embed/${finalVideoId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${TRUSTED_ORIGIN}"
      frameborder="0"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowfullscreen
    ></iframe>
    <script>
      (function () {
        function notifyFs() {
          try {
            var fs = Boolean(
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement
            );
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ eventType: 'fullScreenChange', data: fs }));
            }
          } catch (e) {}
        }
        document.addEventListener('fullscreenchange', notifyFs);
        document.addEventListener('webkitfullscreenchange', notifyFs);
      })();
    </script>
  </body>
</html>`;
  }, [finalVideoId, autoPlay]);

  if (!finalVideoId) {
    return <View style={[styles.container, { height, ...(width ? { width } : {}) }, style]} />;
  }

  return (
    <View style={[styles.container, { height, ...(width ? { width } : {}) }, style]}>
      <View style={styles.playerWrapper}>
        <WebView
          ref={webViewRef}
          key={`embed_${finalVideoId}`}
          source={{
            html: htmlEmbedContent,
            baseUrl: TRUSTED_ORIGIN,
          }}
          style={styles.webView}
          userAgent={MODERN_USER_AGENT}
          originWhitelist={['https://*', 'about:blank']}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          mixedContentMode="always"
          scrollEnabled={false}
          bounces={false}
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event?.nativeEvent?.data || '{}');
              if (payload?.eventType === 'fullScreenChange') {
                const isFs = Boolean(payload.data);
                if (!isFs) {
                  // Re-unlock so Android WebChromeClient restoring initialRequestedOrientation
                  // never prevents landscape rotation after exiting fullscreen.
                  setTimeout(() => unlockForVideo(), 50);
                }
                onFullScreenChange?.(isFs);
              }
            } catch {
              // Ignore non-JSON messages
            }
          }}
          onLoadEnd={() => {
            setLoading(false);
            onReady?.();
          }}
          onError={(e) => {
            console.warn('[RhemaYouTubePlayer] WebView direct error:', e.nativeEvent);
          }}
          onShouldStartLoadWithRequest={(req) => {
            const url = req?.url || '';
            if (!url || url === 'about:blank') return true;
            if (url.startsWith(TRUSTED_ORIGIN)) return true;
            // Allow all YouTube media streams, asset CDNs, and Google Video endpoints
            if (
              url.includes('youtube.com') ||
              url.includes('youtube-nocookie.com') ||
              url.includes('googlevideo.com') ||
              url.includes('ytimg.com') ||
              url.includes('google.com') ||
              url.includes('gstatic.com') ||
              url.includes('doubleclick.net')
            ) {
              return true;
            }
            // Prevent navigating away to unrelated external websites
            return false;
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
  },
  playerWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
});

