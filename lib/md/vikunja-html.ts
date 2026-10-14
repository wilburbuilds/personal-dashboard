/**
 * Vikunja stores descriptions and comments as editor HTML (sometimes as plain markdown). Turn the
 * common tags into markdown so MarkdownNote (which sanitizes) can render them; anything else is
 * reduced to its text.
 */
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
export function vikunjaToMarkdown(src: string): string {
  if (!src || !/<\/?[a-z][^>]*>/i.test(src)) return src || '';
  let s = src.replace(/\r/g, '');
  s = s.replace(/<li[^>]*data-checked="true"[^>]*>/gi, '<li>[x] ').replace(/<li[^>]*data-checked="false"[^>]*>/gi, '<li>[ ] ');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${t}\n\n`);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*').replace(/<(s|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  s = s.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`).replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<\/?p[^>]*>/gi, '').trim()}`).replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => '\n\n' + t.replace(/<[^>]+>/g, '').split('\n').map((l: string) => `> ${l}`).join('\n') + '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '  \n').replace(/<\/p>\s*/gi, '\n\n').replace(/<p[^>]*>/gi, '').replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  s = s.replace(/<[^>]+>/g, '').replace(/&(#39|amp|lt|gt|quot|nbsp);/g, (_, e) => ENT[e]);
  return s.replace(/\n{3,}/g, '\n\n').trim();
}
