import test from 'node:test';
import assert from 'node:assert/strict';
import { externalizeScripts } from './external-scripts.ts';

test('SEC-03: externalize upper/mixed-case script tags and attributes with browser HTML parsing', () => {
  const result = externalizeScripts('<!doctype html><head><ScRiPt TYPE="module" data-label="a>b">const theme = "light";</sCrIpT></head>', () => 'fixture.js');
  assert.equal(result.assets.get('fixture.js'), 'const theme = "light";');
  assert.equal(result.html, '<!doctype html><head><script type="module" data-label="a>b" src="/_astro/fixture.js"></script></head>');
});

test('SEC-03: recognize a browser-accepted closing tag with unexpected attributes', () => {
  const result = externalizeScripts('<SCRIPT>window.ready = true;</SCRIPT ignored="yes"><p>Kept</p>', () => 'fixture.js');
  assert.equal(result.assets.get('fixture.js'), 'window.ready = true;');
  assert.equal(result.html, '<script src="/_astro/fixture.js"></script><p>Kept</p>');
});

test('SEC-03: preserve external scripts, data blocks and comment contents', () => {
  const html = '<!-- <SCRIPT>notCode()</SCRIPT> --><SCRIPT SRC="/existing.js"></SCRIPT><SCRIPT TYPE="application/ld+json">{"name":"Artemis"}</SCRIPT>';
  const result = externalizeScripts(html, () => { throw new Error('Nothing here should be externalized'); });
  assert.equal(result.html, html);
  assert.equal(result.assets.size, 0);
});

test('PREF-02: preserve script order, non-script HTML and exact source bytes', () => {
  let index = 0;
  const result = externalizeScripts('<main data-keep="yes">A</main><script>first();\n</script><script>second();</script><footer>B</footer>', () => `${++index}.js`);
  assert.deepEqual([...result.assets], [['1.js', 'first();\n'], ['2.js', 'second();']]);
  assert.equal(result.html, '<main data-keep="yes">A</main><script src="/_astro/1.js"></script><script src="/_astro/2.js"></script><footer>B</footer>');
});

test('SEC-03: include scripts inside template contents and legacy JavaScript MIME types', () => {
  const result = externalizeScripts('<template><SCRIPT TYPE="APPLICATION/JAVASCRIPT">ready();</SCRIPT></template>', () => 'fixture.js');
  assert.equal(result.assets.get('fixture.js'), 'ready();');
  assert.equal(result.html, '<template><script type="APPLICATION/JAVASCRIPT" src="/_astro/fixture.js"></script></template>');
});
