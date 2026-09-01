const { createHash } = require('node:crypto');
const { lstat, readdir, readFile } = require('node:fs/promises');
const path = require('node:path');

const SOURCE_TYPE = 'chatgpt-local-sync';
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;

function dateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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

function labelsFor(kind, completed) {
  const label = {
    engineering: '软件工程',
    research: '研究',
    learning: '学习',
    planning: '规划',
  }[kind];
  return {
    activity: kind === 'engineering' && completed
      ? '排查并修复软件工程问题'
      : completed ? `推进${label}工作` : `开展${label}工作`,
    output: completed ? `完成${label}工作` : null,
  };
}

function buildLocalDigest(archive) {
  const candidates = archive.messages
    .filter((message) => message.role === 'user')
    .map((message) => ({ ...message, kind: activityKind(message.content) }))
    .filter((message) => message.kind);
  const lastByKind = new Map();
  for (const candidate of candidates) lastByKind.set(candidate.kind, candidate);
  const facts = [...lastByKind.values()].map((candidate) => {
    const completed = /(已完成|完成|修复|解决|提交|发布|补了|写完)/.test(candidate.content);
    const labels = labelsFor(candidate.kind, completed);
    return { dateKey: candidate.dateKey, category: candidate.kind, title: labels.activity, completed };
  });
  const latest = facts.at(-1);
  return {
    sourceType: SOURCE_TYPE,
    sourceExternalId: archive.conversationId,
    idempotencyKey: canonicalHash({ sourceType: SOURCE_TYPE, conversationId: archive.conversationId }).slice(0, 64),
    dateKey: latest?.dateKey || dateKey(archive.updatedAt),
    occurredAt: archive.updatedAt,
    summary: facts.length ? '从 ChatGPT 本地对话中提取到有意义的用户活动。' : '没有可提取的用户活动。',
    activities: facts.map((fact) => fact.title),
    outputs: facts.filter((fact) => fact.completed).map((fact) => labelsFor(fact.category, true).output),
    learnings: [],
    decisions: [],
    unresolved: [],
    localFacts: facts,
  };
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
      let value;
      try {
        value = JSON.parse(await readFile(filePath, 'utf8'));
      } catch {
        issues.push({ code: 'partial_json', path: filePath, retryable: true });
        continue;
      }
      try {
        archives.push({ ...parseArchive(value), path: path.relative(rootDirectory, filePath) });
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
    if (previousHash === archive.canonicalHash) unchanged.push(archive);
    else changed.push(archive);
    nextState[archive.conversationId] = {
      sourceType: SOURCE_TYPE,
      sourceExternalId: archive.conversationId,
      canonicalHash: archive.canonicalHash,
      lastSeenUpdateTime: archive.updatedAt,
      lastProcessedHash: previous.lastProcessedHash || previous.canonicalHash || null,
      lastSuccessfulDigestAt: previous.lastSuccessfulDigestAt || null,
      processingStatus: previousHash === archive.canonicalHash ? 'up_to_date' : 'pending',
      safeErrorCode: null,
    };
  }
  return { changed, unchanged, nextState };
}

module.exports = { MAX_ARCHIVE_BYTES, SOURCE_TYPE, buildLocalDigest, canonicalHash, detectChangedArchives, parseArchive, scanArchiveDirectory };
