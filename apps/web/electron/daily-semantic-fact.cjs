const ACTION_VERB = /完成|修复|解决|提交|发布|补了|写完|重写|修改|核对|调整|排查|确认|讨论|计划|推进|部署|验收|生成|测试|封板|合入|学习|研究|阅读|重构|梳理|区分|指出|准备/;
const COMPLETE_LEAD = /^(完成了|讨论了|计划了|计划第二天|核对了|修改了|修复了|确认了|排查了|发布了)/;
const BANNED = /没有可提取的用户|无有效活动|\bextract\b|\bfallback\b|\bconversation\b|用户消息|对话标题|无论你怎么收口|来grok提示词|给grok的提示词|直接输出提示词|直接生成给grok/i;
const META_TURN = /^(来|来提示词|来grok提示词|直接输出|直接输出提示词|go on|继续|嗯|好|好的|ok|打爆你)[。！？!?.]*$/i;
const PROMPT_REQUEST = /来grok|给grok的提示词|直接输出提示词|直接生成给grok|给我(?:grok)?提示词/;
const PROJECT = /PlainList|Foreshadow|whereToken|chatgpt-local-sync|Locus|伏笔|论文|Daily Journal|AI 小记/i;

function chineseCount(text) {
  return (String(text || '').match(/[\u4e00-\u9fff]/g) || []).length;
}

function sanitizeUserText(text) {
  return String(text || '')
    .replace(/忽略之前的?规则[^。；;\n]*/g, '')
    .replace(/执行\s*shell[;；]?/gi, '')
    .replace(/\[image_asset_pointer:[^\]]+\]/gi, ' ')
    .replace(/sediment:\/\/\S+/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b10\.\d{4,9}\/[^\s，。；;]+/g, ' ')
    .replace(/\b10\.\d{4,9}\b/g, ' ')
    .replace(/\b[0-9a-f]{12,}\b/gi, ' ')
    .replace(/sk-[a-zA-Z0-9]{8,}/g, ' ')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensurePeriod(text) {
  const value = String(text || '').replace(/[。；;]+$/u, '').trim();
  return value ? `${value}。` : '';
}

function isKeywordDump(text) {
  const value = String(text || '').trim();
  if (/^(完成|推进|修复|研究|学习)[\u4e00-\u9fffA-Za-z0-9.]+( [\u4e00-\u9fffA-Za-z0-9.]+){1,4}$/.test(value)
    && !/[的了与和，,]/.test(value)) return true;
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.length >= 5 && !/[的了与和，,]/.test(value);
}

function isCompleteSemanticFact(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (chineseCount(raw) < 8 || raw.length > 240) return false;
  if (!ACTION_VERB.test(raw)) return false;
  if (BANNED.test(raw)) return false;
  if (/\b10\.\d{4}|https?:\/\//i.test(raw)) return false;
  if (isKeywordDump(raw)) return false;
  if (chineseCount(raw) < 8 && /[A-Z][a-z]+ [A-Z]/.test(raw)) return false;
  if (chineseCount(raw) < 16 && !/[的了]/.test(raw) && !/计划第二天/.test(raw)) return false;
  if (/[？?]$/.test(raw) || /[吗呢]$/.test(raw.replace(/。$/, ''))) return false;
  if (/image_asset_pointer|sediment:\/\//i.test(raw)) return false;
  if (/工作树干净|基线已核对|LIVE VISION BLOCKED/.test(raw)) return false;
  if (/讨论了.{0,16}的(嗯|那你|如何|怎么|你|反正|给一下)/.test(raw)) return false;
  if (/IMPLEMENTATION|cite呗|有什么好的方案|是吧|你看下|写一个提示词|请重新打开终端|使环境变量生效/.test(raw)) return false;
  if (/^继续推进/.test(raw) && !PROJECT.test(raw)) return false;
  if (/[`*#]/.test(raw) || /(^|\n)\s*[-*] /.test(raw)) return false;
  if (META_TURN.test(raw.replace(/。$/, ''))) return false;
  return true;
}

function activityKind(text) {
  if (/(code|coding|scheduler|bug|debug|测试|回归|修复|开发|工程|代码|重写|发布|封板|部署|验收)/i.test(text)) return 'engineering';
  if (/(research|paper|论文|研究|阅读|参考文献|related work|摘要)/i.test(text)) return 'research';
  if (/(learn|learning|学习|课程|huggingface|transformers)/i.test(text)) return 'learning';
  if (/(plan|planning|计划|规划|方案|下一步)/i.test(text)) return 'planning';
  return null;
}

function isMeaningfulActivity(text) {
  if (activityKind(text)) return true;
  if (ACTION_VERB.test(text) && (PROJECT.test(text) || chineseCount(text) >= 16)) return true;
  if (PROJECT.test(text) && /(可以当产品用|请装\s*v?\d|发布完成|已发布|封板结果)/.test(text)) return true;
  return false;
}

function stripBannedPhrases(text) {
  return String(text || '')
    .replace(/无论你怎么收口[，,]?/g, '')
    .replace(/直接生成给grok的提示词/g, '')
    .replace(/来grok提示词/g, '')
    .replace(/给grok的提示词/g, '')
    .replace(/直接输出提示词/g, '')
    .replace(/没有可提取的用户活动。?/g, '')
    .replace(/无有效活动。?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInstructionResidue(text) {
  return /^(你(可以|应该)|请你|给我|选择草草|草草收尾|一晚上)/.test(text)
    || /你可以选择草草收尾/.test(text)
    || /你觉得|叫什么名称/.test(text);
}

function isQuestion(text) {
  const value = String(text || '').replace(/。$/u, '');
  return /[？?]$/.test(value) || /[吗呢]$/.test(value);
}

function isCleanObject(text) {
  const value = String(text || '').trim();
  if (!value || isQuestion(value) || isInstructionResidue(value)) return false;
  if (/嗯，|HTTP |image_|工作树干净|基线已核对|IMPLEMENTATION|cite呗|有什么好的方案/.test(value)) return false;
  if (/[：:]/.test(value) || /^\d+\./.test(value) || /你之前|反正我|给我|看一下/.test(value)) return false;
  const count = chineseCount(value);
  return count >= 4 && count <= 24;
}

function isNoiseSentence(text) {
  const cleaned = stripBannedPhrases(sanitizeUserText(text));
  if (!cleaned) return true;
  if (META_TURN.test(cleaned)) return true;
  if (BANNED.test(cleaned) && !/明天/.test(cleaned) && !/两篇论文|参考文献/.test(cleaned)) return true;
  if (PROMPT_REQUEST.test(cleaned) && chineseCount(cleaned) < 40) return true;
  if (isInstructionResidue(cleaned)) return true;
  if (isQuestion(cleaned) && !/完成|修复|核对|计划第二天/.test(cleaned)) return true;
  if (chineseCount(cleaned) < 6 && !PROJECT.test(cleaned)) return true;
  const doiCount = (String(text).match(/\b10\.\d{4,9}/g) || []).length;
  if (doiCount >= 1 && chineseCount(cleaned) < 16) return true;
  if (/vol\.\s*\d+|pp\.\s*\d+|“[^”]{2,80},”/.test(text) && chineseCount(cleaned) < 12) return true;
  if (/sk-[a-zA-Z0-9]{8,}/.test(text) && chineseCount(cleaned) < 24) return true;
  return false;
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\n+/g, '。')
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.replace(/[。！？!?；;]+$/u, '').trim())
    .filter(Boolean);
}

function topicFrom(text, title) {
  const blob = `${text || ''} ${title || ''}`;
  if (/plainlist/i.test(blob)) return 'PlainList';
  if (/foreshadow|伏笔/i.test(blob)) return 'Foreshadow';
  if (/wheretoken/i.test(blob)) return 'whereToken';
  if (/论文|related work|相关工作|参考文献|摘要|method/i.test(text || '')) return '论文';
  if (/huggingface|transformers|\bllm\b|学习/i.test(text || '')) return '学习';
  const hint = String(title || '').trim();
  if (/^plainlist$/i.test(hint)) return 'PlainList';
  if (/^foreshadow/i.test(hint) || /^foreshadow/i.test(hint.split(/[\s与和]/)[0] || '')) return 'Foreshadow';
  return '工作';
}

function statusFrom(text) {
  if (/(已完成|完成了|已修复|已发布|发布完成|封板|合入|写完|可以当产品用)/.test(text)) return 'completed';
  if (/(明天|计划|下一步|准备安装|请装)/.test(text) && !/(已完成|完成了|已发布)/.test(text)) return 'planned';
  if (/(修复|排查|推进|继续|修改|重写|核对)/.test(text)) return 'progress';
  return 'discussed';
}

function clipSentence(text, limit = 80) {
  const value = ensurePeriod(text);
  if (chineseCount(value) <= limit) return value;
  const parts = value.replace(/。$/u, '').split(/[，,；;]/);
  let next = '';
  for (const part of parts) {
    const trial = next ? `${next}，${part}` : part;
    if (chineseCount(trial) > limit) break;
    next = trial;
  }
  return ensurePeriod(next || value);
}

function stripTitle(text, title) {
  const hint = String(title || '').trim();
  if (!hint || hint.length < 4) return text;
  return String(text || '').split(hint).join(' ').replace(/\s+/g, ' ').trim();
}

function wrapFact(object, status, topic) {
  let obj = String(object || '').replace(/^[的了与和，,]+/, '').trim();
  if (topic && topic !== '工作' && !obj.includes(topic) && chineseCount(obj) < 28) {
    if (status === 'planned' && /测试/.test(obj)) obj = `对${topic}进行${obj.replace(/^进行/, '')}`;
    else if (!obj.startsWith(topic)) obj = `${topic}的${obj}`.replace(/的的/g, '的');
  }
  const leads = {
    completed: `完成了${obj}`,
    progress: `继续推进${obj}`,
    planned: `计划${obj}`,
    discussed: `讨论了${obj}`,
  };
  return clipSentence(leads[status] || leads.discussed);
}

function toDeclarative(sentence, topic, title) {
  let value = stripBannedPhrases(stripTitle(sanitizeUserText(sentence), title));
  if (!value || isInstructionResidue(value)) return null;
  value = value
    .replace(/^(请你?|帮我|麻烦你?|我今天|今天我|今天|我)/, '')
    .replace(/[？?]+$/, '')
    .trim();
  if (!value) return null;

  if (/明天/.test(value) && /测试/.test(value)) {
    const planned = topic && topic !== '工作'
      ? (/产品测试/.test(value)
        ? `计划第二天继续对${topic}进行产品测试`
        : `计划第二天继续测试${topic}`)
      : '计划第二天继续进行测试';
    const fact = clipSentence(planned);
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  if (/两篇论文/.test(value) && /(录用|投)/.test(value)) {
    const fact = /参考文献/.test(value)
      ? '讨论了已录用论文与在投论文的区分，并核对了参考文献。'
      : '讨论了已录用论文与在投论文的区分。';
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  if (/乱加参考文献|参考文献/.test(value) && /论文|相关工作/.test(value + topic)) {
    const fact = clipSentence('核对了论文相关工作中的参考文献');
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  if (/可以当产品用/.test(value) && topic && topic !== '工作') {
    const fact = clipSentence(`确认${topic}当前版本已经可以当产品使用`);
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  if (/请装/.test(value) && /v?\d+\.\d+/.test(value) && topic && topic !== '工作') {
    const version = value.match(/v?\d+\.\d+(?:\.\d+)?/);
    const fact = clipSentence(`计划安装${topic}${version ? ` ${version[0]}` : ''}`);
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  if (/^(这是|包括有|所以|然后|结论[:：]|嗯)/.test(value)) return null;
  if (isQuestion(value)) return null;
  if (/封板/.test(value) && topic && topic !== '工作') {
    const fact = clipSentence(`完成了${topic}当前版本封板`);
    return isCompleteSemanticFact(fact) ? fact : null;
  }
  if (/已发布完成|发布完成/.test(value) && topic && topic !== '工作') {
    const version = value.match(/v\d+\.\d+(?:\.\d+)?/);
    const fact = clipSentence(`完成了${topic}${version ? ` ${version[0]}` : ''}版本的正式发布`);
    return isCompleteSemanticFact(fact) ? fact : null;
  }

  const rewritten = value
    .replace(/^本轮已完成并处理了/, '完成了')
    .replace(/^本轮已完成并/, '完成了')
    .replace(/^已完成/, '完成了')
    .replace(/^已修复/, '修复了');
  const withTopic = topic && topic !== '工作' && /^完成了/.test(rewritten) && !rewritten.includes(topic)
    ? rewritten.replace(/^完成了/, `完成了${topic}`)
    : rewritten;
  const direct = clipSentence(withTopic);
  if (COMPLETE_LEAD.test(direct) && isCompleteSemanticFact(direct)) return direct;

  const status = statusFrom(value);
  if (!/^(排查|修复|修改|核对|调整|重写|验收)/.test(value)) return null;
  let object = value
    .replace(/^(请你?|帮我|已)?(完成了|完成|修复了|修复|讨论了|讨论|计划了|计划|推进了|推进|核对了|核对|修改了|修改|排查了|排查|确认了|确认|继续推进|继续)/, '')
    .replace(/^了/, '')
    .trim();
  if (!isCleanObject(object)) return null;
  const wrapped = wrapFact(object, status === 'discussed' ? 'progress' : status, topic);
  return isCompleteSemanticFact(wrapped) ? wrapped : null;
}

function importance(status) {
  return { completed: 0, progress: 1, planned: 2, discussed: 3 }[status] ?? 4;
}

function selectFacts(candidates) {
  const sorted = [...candidates].sort((left, right) => importance(left.status) - importance(right.status)
    || String(left.dateKey).localeCompare(String(right.dateKey)));
  const facts = [];
  const seen = new Set();
  const perDate = new Map();
  for (const candidate of sorted) {
    const key = candidate.summary.replace(/\s+/g, '').slice(0, 24);
    if (!key || seen.has(key)) continue;
    const dateCount = perDate.get(candidate.dateKey) || 0;
    if (dateCount >= 3) continue;
    seen.add(key);
    perDate.set(candidate.dateKey, dateCount + 1);
    facts.push({
      topic: candidate.topic,
      status: candidate.status,
      summary: candidate.summary,
      occurredAt: candidate.occurredAt,
      dateKey: candidate.dateKey,
      sourceConversationId: candidate.sourceConversationId,
    });
  }
  return facts.slice(0, 8);
}

function extractDailySemanticFacts(archive) {
  const title = String(archive.title || '');
  const users = (archive.messages || []).filter((message) => message.role === 'user');
  const conversationText = users.map((message) => message.content).join('\n');
  const topic = topicFrom(conversationText, title);
  const candidates = [];

  for (const message of users) {
    if (!isMeaningfulActivity(message.content)) continue;
    const prepared = stripBannedPhrases(message.content);
    if (isNoiseSentence(prepared) && chineseCount(sanitizeUserText(prepared)) < 24) continue;
    const sentences = splitSentences(prepared);
    for (const sentence of sentences) {
      if (isNoiseSentence(sentence)) continue;
      const summary = toDeclarative(sentence, topic, title);
      if (!summary) continue;
      if (title && summary.includes(title)) continue;
      if (!isCompleteSemanticFact(summary)) continue;
      candidates.push({
        topic: topicFrom(`${summary} ${message.content}`, title) || topic,
        status: statusFrom(`${sentence} ${message.content}`),
        summary,
        occurredAt: message.occurredAt,
        dateKey: message.dateKey,
        sourceConversationId: archive.conversationId,
      });
    }
  }

  return selectFacts(candidates);
}

module.exports = {
  extractDailySemanticFacts,
  isCompleteSemanticFact,
  sanitizeUserText,
};
