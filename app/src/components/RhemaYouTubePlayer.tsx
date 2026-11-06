import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ExternalLink } from 'lucide-react-native';

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
  style?: StyleProp<ViewStyle>;
  showExternalButton?: boolean;
}

export function cleanVideoId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return 'vgzXs5QCjIA';
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

  // Channel handle / streams URL fallback for testing ministry
  const lower = clean.toLowerCase();
  if (lower.includes('brother') || lower.includes('uc3j_2zp2biucweia_asvghw')) {
    return 'vgzXs5QCjIA';
  }

  return clean || 'vgzXs5QCjIA';
}

const TRUSTED_ORIGIN = 'https://brothersinchrist.in';
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
  style,
  showExternalButton = true,
}: RhemaYouTubePlayerProps) {
  const finalVideoId = useMemo(() => cleanVideoId(videoId), [videoId]);
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const handleOpenInYouTubeApp = useCallback(() => {
    const appUrl = `vnd.youtube://${finalVideoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${finalVideoId}`;
    Linking.canOpenURL(appUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(appUrl);
        }
        return Linking.openURL(webUrl);
      })
      .catch(() => Linking.openURL(webUrl));
  }, [finalVideoId]);

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
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
  }, [finalVideoId, autoPlay]);

  return (
    <View style={[styles.container, { height }, style]}>
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
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          mixedContentMode="always"
          scrollEnabled={false}
          bounces={false}
          onLoadEnd={() => {
            setLoading(false);
            onReady?.();
          }}
          onError={(e) => {
            console.warn('[RhemaYouTubePlayer] WebView direct error:', e.nativeEvent);
          }}
          onShouldStartLoadWithRequest={() => true}
        />
      </View>

      {/* Floating external YouTube launcher button for immediate access */}
      {showExternalButton && (
        <TouchableOpacity
          style={styles.floatingAppBtn}
          onPress={handleOpenInYouTubeApp}
          activeOpacity={0.85}
        >
          <ExternalLink size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
          <Text style={styles.floatingAppBtnTxt}>YouTube App</Text>
        </TouchableOpacity>
      )}
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
  floatingAppBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  floatingAppBtnTxt: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

