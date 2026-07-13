import { createApp } from './app';
import { env } from './config/env';
import { startInstalledWidgets } from './modules/plugins/widgetRunner';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`PlainList API listening on http://localhost:${env.PORT}`);
  void startInstalledWidgets();
});
