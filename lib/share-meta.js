const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderShareMeta(html, config, baseUrl, image = {}) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Địa chỉ chia sẻ cần là URL gốc của website.');
  }
  const title = `Thiệp cưới ${config.couple.groom} & ${config.couple.bride}`;
  const description = 'Trân trọng kính mời bạn đến dự buổi tiệc chung vui cùng gia đình chúng tôi.';
  const imageUrl = new URL(image.path || config.photos.cover, base).href;
  const tag = (key, value, attribute = 'property') => `  <meta ${attribute}="${key}" content="${escape(value)}">`;
  const tags = [
    tag('og:type', 'website'), tag('og:locale', 'vi_VN'), tag('og:title', title),
    tag('og:description', description), tag('og:image', imageUrl),
    tag('og:image:alt', `Ảnh cưới ${config.couple.groom} và ${config.couple.bride}`),
    ...(image.type ? [tag('og:image:type', image.type)] : []),
    ...(image.width && image.height ? [tag('og:image:width', image.width), tag('og:image:height', image.height)] : []),
    tag('twitter:card', 'summary_large_image', 'name'), tag('twitter:title', title, 'name'),
    tag('twitter:description', description, 'name'), tag('twitter:image', imageUrl, 'name'),
  ].join('\n');
  // Do not set a canonical/og:url shared by all recipients: preserve ?guest= links.
  return html.replace(/<!-- sharing:start -->[\s\S]*?<!-- sharing:end -->/, () => `<!-- sharing:start -->\n${tags}\n  <!-- sharing:end -->`)
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => tag('description', description, 'name').trim());
}
