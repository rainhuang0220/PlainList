import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import App from './App.vue';
import '../shared/styles/main.css';

async function initNativePlugins() {
  if (!Capacitor.isNativePlatform()) return;

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

const app = createApp(App);
app.use(createPinia());
app.mount('#app');

initNativePlugins();
