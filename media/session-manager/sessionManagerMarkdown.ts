const MARKDOWN_MAX_LENGTH = 100000;
const MAX_TABLE_ROWS = 100;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function processTableBuffer(lines: string[], maxRows: number): string {
  if (lines.length < 2 || lines.length > maxRows) {
    return lines.join('\n');
  }

  if (!/^\|[\s\-:|]+\|$/.test(lines[1].trim())) {
    return lines.join('\n');
  }

  const headerCells = lines[0].split('|').filter((cell) => cell.trim() !== '');
  if (headerCells.length === 0) {
    return lines.join('\n');
  }

  const headerHtml = `<tr>${headerCells.map((cell) => `<th>${cell.trim()}</th>`).join('')}</tr>`;
  const bodyHtml = lines
    .slice(2)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split('|').filter((cell) => cell.trim() !== '');
      return `<tr>${cells.map((cell) => `<td>${cell.trim()}</td>`).join('')}</tr>`;
    })
    .join('');

  return `<table class="markdown-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}

function convertMarkdownLists(text: string): string {
  const listLineRegex = /^\s*(?:[-*]|\d+\.)\s.*$/;
  const lines = text.split('\n');
  const output: string[] = [];
  let listBuffer: string[] = [];

  type ListNode = { type: 'ul' | 'ol'; items: Array<{ text: string; children: ListNode[] }>; start: number | null };

  function renderListNode(node: ListNode): string {
    const startAttr = node.type === 'ol' && typeof node.start === 'number' && node.start > 1 ? ` start="${node.start}"` : '';
    return `<${node.type}${startAttr}>${node.items.map((item) => `<li>${item.text}${item.children.map(renderListNode).join('')}</li>`).join('')}</${node.type}>`;
  }

  function processListBuffer(buffer: string[]): string {
    const listItemRegex = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    const rootLists: ListNode[] = [];
    let stack: Array<{ type: 'ul' | 'ol'; list: ListNode; lastItem: ListNode['items'][number] | null }> = [];

    buffer.forEach((line) => {
      const match = listItemRegex.exec(line);
      if (!match) {
        return;
      }

      const indent = match[1].replace(/\t/g, '    ').length;
      const depth = Math.floor(indent / 2);
      const marker = match[2];
      const type = marker === '-' || marker === '*' ? 'ul' : 'ol';
      const itemText = match[3];

      while (stack.length > depth + 1) {
        stack.pop();
      }

      let entry = stack[depth];
      if (!entry || entry.type !== type) {
        const listNode: ListNode = {
          type,
          items: [],
          start: type === 'ol' ? Number.parseInt(marker, 10) : null
        };

        if (depth === 0) {
          rootLists.push(listNode);
        } else {
          const parentEntry = stack[depth - 1];
          if (parentEntry?.lastItem) {
            parentEntry.lastItem.children.push(listNode);
          } else {
            rootLists.push(listNode);
          }
        }

        entry = { type, list: listNode, lastItem: null };
      }

      stack = stack.slice(0, depth);
      stack[depth] = entry;

      const item = { text: itemText, children: [] };
      entry.list.items.push(item);
      entry.lastItem = item;
      stack[depth] = entry;
    });

    return rootLists.map(renderListNode).join('');
  }

  lines.forEach((line) => {
    if (listLineRegex.test(line)) {
      listBuffer.push(line);
      return;
    }

    if (listBuffer.length > 0) {
      output.push(processListBuffer(listBuffer));
      listBuffer = [];
    }

    output.push(line);
  });

  if (listBuffer.length > 0) {
    output.push(processListBuffer(listBuffer));
  }

  return output.join('\n');
}

export function renderMarkdown(text: string): string {
  if (!text) {
    return '';
  }

  let processedText = text;
  if (processedText.length > MARKDOWN_MAX_LENGTH) {
    processedText = `${processedText.slice(0, MARKDOWN_MAX_LENGTH)}\n... (content truncated for display)`;
  }

  processedText = processedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const codeBlocks: Array<{ lang: string; code: string }> = [];
  const inlineCodeSpans: string[] = [];

  processedText = processedText.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.trim() });
    return `%%CODEBLOCK${index}%%`;
  });

  processedText = processedText.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const index = inlineCodeSpans.length;
    inlineCodeSpans.push(code);
    return `%%INLINECODE${index}%%`;
  });

  let html = escapeHtml(processedText);

  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/^\*\*\*+$/gm, '<hr>');
  html = html.replace(/^&gt;\s*(.*)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  html = convertMarkdownLists(html);

  const tableLines = html.split('\n');
  const processedLines: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  tableLines.forEach((line) => {
    if (/^\|.+\|$/.test(line.trim())) {
      tableBuffer.push(line);
      inTable = true;
      return;
    }

    if (inTable && tableBuffer.length >= 2) {
      processedLines.push(processTableBuffer(tableBuffer, MAX_TABLE_ROWS));
    }

    tableBuffer = [];
    inTable = false;
    processedLines.push(line);
  });

  if (inTable && tableBuffer.length >= 2) {
    processedLines.push(processTableBuffer(tableBuffer, MAX_TABLE_ROWS));
  }

  html = processedLines.join('\n');

  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a class="markdown-link" href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/(^|[^\p{L}\p{N}_*])\*([\p{L}\p{N}](?:[^*\n]*?[\p{L}\p{N}])?)\*(?=[^\p{L}\p{N}_*]|$)/gu, '$1<em>$2</em>');
  html = html.replace(/(^|[^\p{L}\p{N}_])_([^_\s](?:[^_]*[^_\s])?)_(?=[^\p{L}\p{N}_]|$)/gu, '$1<em>$2</em>');

  inlineCodeSpans.forEach((code, index) => {
    html = html.replace(`%%INLINECODE${index}%%`, `<code class="inline-code">${escapeHtml(code)}</code>`);
  });

  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/ol>|<\/blockquote>|<\/table>|<hr>)\n/g, '$1');
  html = html.replace(/\n/g, '<br>');

  codeBlocks.forEach((block, index) => {
    const langAttr = block.lang ? ` data-lang="${block.lang}"` : '';
    const replacement = `<pre class="code-block"${langAttr}><code>${escapeHtml(block.code)}</code></pre>`;
    html = html.replace(`%%CODEBLOCK${index}%%`, replacement);
  });

  html = html.replace(/(<br>)+(<pre|<h[1-6]|<ul|<ol|<blockquote|<table|<hr)/g, '$2');
  html = html.replace(/(<\/pre>|<\/h[1-6]>|<\/ul>|<\/ol>|<\/blockquote>|<\/table>|<hr>)(<br>)+/g, '$1');

  return html;
}