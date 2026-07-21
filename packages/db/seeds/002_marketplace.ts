import type { Pool } from 'mysql2/promise';

interface PluginSeed {
  id: string;
  name: string;
  category: string;
  author: string;
  description: string;
  longDescription: string;
  repoUrl?: string;
  tags: string[];
  capabilities: string[];
  version: string;
  manifest: Record<string, unknown>;
}

const pluginSeeds: PluginSeed[] = [
  {
    id: 'theme-pack',
    name: 'Theme Pack',
    category: 'theme',
    author: 'PlainList',
    description: 'Curated color themes with config-driven preview and persistence.',
    longDescription: 'All theme variants live in the manifest catalog and are resolved without executing plugin JavaScript. Includes Default, Dark, Warm, Cool, High Contrast, Solarized, Nord, and Rose themes.',
    tags: ['theme', 'appearance', 'built-in'],
    capabilities: ['theme'],
    version: '2.0.0',
    manifest: {
      runtime: 'manifest',
      themes: [
        { id: 'default', name: 'Default', vars: { '--bg': '#F7F7F7', '--surface': '#FFFFFF', '--dark': '#111111', '--mid': '#555555', '--muted': '#999999', '--faint': '#E4E4E4', '--faint2': '#EFEFEF' } },
        { id: 'dark', name: 'Dark', vars: { '--bg': '#0F0F0F', '--surface': '#1A1A1A', '--dark': '#EFEFEF', '--mid': '#AAAAAA', '--muted': '#666666', '--faint': '#2C2C2C', '--faint2': '#222222' } },
        { id: 'warm', name: 'Warm', vars: { '--bg': '#F5F0E8', '--surface': '#FDFAF4', '--dark': '#2C1F0E', '--mid': '#6B5744', '--muted': '#A08C78', '--faint': '#E2D8CC', '--faint2': '#EDE8DF' } },
        { id: 'cool', name: 'Cool', vars: { '--bg': '#EEF2F7', '--surface': '#F8FAFD', '--dark': '#0D1B2A', '--mid': '#3D5A80', '--muted': '#7A9BBF', '--faint': '#D4DDE8', '--faint2': '#E4EBF2' } },
        { id: 'hc', name: 'High Contrast', vars: { '--bg': '#FFFFFF', '--surface': '#FFFFFF', '--dark': '#000000', '--mid': '#000000', '--muted': '#444444', '--faint': '#BBBBBB', '--faint2': '#EEEEEE' } },
        { id: 'solarized', name: 'Solarized', vars: { '--bg': '#FDF6E3', '--surface': '#EEE8D5', '--dark': '#073642', '--mid': '#586E75', '--muted': '#93A1A1', '--faint': '#D3CBB8', '--faint2': '#E8E2D0' } },
        { id: 'nord', name: 'Nord', vars: { '--bg': '#2E3440', '--surface': '#3B4252', '--dark': '#ECEFF4', '--mid': '#D8DEE9', '--muted': '#7B88A1', '--faint': '#434C5E', '--faint2': '#3B4252' } },
        { id: 'rose', name: 'Rose', vars: { '--bg': '#FDF2F4', '--surface': '#FFF8F9', '--dark': '#3D0A14', '--mid': '#8B3A4A', '--muted': '#C4849A', '--faint': '#F0D4DA', '--faint2': '#F7E5E9' } },
      ],
    },
  },
  {
    id: 'fishtime',
    name: 'Fishtime',
    category: 'widget',
    author: 'LynngNAN',
    description: '应用使用时间追踪，实时监控活动窗口，支持图表与多格式导出。',
    longDescription: 'Fishtime 记录每个应用的使用时长，提供柱状图分析、应用时间限额提醒，并支持导出为 XLSX / CSV / PDF。',
    repoUrl: 'https://github.com/nanlingyin/fishtime',
    tags: ['time-tracking', 'productivity', 'widget'],
    capabilities: ['network', 'process-monitor'],
    version: '1.0.0',
    manifest: {
      runtime: 'iframe',
      // fishtime is a Vite project built with `base: '/widget/fishtime/'`.
      // The iframe must be served from the main app's origin at this path,
      // then proxied (dev: vite.config / prod: nginx) to fishtime's own
      // sidecar (default :5174). Hard-coding localhost would 404 on
      // /widget/fishtime/assets/* in the browser.
      widgetUrl: '/widget/fishtime/',
    },
  },
  {
    id: 'focus-bay',
    name: 'Focus Bay',
    category: 'widget',
    author: 'PlainList',
    description: '基于 YOLO26 的手机监测：摄像头对准桌面，检测到手机即计为分心，统计专注时长与连击。',
    longDescription: 'Focus Bay 用一颗摄像头和一个本地训练的 YOLO26n 模型（8200 张标注图）盯住你的桌面。检测到手机会记录一次 pickup、累计分心时长，可选自动暂停会话与提示音。所有推理都在本机 :8800 完成，画面永不上传。支持采样率、置信度阈值、镜像画面等设置，并保留最近 30 次会话历史。',
    tags: ['focus', 'yolo', 'camera', 'productivity', 'widget'],
    capabilities: ['camera', 'local-inference'],
    version: '1.0.0',
    manifest: {
      runtime: 'iframe',
      widgetUrl: 'http://127.0.0.1:8800',
      sourcePath: 'plugins/focus-bay',
      permissions: ['camera'],
    },
  },
];

export async function seed(pool: Pool): Promise<void> {
  for (const plugin of pluginSeeds) {
    await pool.query(
      `INSERT INTO plugins (id, name, category, author, description, long_description, repo_url, tags, capabilities, is_official, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        long_description = VALUES(long_description)`,
      [
        plugin.id,
        plugin.name,
        plugin.category,
        plugin.author,
        plugin.description,
        plugin.longDescription,
        plugin.repoUrl ?? null,
        JSON.stringify(plugin.tags),
        JSON.stringify(plugin.capabilities),
      ],
    );

    await pool.query(
      `UPDATE plugin_versions SET is_latest = 0 WHERE plugin_id = ? AND is_latest = 1`,
      [plugin.id],
    );

    await pool.query(
      `INSERT INTO plugin_versions (plugin_id, version, manifest, is_latest)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE manifest = VALUES(manifest), is_latest = 1`,
      [plugin.id, plugin.version, JSON.stringify(plugin.manifest)],
    );
  }

  console.log(`[seed:marketplace] seeded ${pluginSeeds.length} plugins`);
}
