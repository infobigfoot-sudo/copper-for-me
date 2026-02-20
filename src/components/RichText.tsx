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
  const safeHtml = sanitizeRichHtml(html);
  return <section className="rich-text" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
