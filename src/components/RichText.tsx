const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'a',
  'img',
  'figure',
  'figcaption',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td'
]);

const GLOBAL_ALLOWED_ATTRS = new Set(['id']);
const TAG_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan'])
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeAttrValue(matchGroups: RegExpExecArray) {
  return (matchGroups[3] ?? matchGroups[4] ?? matchGroups[5] ?? '').trim();
}

function isSafeUrl(value: string, attrName: string, tagName: string): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('#') || normalized.startsWith('/')) return true;
  if (attrName === 'href') {
    return (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('mailto:') ||
      normalized.startsWith('tel:')
    );
  }
  if (attrName === 'src') {
    if (tagName === 'img') return normalized.startsWith('http://') || normalized.startsWith('https://');
    return normalized.startsWith('http://') || normalized.startsWith('https://');
  }
  return true;
}

function looksLikeHtml(input: string): boolean {
  return /<\s*[a-zA-Z][^>]*>/.test(input);
}

function looksLikeMarkdown(input: string): boolean {
  const text = input.trim();
  if (!text || looksLikeHtml(text)) return false;
  const patterns = [
    /^#{1,6}\s+/m,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^\s*>\s+/m,
    /```/,
    /\[.+?\]\(.+?\)/,
    /!\[.*?\]\(.+?\)/,
    /(^|\s)\*\*[^*]+\*\*(\s|$)/,
    /(^|\s)_[^_]+_(\s|$)/,
    /(^|\s)`[^`]+`(\s|$)/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function renderInlineMarkdown(input: string): string {
  let html = escapeHtml(input);
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  return html;
}

function markdownToHtml(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };

  const flushCode = () => {
    if (!inCode) return;
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    inCode = false;
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCode) flushCode();
      else inCode = true;
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      out.push('<hr>');
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      out.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return out.join('\n');
}

function sanitizeRichHtml(input: string): string {
  if (!input) return '';

  // Remove high-risk blocks entirely.
  let html = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math)\b[^>]*\/?>/gi, '');

  // Rebuild tags using allow-lists.
  html = html.replace(/<[^>]*>/g, (rawTag) => {
    const tagMatch = rawTag.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/);
    if (!tagMatch) return '';

    const isClosing = tagMatch[1] === '/';
    const tagName = tagMatch[2].toLowerCase();
    const attrRaw = tagMatch[3] || '';

    if (!ALLOWED_TAGS.has(tagName)) return '';
    if (isClosing) return `</${tagName}>`;

    const allowedForTag = TAG_ALLOWED_ATTRS[tagName] || new Set<string>();
    const attrs: string[] = [];
    const attrRegex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attrRaw))) {
      const attrName = match[1].toLowerCase();
      if (attrName.startsWith('on')) continue;
      if (!GLOBAL_ALLOWED_ATTRS.has(attrName) && !allowedForTag.has(attrName)) continue;

      const value = normalizeAttrValue(match);
      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(value, attrName, tagName)) continue;

      if (value) attrs.push(`${attrName}="${escapeAttr(value)}"`);
      else attrs.push(attrName);
    }

    // Force safe rel for target=_blank links.
    if (tagName === 'a') {
      const hasTargetBlank = attrs.some((a) => a === 'target="_blank"');
      const hasRel = attrs.some((a) => a.startsWith('rel='));
      if (hasTargetBlank && !hasRel) attrs.push('rel="noopener noreferrer"');
    }

    return `<${tagName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
  });

  return html;
}

export default function RichText({ html }: { html: string }) {
  const normalizedHtml = looksLikeMarkdown(html) ? markdownToHtml(html) : html;
  const safeHtml = sanitizeRichHtml(normalizedHtml);
  return <section className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
