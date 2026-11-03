import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderShareMeta } from '../lib/share-meta.js';

test('sharing metadata is available without JavaScript, escapes names, and preserves personal links', () => {
  const template = readFileSync('public/index.html', 'utf8');
  const config = { couple: { groom: 'Cương "<3> $&', bride: 'Tú' }, photos: { cover: '/assets/photos/1.webp' } };
  const image = { path: '/assets/share-cover.jpg?v=abc', width: 1200, height: 630, type: 'image/jpeg' };
  const html = renderShareMeta(template, config, 'https://thiep.example', image);
  assert.ok(html.includes('property="og:title" content="Thiệp cưới Cương &quot;&lt;3&gt; $&amp; &amp; Tú"'));
  assert.ok(html.includes('property="og:image" content="https://thiep.example/assets/share-cover.jpg?v=abc"'));
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
  assert.equal(html.includes('property="og:url"'), false, 'do not canonicalize guest links to the homepage');
  assert.equal(html.includes('rel="canonical"'), false);
  assert.equal(renderShareMeta(html, config, 'https://thiep.example', image), html, 'rebuilding does not duplicate tags');
  assert.throws(() => renderShareMeta(template, config, 'javascript:alert(1)'), /URL/);
});
