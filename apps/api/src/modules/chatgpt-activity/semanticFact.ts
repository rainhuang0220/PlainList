const ACTION_VERB = /完成|修复|解决|提交|发布|补了|写完|重写|修改|核对|调整|排查|确认|讨论|计划|推进|部署|验收|生成|测试|封板|合入|学习|研究|阅读|重构|梳理|区分|指出|准备/;
const INTERNAL = /没有可提取的用户|无有效活动|\bextract\b|\bfallback\b|\bconversation\b|用户消息|对话标题|无论你怎么收口/i;

export function chineseCharCount(text: string): number {
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

export function chineseWordCount(text: string): number {
  return (String(text || '').match(/[\u4e00-\u9fff]/g) || []).length;
}

export function isKeywordDump(text: string): boolean {
  const value = String(text || '').trim();
  if (/^(完成|推进|修复|研究|学习)[\u4e00-\u9fffA-Za-z0-9.]+( [\u4e00-\u9fffA-Za-z0-9.]+){1,4}$/.test(value)
    && !/[的了与和，,]/.test(value)) return true;
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.length >= 5 && !/[的了与和，,]/.test(value);
}

export function isCompleteSemanticFact(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (chineseWordCount(raw) < 8 || raw.length > 240) return false;
  if (!ACTION_VERB.test(raw)) return false;
  if (INTERNAL.test(raw)) return false;
  if (/\b10\.\d{4}|https?:\/\//i.test(raw)) return false;
  if (isKeywordDump(raw)) return false;
  if (chineseWordCount(raw) < 8 && /[A-Z][a-z]+ [A-Z]/.test(raw)) return false;
  if (
    chineseWordCount(raw) < 16
    && !/[的了]/.test(raw)
    && !/计划第二天/.test(raw)
    && !/^(完成了|讨论了|计划|继续|核对了|修改了|修复了|确认|排查了|发布了)/.test(raw)
  ) return false;
  if (/[？?]$/.test(raw) || /[吗呢]$/.test(raw.replace(/。$/, ''))) return false;
  if (/image_asset_pointer|sediment:\/\//i.test(raw)) return false;
  if (/工作树干净|基线已核对|LIVE VISION BLOCKED/.test(raw)) return false;
  if (/讨论了.{0,16}的(嗯|那你|如何|怎么|你|反正|给一下)/.test(raw)) return false;
  if (/IMPLEMENTATION|cite呗|有什么好的方案|是吧|你看下|写一个提示词|请重新打开终端|使环境变量生效/.test(raw)) return false;
  if (/^继续推进/.test(raw) && !/PlainList|Foreshadow|论文|whereToken/i.test(raw)) return false;
  if (/[`*#]/.test(raw) || /(^|\n)\s*[-*] /.test(raw)) return false;
  return true;
}

export function ensurePeriod(text: string): string {
  const value = String(text || '').replace(/[。；;]+$/u, '').trim();
  return value ? `${value}。` : '';
}
