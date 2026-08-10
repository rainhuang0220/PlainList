import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plainlist.app',
  appName: 'PlainList',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#F7F7F7',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F7F7F7',
    },
  },
  // Public API is plain HTTP today. https://localhost + http://API is mixed
  // content and gets blocked in Android WebView unless we allow cleartext.
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'http',
    iosScheme: 'capacitor',
    cleartext: true,
  },
};

export default config;
