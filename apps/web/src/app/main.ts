import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import App from './App.vue';
import '../shared/styles/main.css';
import { useAuthStore } from '@/features/auth/model/useAuthStore';

async function initNativePlugins() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('pl-native');

  const [{ SplashScreen }, { StatusBar, Style }, { Keyboard }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/keyboard'),
  ]);

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

  await initNativePlugins();
}

bootstrap();
