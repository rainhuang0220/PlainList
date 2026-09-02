import { describe, expect, it } from 'vitest';
import { renderSafeMarkdown } from './safeMarkdown';

describe('safe ChatGPT journal markdown', () => {
  it('renders supported reading elements', () => {
    const html = renderSafeMarkdown('## 标题\n\n- **完成**：`code`\n\n[资料](https://example.com)');
    expect(html).toContain('<h2>标题</h2>');
    expect(html).toContain('<strong>完成</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('href="https://example.com"');
  });

  it('never executes raw HTML or unsafe links', () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>\n\n[run](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;');
  });
});
