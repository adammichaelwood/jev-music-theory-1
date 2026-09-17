// tiny markdown → HTML for the in-app findings page (headings, bullets, bold, code, tables, strikethrough)
export function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
  const out: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const h = /^(#{1,3}) (.*)/.exec(l)
    if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue }
    if (l.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i]); i++ }
      i--
      out.push('<table>' + rows.map((r, k) => `<tr>${r.split('|').slice(1, -1).map(c => `<${k ? 'td' : 'th'}>${inline(c.trim())}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('') + '</table>')
      continue
    }
    if (/^(-|\d+\.) /.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^(-|\d+\.) /.test(lines[i])) {
        let item = lines[i].replace(/^(-|\d+\.) /, '')
        while (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1])) { i++; item += ' ' + lines[i].trim() }
        items.push(item); i++
      }
      i--
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`)
      continue
    }
    if (l.trim() === '') continue
    let p = l
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||-|\d+\. )/.test(lines[i + 1])) { i++; p += ' ' + lines[i] }
    out.push(`<p>${inline(p)}</p>`)
  }
  return <div className="md" dangerouslySetInnerHTML={{ __html: out.join('\n') }} />
}
