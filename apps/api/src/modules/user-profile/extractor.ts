import { createHash } from 'node:crypto';

export interface ReviewInput {
  reviewDate: string;
  content: string;
}

export interface ProfileEvidenceCandidate {
  traitKey: string;
  title: string;
  generatedSummary: string;
  reviewDate: string;
  excerpt: string;
  observation: string;
  impactNote: string;
  weight: number;
  sourceHash: string;
}

interface TraitDefinition {
  traitKey: string;
  title: string;
  generatedSummary: string;
  observation: string;
  impactNote: string;
  weight: number;
  matcher: (sentence: string) => boolean;
}

const TRAITS: TraitDefinition[] = [
  {
    traitKey: 'sleep_rest_delay_buffer',
    title: '睡眠或休息后延缓冲',
    generatedSummary: '日记多次提到起床、午睡或休息没有按原计划结束；当后续没有硬约束时，排程应预留 30-45 分钟缓冲，避免牺牲下午状态。',
    observation: '日记提到睡眠/休息阶段发生后延或需要继续休息。',
    impactNote: '遇到“睡到某时”“休息一会”等表达时，可对低优先级后续任务加入约 40 分钟弹性缓冲。',
    weight: 0.82,
    matcher: (sentence) =>
      /(睡|午睡|补觉|起床|醒|休息|躺).{0,18}(没睡舒服|不舒服|没起来|起不来|晚起|多睡|再睡|赖床|推迟|延后|耽误|拖了|晚了|缓一会)/
        .test(sentence)
      || /(多睡|再睡|补觉|赖床|晚起).{0,18}(分钟|小时|一会|一下|会儿)/.test(sentence),
  },
  {
    traitKey: 'fuzzy_time_uncertainty',
    title: '模糊时间表达需要弹性解释',
    generatedSummary: '日记中出现“大约、左右、提前一会、晚点”等不确定时间粒度；解析这类表达时不应当作精确时间点，应在 why 中说明假设。',
    observation: '日记使用了不确定时间表达或提到计划时间并不精确。',
    impactNote: '遇到“大约/左右/一会/提前一点”等词时，按 15-30 分钟弹性处理，不强制精确卡点。',
    weight: 0.64,
    matcher: (sentence) =>
      /(大约|大概|左右|差不多|提前一会|提早一会|提前一点|提早一点|晚点|一会儿|一会|过会儿|过会|估计|可能|看情况)/
        .test(sentence),
  },
  {
    traitKey: 'rest_quality_tradeoff',
    title: '为工作质量保留恢复时间',
    generatedSummary: '日记显示用户会为了下午/后续工作质量选择延后低优先级计划；排程时应区分硬约束和可移动任务。',
    observation: '日记把休息、睡眠或延后计划与后续状态/效率/质量联系起来。',
    impactNote: '当用户明确后续没有硬约束时，允许移动低优先级任务来保护工作质量；硬性会议和 deadline 不受影响。',
    weight: 0.76,
    matcher: (sentence) =>
      /(质量|效率|状态|精神|舒服|清醒).{0,20}(好|更好|保证|恢复|提升|不差)/
        .test(sentence)
      || /(保证|为了|换取).{0,20}(质量|效率|状态|精神|舒服|清醒)/.test(sentence),
  },
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitSentences(content: string): string[] {
  return content
    .split(/[。！？!?；;\n]+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length >= 4);
}

function clip(text: string, maxLength: number): string {
  const normalized = normalizeWhitespace(text);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function sourceHash(userStableInput: string): string {
  return createHash('sha256').update(userStableInput).digest('hex');
}

export function extractProfileEvidenceFromReviews(reviews: ReviewInput[]): ProfileEvidenceCandidate[] {
  const candidates: ProfileEvidenceCandidate[] = [];
  const seen = new Set<string>();

  for (const review of reviews) {
    for (const sentence of splitSentences(review.content)) {
      for (const trait of TRAITS) {
        if (!trait.matcher(sentence)) {
          continue;
        }

        const hash = sourceHash(`${review.reviewDate}|${trait.traitKey}|${sentence}`);
        if (seen.has(hash)) {
          continue;
        }
        seen.add(hash);

        candidates.push({
          traitKey: trait.traitKey,
          title: trait.title,
          generatedSummary: trait.generatedSummary,
          reviewDate: review.reviewDate,
          excerpt: clip(sentence, 500),
          observation: trait.observation,
          impactNote: trait.impactNote,
          weight: trait.weight,
          sourceHash: hash,
        });
      }
    }
  }

  return candidates;
}
