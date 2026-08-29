import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import App from './App.vue';
import '../shared/styles/main.css';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { getAppDayClock } from '@/shared/clock/localDayClock';

function emitBackground() {
  window.dispatchEvent(new Event('plainlist:background'));
}

function wireDayClock() {
  const clock = getAppDayClock();
  clock.start();

  window.addEventListener('focus', () => clock.handleForeground());
  window.addEventListener('pageshow', () => clock.handleForeground());
  window.addEventListener('pagehide', emitBackground);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clock.handleForeground();
    } else {
      emitBackground();
    }
  });
}

async function initNativePlugins() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('pl-native');

  const [{ SplashScreen }, { StatusBar, Style }, { Keyboard }, { App }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/keyboard'),
    import('@capacitor/app'),
  ]);

  App.addListener('resume', () => {
    getAppDayClock().handleForeground();
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      getAppDayClock().handleForeground();
    } else {
      emitBackground();
    }
  });

  await StatusBar.setStyle({ style: Style.Light });

  Keyboard.addListener('keyboardWillShow', (info) => {
    document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
  });
  Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.style.setProperty('--keyboard-height', '0px');
  });

  await SplashScreen.hide();
}

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  const auth = useAuthStore(pinia);
  await auth.hydrateFromStorage();

  app.mount('#app');

  wireDayClock();
  await initNativePlugins();
}

bootstrap();
