import { visit, SKIP } from 'unist-util-visit';

/** Local remark plugins for Obsidian syntax. Pure mdast transforms, no I/O. */
const WL = /(!?)\[\[([^\]|#^]+)?(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
export const IMG = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
export const wikiKey = (t) => String(t || '').trim().replace(/\.md$/i, '').toLowerCase();

export function remarkWikilinks() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return;
      if (parent.type === 'link' || parent.type === 'inlineCode') return;
      const out = [];
      let last = 0;
      for (const m of node.value.matchAll(WL)) {
        if (m.index > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
        const [, bang, target = '', heading = '', alias] = m;
        const label = alias || (target ? target.split('/').pop() : heading.slice(1)) + (target && heading ? heading.replace('#', ' › ') : '');
        if (bang) {
          out.push({ type: 'wikiEmbed', data: { hName: IMG.test(target) ? 'img' : 'div', hProperties: IMG.test(target) ? { dataEmbed: target.trim(), alt: alias || target.trim() } : { dataEmbed: target.trim(), className: ['md-embed'] } }, children: [] });
        } else {
          out.push({ type: 'wikiLink', data: { hName: 'a', hProperties: { dataWl: target.trim() || '#', href: '#', title: label } }, children: [{ type: 'text', value: label }] });
        }
        last = m.index + m[0].length;
      }
      if (!out.length) return;
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
    // A paragraph holding only a note embed becomes the embed block itself.
    visit(tree, 'paragraph', (node, index, parent) => {
      const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (parent && kids.length === 1 && kids[0].type === 'wikiEmbed' && kids[0].data.hName === 'div') parent.children[index] = kids[0];
    });
  };
}

const CALLOUT = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/;
export function remarkCallouts() {
  return (tree) => {
    visit(tree, 'blockquote', (node) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph' || first.children[0]?.type !== 'text') return;
      const text = first.children[0].value;
      const nl = text.indexOf('\n');
      const line = nl === -1 ? text : text.slice(0, nl);
      const m = CALLOUT.exec(line);
      if (!m) return;
      const type = m[1].toLowerCase();
      const fold = m[2];
      first.children[0] = { ...first.children[0], value: nl === -1 ? '' : text.slice(nl + 1) };
      // Title is the rest of the first line, or the type name.
      const titleKids = m[3] ? [{ type: 'text', value: m[3] }] : [{ type: 'text', value: type[0].toUpperCase() + type.slice(1) }];
      if (nl === -1) {
        // Inline nodes after the [!type] text on the first line also belong to the title.
        const brk = first.children.findIndex((c, i) => i > 0 && c.type === 'break');
        const rest = first.children.slice(1, brk === -1 ? undefined : brk);
        if (m[3] || rest.length) titleKids.splice(0, titleKids.length, ...(m[3] ? [{ type: 'text', value: m[3] }] : []), ...rest);
        first.children = brk === -1 ? [] : first.children.slice(brk + 1);
      }
      if (!first.children.some((c) => c.type !== 'text' || c.value.trim())) node.children.shift();
      node.children.unshift({ type: 'calloutTitle', data: { hName: fold ? 'summary' : 'div', hProperties: { className: ['md-callout-title'] } }, children: titleKids });
      node.data = { hName: fold ? 'details' : 'aside', hProperties: { className: ['md-callout'], dataCallout: type, ...(fold === '+' ? { open: true } : {}) } };
    });
  };
}

/** Minimal YAML frontmatter split: scalar, inline list and dash list values only. Never shown as raw YAML. */
export function splitFrontmatter(body = '') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (!m) return { meta: [], content: body };
  const meta = [];
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w .-]+):\s*(.*)$/.exec(line);
    if (kv) {
      let v = kv[2].trim().replace(/^["']|["']$/g, '');
      const list = /^\[(.*)\]$/.exec(v);
      cur = { key: kv[1].trim(), values: list ? list[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : v ? [v] : [] };
      meta.push(cur);
    } else if (cur && /^\s*-\s+/.test(line)) cur.values.push(line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
  }
  return { meta, content: body.slice(m[0].length) };
}

/** Targets referenced by [[links]] and ![[embeds]], for server-side resolution. */
export function referencedTargets(body = '') {
  const links = new Set(), embeds = new Set();
  for (const m of body.matchAll(WL)) if (m[2]) (m[1] ? embeds : links).add(m[2].trim());
  return { links: [...links], embeds: [...embeds] };
}
