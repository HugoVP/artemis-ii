import { parse, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

// HTML's JavaScript MIME types, plus module scripts. Other types are data blocks.
const javascriptTypes = new Set([
  '', 'module', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0',
  'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4',
  'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript',
]);

/** Parse browser HTML syntax; source offsets preserve everything outside rewritten script elements. */
export function externalizeScripts(html: string, assetName: (code: string) => string) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const assets = new Map<string, string>();
  const replacements: { start: number; end: number; html: string }[] = [];
  function visit(node: Node): void {
    if ('tagName' in node && node.tagName === 'script' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const type = node.attrs.find(attr => attr.name === 'type')?.value.trim().toLowerCase() ?? '';
      const location = node.sourceCodeLocation;
      if (!node.attrs.some(attr => attr.name === 'src') && javascriptTypes.has(type) && location?.startTag) {
        const code = html.slice(location.startTag.endOffset, location.endTag?.startOffset ?? location.endOffset);
        if (code.trim()) {
          const name = assetName(code);
          assets.set(name, code);
          const external: Element = { ...node, attrs: [...node.attrs, { name: 'src', value: `/_astro/${name}` }], childNodes: [] };
          replacements.push({ start: location.startOffset, end: location.endOffset, html: serializeOuter(external) });
        }
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
    if ('content' in node) visit(node.content);
  }
  visit(document);
  let output = html;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.html + output.slice(replacement.end);
  }
  return { html: output, assets };
}
