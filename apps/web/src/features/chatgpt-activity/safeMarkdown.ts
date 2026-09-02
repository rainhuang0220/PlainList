export function renderSafeMarkdown(markdown: string): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const inline = (value: string) => {
    let text = escape(value);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const decoded = href.replaceAll('&amp;', '&').trim();
      if (!/^(https?:\/\/|mailto:)/i.test(decoded)) return label;
      return `<a href="${escape(decoded)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return text;
  };

  const output: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) output.push('</ul>');
    listOpen = false;
  };
  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      if (!listOpen) { output.push('<ul>'); listOpen = true; }
      output.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return output.join('\n');
}
