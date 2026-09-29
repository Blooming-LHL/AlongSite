import path from 'node:path';

function headingId(heading) {
  return encodeURI(heading.trim().toLowerCase().replace(/\s+/g, '-'));
}

async function transformInlineCode(line, transformPlain) {
  const expression = /(`+)([^\n]*?)\1/g;
  let cursor = 0;
  let output = '';
  for (const match of line.matchAll(expression)) {
    output += await transformPlain(line.slice(cursor, match.index));
    output += match[0];
    cursor = match.index + match[0].length;
  }
  return output + await transformPlain(line.slice(cursor));
}

export async function transformMarkdown(body, { document, resolveAttachment, resolveWiki, onAttachment }) {
  const lines = body.split(/(?<=\n)/);
  let fence = null;
  let output = '';
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      output += line;
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      output += line;
      continue;
    }

    output += await transformInlineCode(line, async plain => {
      let text = '';
      let cursor = 0;
      const token = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]+)\)|(?<!!)\[\[([^\]]+)\]\]/g;
      for (const match of plain.matchAll(token)) {
        text += plain.slice(cursor, match.index);
        if (match[1] !== undefined) {
          const [targetPart, altPart] = splitLast(match[1], '|');
          const target = splitFirst(targetPart, '#')[0].trim();
          const attachment = await resolveAttachment(target, document.file);
          const url = await onAttachment(attachment, document);
          text += `![${(altPart || path.basename(target)).trim()}](${url})`;
        } else if (match[2] !== undefined) {
          const parsed = parseMarkdownDestination(match[3]);
          if (/^(?:https?:|data:|\/\/|#)/i.test(parsed.url)) {
            text += match[0];
          } else {
            const attachment = await resolveAttachment(parsed.url, document.file);
            const url = await onAttachment(attachment, document);
            text += `![${match[2]}](${url}${parsed.title ? ` ${parsed.title}` : ''})`;
          }
        } else {
          const [targetAndHeading, label] = splitLast(match[4], '|');
          const [target, heading] = splitFirst(targetAndHeading, '#');
          const resolved = await resolveWiki(target.trim(), document);
          const suffix = heading ? `#${headingId(heading)}` : '';
          text += `[${(label || target).trim()}]({{< ref "/writing/${resolved.sourceRel}" >}}${suffix})`;
        }
        cursor = match.index + match[0].length;
      }
      return text + plain.slice(cursor);
    });
  }
  return output;
}

function parseMarkdownDestination(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(<[^>]+>|\S+?)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?$/);
  if (!match) return { url: trimmed, title: '' };
  return { url: match[1].replace(/^<|>$/g, ''), title: match[2]?.trim() ?? '' };
}

function splitFirst(value, separator) {
  const index = value.indexOf(separator);
  return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index + separator.length)];
}

function splitLast(value, separator) {
  const index = value.lastIndexOf(separator);
  return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index + separator.length)];
}

export { headingId, transformInlineCode };
