import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Check, Info, Lightbulb, TriangleAlert, OctagonAlert, CircleHelp, Quote, FileText, ImageOff, type LucideIcon } from 'lucide-react';
import { remarkWikilinks, remarkCallouts, splitFrontmatter } from '@/lib/md/plugins.mjs';

/** Vault markdown, rendered per markdown.md. Read-only: links open notes, checkboxes never write. */
export type Refs = {
  links: Record<string, { vault: string; path: string } | null>;
  embeds: Record<string, { kind: 'note'; vault: string; path: string; title: string; body: string } | { kind: 'image'; src: string; name: string } | null>;
};
export const noRefs: Refs = { links: {}, embeds: {} };
export const noteHref = (vault: string, path: string) => `/t/query?open=${encodeURIComponent(`${vault}:${path}`)}`;
const missingHref = (t: string) => `/t/query?open=${encodeURIComponent(`missing:${t}`)}`;

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'aside', 'details', 'summary', 'mark'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'data*'],
    a: [...(defaultSchema.attributes?.a ?? []), 'title'],
    img: [...(defaultSchema.attributes?.img ?? []), 'alt', 'title'],
    details: ['open'],
    input: [['type', 'checkbox'], 'checked', 'disabled'],
  },
};

const calloutIcon: Record<string, [LucideIcon, string]> = {
  note: [Info, 'note'], info: [Info, 'note'], abstract: [FileText, 'note'], summary: [FileText, 'note'],
  tip: [Lightbulb, 'tip'], success: [Check, 'tip'], check: [Check, 'tip'], done: [Check, 'tip'], important: [Lightbulb, 'tip'],
  warning: [TriangleAlert, 'warning'], caution: [TriangleAlert, 'warning'], attention: [TriangleAlert, 'warning'],
  danger: [OctagonAlert, 'danger'], error: [OctagonAlert, 'danger'], failure: [OctagonAlert, 'danger'], bug: [OctagonAlert, 'danger'],
  question: [CircleHelp, 'question'], help: [CircleHelp, 'question'], faq: [CircleHelp, 'question'], quote: [Quote, ''], cite: [Quote, ''],
};

const KW = /\b(const|let|var|function|return|if|else|for|while|import|from|export|def|class|true|false|null|None|TABLE|LIST|TASK|FROM|WHERE|SORT|LIMIT|GROUP BY|and|or|not|in)\b/;
function highlight(code: string): ReactNode[] {
  const re = /(\/\/[^\n]*|#[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b(?:const|let|var|function|return|if|else|for|while|import|from|export|def|class|true|false|null|None|TABLE|LIST|TASK|FROM|WHERE|SORT|LIMIT|and|or|not|in)\b)/g;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    if (m.index! > last) out.push(code.slice(last, m.index));
    const t = m[0];
    out.push(<span key={m.index} className={m[2] ? 'k' : t.startsWith('"') || t.startsWith("'") ? 's' : 'c'}>{t}</span>);
    last = m.index! + t.length;
  }
  out.push(code.slice(last));
  return KW.test(code) || out.length > 1 ? out : [code];
}
const textOf = (n: ReactNode): string => typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : '';

export type MdSettings = { checkboxes: string; dataview: string };
type Props = { body: string; refs?: Refs; compact?: boolean; depth?: number; terms?: string[]; className?: string; settings?: MdSettings };

export function MarkdownNote({ body, refs = noRefs, compact = false, depth = 0, terms = [], className = '', settings = { checkboxes: 'readonly', dataview: 'code' } }: Props) {
  const { meta, content } = splitFrontmatter(body);
  const mark = (s: string): ReactNode => {
    if (!terms.length) return s;
    const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return s.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
  };
  const markKids = (c: ReactNode): ReactNode => Children.map(c, (x) => (typeof x === 'string' ? mark(x) : x));

  const components: Components = {
    a({ node, children, href, ...rest }) {
      void node;
      const wl = (rest as Record<string, string>)['data-wl'];
      if (wl !== undefined) {
        const hit = refs.links[wl];
        return hit
          ? <a className="wl" href={noteHref(hit.vault, hit.path)} title={rest.title}>{children}</a>
          : <a className="wl un" href={missingHref(wl)} title="Note not found">{children}</a>;
      }
      const ext = !!href && /^https?:/i.test(href);
      return <a href={href} className={ext ? 'ext' : undefined} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>;
    },
    div({ node, children, className: cn, ...rest }) {
      void node;
      const target = (rest as Record<string, string>)['data-embed'];
      if (target === undefined) return <div className={cn}>{children}</div>;
      const e = refs.embeds[target];
      if (compact) return e?.kind === 'note' ? <a className="wl" href={noteHref(e.vault, e.path)}>{target}</a> : <span className="faint">{target}</span>;
      if (!e || e.kind !== 'note') return <div className="emb miss"><ImageOff aria-hidden /> Missing attachment: {target}</div>;
      return (
        <div className="emb">
          <div className="eh"><FileText aria-hidden /> Embedded from <a className="wl" href={noteHref(e.vault, e.path)}>{e.title}</a><a href={noteHref(e.vault, e.path)}>Open</a></div>
          {depth < 1 ? <MarkdownNote body={e.body} refs={refs} depth={depth + 1} className="emb-body" settings={settings} /> : null}
        </div>
      );
    },
    img({ node, src, alt, ...rest }) {
      void node;
      const target = (rest as Record<string, string>)['data-embed'];
      const e = target !== undefined ? refs.embeds[target] : null;
      if (compact) return null;
      if (target !== undefined && (!e || e.kind !== 'image')) return <span className="emb miss" role="img" aria-label={`Missing attachment: ${target}`}><ImageOff aria-hidden /> Missing attachment: {target}</span>;
      const s = e && e.kind === 'image' ? e.src : typeof src === 'string' ? src : '';
      const name = e && e.kind === 'image' ? e.name : alt || s.split('/').pop();
      // eslint-disable-next-line @next/next/no-img-element
      return <figure><img src={s} alt={alt || name || ''} loading="lazy" /><figcaption>{name}</figcaption></figure>;
    },
    aside({ node, children, ...rest }) {
      void node;
      const type = (rest as Record<string, string>)['data-callout'];
      if (!type) return <aside>{children}</aside>;
      const [Icon, tone] = calloutIcon[type] ?? [Info, ''];
      return <aside className={`co ${tone}`}>{withIcon(children, Icon)}</aside>;
    },
    details({ node, children, ...rest }) {
      void node;
      const type = (rest as Record<string, string>)['data-callout'];
      const [Icon, tone] = calloutIcon[type ?? ''] ?? [Info, ''];
      return <details className={type ? `co ${tone}` : undefined} open={(rest as { open?: boolean }).open}>{type ? withIcon(children, Icon) : children}</details>;
    },
    pre({ node, children }) {
      void node;
      const code = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
      const lang = /language-([\w-]+)/.exec(code?.props.className ?? '')?.[1] ?? '';
      if (/^dataview(js)?$/.test(lang) && settings.dataview === 'hide') return null;
      const text = textOf(code?.props.children).replace(/\n$/, '');
      return <pre>{lang ? <span className="lang">{lang}</span> : null}<code>{highlight(text)}</code></pre>;
    },
    table({ node, children }) { void node; return <div className="tw"><table>{children}</table></div>; },
    td({ node, children, style }) {
      void node;
      const t = textOf(children).trim();
      const numeric = /^[-+$€£]?[\d.,]+\s*(%|lb|kg|mi|km|min|sec|s|ms|bpm)?$/.test(t) || /^\d+\s*[×x]\s*[\d–-]+/.test(t);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(t);
      return <td className={numeric || style?.textAlign === 'right' ? 'r' : date ? 'nw' : undefined}>{markKids(children)}</td>;
    },
    th({ node, children, style }) { void node; return <th className={style?.textAlign === 'right' ? 'r' : undefined}>{children}</th>; },
    ul({ node, children, className: cn }) { void node; return <ul className={cn?.includes('contains-task-list') ? 'task' : undefined}>{children}</ul>; },
    li({ node, children, className: cn }) {
      if (!cn?.includes('task-list-item')) return <li>{markKids(children)}</li>;
      const checked = !!node?.children.some((c) => c.type === 'element' && c.tagName === 'input' && c.properties?.checked);
      const kids = Children.toArray(children);
      const box = kids.find((k) => isValidElement(k) && (k.props as { 'data-cb'?: string })['data-cb'] !== undefined);
      return <li className={checked ? 'done' : undefined}>{box}<span className="t">{markKids(kids.filter((k) => k !== box))}</span></li>;
    },
    input({ node, checked, type }) {
      void node;
      if (type !== 'checkbox') return null;
      if (settings.checkboxes === 'plain') return null;
      // Read-only by design (homeConfig.markdown.checkboxes = 'readonly').
      return <span data-cb="" className={`cb${checked ? ' on' : ''}`} role="checkbox" aria-checked={!!checked} aria-readonly="true" aria-label={checked ? 'Done' : 'Not done'}>{checked ? <Check aria-hidden /> : null}</span>;
    },
    p({ node, children }) { void node; return <p>{markKids(children)}</p>; },
    h1({ node, children }) { void node; return <h1>{markKids(children)}</h1>; },
    h2({ node, children }) { void node; return <h2>{markKids(children)}</h2>; },
    h3({ node, children }) { void node; return <h3>{markKids(children)}</h3>; },
  };

  return (
    <div className={`md${compact ? ' compact' : ''} ${className}`.trim()}>
      {meta.length && !compact ? (
        <dl className="fm">
          {meta.map((m) => (
            <div key={m.key} style={{ display: 'contents' }}>
              <dt>{m.key}</dt>
              <dd>{/^tags?$/i.test(m.key) ? m.values.map((v, i) => <span key={v}>{i ? ' ' : ''}<a className="tag" href={`/t/query?q=${encodeURIComponent(v.replace(/^#/, ''))}`}>#{v.replace(/^#/, '')}</a></span>) : m.values.join(', ')}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Markdown remarkPlugins={[remarkFrontmatter, remarkGfm, remarkWikilinks, remarkCallouts]} rehypePlugins={[[rehypeSanitize, schema]]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}

function withIcon(children: ReactNode, Icon: LucideIcon) {
  let done = false;
  return Children.map(children, (c) => {
    if (done || !isValidElement(c)) return c;
    const p = c.props as { className?: string; children?: ReactNode };
    if (!String(p.className ?? '').includes('md-callout-title')) return c;
    done = true;
    return cloneElement(c as ReactElement<{ className?: string; children?: ReactNode }>, { className: 'ct' }, <><Icon aria-hidden />{p.children}</>);
  });
}
