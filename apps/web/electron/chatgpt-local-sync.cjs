const { createHash } = require('node:crypto');
const { lstat, readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { extractDailySemanticFacts } = require('./daily-semantic-fact.cjs');

const SOURCE_TYPE = 'chatgpt-local-sync';
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const DEFAULT_HISTORICAL_START_DATE = '2026-08-01';

function archiveActivityDates(archive) {
  const dates = (archive.messages || []).map((message) => message.dateKey).filter(Boolean).sort();
  if (dates.length) return dates;
  const fallback = dateKey(archive.updatedAt);
  return fallback ? [fallback] : [];
}

function archiveMeetsHistoricalStart(archive, startDate = DEFAULT_HISTORICAL_START_DATE) {
  if (!startDate) return true;
  const dates = archiveActivityDates(archive);
  return dates.some((date) => date >= startDate);
}

function shanghaiDateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function dateKey(iso) {
  return shanghaiDateKey(iso);
}

function canonicalHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseArchive(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_archive');
  const conversationId = String(value.conversation_id || '').trim();
  if (!conversationId) throw new Error('missing_conversation_id');
  const rawMessages = Array.isArray(value.messages) ? value.messages : [];
  const messages = rawMessages.map((message) => {
    const id = String(message?.message_id || '').trim();
    const role = String(message?.role || '').trim();
    const occurredAt = typeof message?.occurred_at === 'string' ? message.occurred_at : '';
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    const messageDateKey = dateKey(occurredAt);
    if (!id || !['user', 'assistant', 'system', 'tool'].includes(role) || !messageDateKey) return null;
    return { id, role, occurredAt, dateKey: messageDateKey, content };
  }).filter(Boolean);
  const updatedAt = typeof value.update_time === 'string' && dateKey(value.update_time)
    ? value.update_time
    : messages.at(-1)?.occurredAt || null;
  if (!updatedAt) throw new Error('missing_update_time');
  return {
    sourceType: SOURCE_TYPE,
    conversationId,
    title: typeof value.title === 'string' ? value.title.trim().slice(0, 200) : '',
    createdAt: typeof value.create_time === 'string' ? value.create_time : null,
    updatedAt,
    messages,
    canonicalHash: canonicalHash({
      conversationId,
      updatedAt,
      messages: messages.map(({ id, role, occurredAt, content }) => ({ id, role, occurredAt, content })),
    }),
  };
}

function activityKind(text) {
  if (/(code|coding|scheduler|bug|debug|测试|回归|修复|开发|工程|代码)/i.test(text)) return 'engineering';
  if (/(research|paper|论文|研究|阅读)/i.test(text)) return 'research';
  if (/(learn|learning|学习|课程)/i.test(text)) return 'learning';
  if (/(plan|planning|计划|规划|方案)/i.test(text)) return 'planning';
  return null;
}

function sanitizeUserText(text) {
  return String(text || '')
    .replace(/忽略之前的?规则[^。；;\n]*/g, '')
    .replace(/执行\s*shell[;；]?/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[0-9a-f]{12,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEventTitle(text, completed, kind) {
  const cleaned = sanitizeUserText(text);
  const names = cleaned.match(/PlainList|Foreshadow|chatgpt-local-sync|DashScope|qwen[\w.+-]*|DeepSeek[\w.+-]*|scheduler|titlebar|Web|Desktop|Android|iOS|v?\d+\.\d+(?:\.\d+)?|[\u4e00-\u9fff]{2,12}(?:论文|项目|周报|小记|画像)?/gi) || [];
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 4);
  const verb = completed
    ? '完成'
    : /修复|排查|bug/i.test(cleaned) ? '修复'
      : /研究|阅读|论文/.test(cleaned) ? '研究'
        : /学习|课程/.test(cleaned) ? '学习'
          : '推进';
  if (unique.length) return `${verb}${unique.join(' ')}`.slice(0, 80);
  const fallback = { engineering: '软件工程', research: '研究', learning: '学习', planning: '规划' }[kind] || '工作';
  return completed ? `完成${fallback}` : `推进${fallback}`;
}

function normalizeFactKey(title) {
  return title.toLowerCase().replace(/[\s，,、]/g, '').slice(0, 24);
}

function selectLocalFacts(candidates) {
  const sorted = [...candidates].sort((left, right) => Number(right.completed) - Number(left.completed));
  const facts = [];
  const seen = new Set();
  for (const candidate of sorted) {
    const key = normalizeFactKey(candidate.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    facts.push({
      dateKey: candidate.dateKey,
      category: candidate.kind,
      title: candidate.title,
      completed: candidate.completed,
    });
    if (facts.length >= 3) break;
  }
  return facts;
}

function buildLocalDigest(archive) {
  const candidates = archive.messages
    .filter((message) => message.role === 'user')
    .map((message) => {
      const kind = activityKind(message.content);
      if (!kind) return null;
      const completed = /(已完成|完成|修复|解决|提交|发布|补了|写完)/.test(message.content);
      return {
        dateKey: message.dateKey,
        kind,
        completed,
        title: extractEventTitle(message.content, completed, kind),
      };
    })
    .filter(Boolean);
  const facts = selectLocalFacts(candidates);
  const latest = facts.at(-1);
  return {
    sourceType: SOURCE_TYPE,
    sourceExternalId: archive.conversationId,
    idempotencyKey: canonicalHash({ sourceType: SOURCE_TYPE, conversationId: archive.conversationId }).slice(0, 64),
    dateKey: latest?.dateKey || dateKey(archive.updatedAt),
    occurredAt: archive.updatedAt,
    summary: facts.length ? '从 ChatGPT 本地对话中提取到有意义的用户活动。' : '没有可提取的用户活动。',
    activities: facts.map((fact) => fact.title),
    outputs: facts.filter((fact) => fact.completed).map((fact) => fact.title),
    learnings: [],
    decisions: [],
    unresolved: [],
    localFacts: facts,
    dailySemanticFacts: extractDailySemanticFacts(archive),
  };
}

async function readStableJson(filePath, before, dependencies = {}) {
  const read = dependencies.readFile || readFile;
  const stat = dependencies.lstat || lstat;
  let text;
  try {
    text = await read(filePath, 'utf8');
    const after = await stat(filePath);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      return { ok: false, code: 'file_changed_during_read' };
    }
  } catch {
    return { ok: false, code: 'file_unavailable' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: 'partial_json' };
  }
}

async function scanArchiveDirectory(rootDirectory) {
  const archives = [];
  const issues = [];
  const jsonRoot = path.join(rootDirectory, 'JSON');

  async function visit(directory) {
    const relativeDirectory = path.relative(jsonRoot, directory).split(path.sep);
    if (relativeDirectory.some((segment) => segment === '已删除' || segment === 'Deleted')) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      issues.push({ code: 'directory_unavailable', path: directory, retryable: true });
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(directory, entry.name);
      let info;
      try {
        info = await lstat(filePath);
      } catch {
        issues.push({ code: 'file_unavailable', path: filePath, retryable: true });
        continue;
      }
      if (info.isSymbolicLink()) {
        issues.push({ code: 'symlink_skipped', path: filePath, retryable: false });
        continue;
      }
      if (info.isDirectory()) {
        await visit(filePath);
        continue;
      }
      if (!info.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      if (info.size > MAX_ARCHIVE_BYTES) {
        issues.push({ code: 'oversize_json', path: filePath, retryable: false });
        continue;
      }
      const stableRead = await readStableJson(filePath, info);
      if (!stableRead.ok) {
        issues.push({ code: stableRead.code, path: filePath, retryable: true });
        continue;
      }
      try {
        archives.push({ ...parseArchive(stableRead.value), path: path.relative(rootDirectory, filePath) });
      } catch (error) {
        issues.push({ code: error instanceof Error ? error.message : 'invalid_archive', path: filePath, retryable: false });
      }
    }
  }

  await visit(jsonRoot);
  return { archives, issues: issues.sort((left, right) => left.code.localeCompare(right.code)) };
}

function detectChangedArchives(archives, state = {}) {
  const changed = [];
  const unchanged = [];
  const nextState = { ...state };
  for (const archive of archives) {
    const previous = state[archive.conversationId] || {};
    const previousHash = previous.lastProcessedHash || previous.canonicalHash;
    const requiresHistoricalBackfill = previous.processingStatus === 'bootstrap_skipped';
    if (previousHash === archive.canonicalHash && !requiresHistoricalBackfill) unchanged.push(archive);
    else changed.push(archive);
    nextState[archive.conversationId] = {
      sourceType: SOURCE_TYPE,
      sourceExternalId: archive.conversationId,
      canonicalHash: archive.canonicalHash,
      lastSeenUpdateTime: archive.updatedAt,
      lastProcessedHash: previous.lastProcessedHash || previous.canonicalHash || null,
      lastSuccessfulDigestAt: previous.lastSuccessfulDigestAt || null,
      processingStatus: previousHash === archive.canonicalHash && !requiresHistoricalBackfill ? 'up_to_date' : 'pending',
      safeErrorCode: null,
    };
  }
  return { changed, unchanged, nextState };
}

module.exports = {
  MAX_ARCHIVE_BYTES,
  SOURCE_TYPE,
  DEFAULT_HISTORICAL_START_DATE,
  archiveMeetsHistoricalStart,
  buildLocalDigest,
  canonicalHash,
  dateKey,
  detectChangedArchives,
  parseArchive,
  readStableJson,
  scanArchiveDirectory,
  shanghaiDateKey,
};
