// Browser QA uses an installed Chrome/Edge and Node's built-in DevTools client.
// All submissions go to a temporary database; production data is never touched.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'test-results'); mkdirSync(artifacts, { recursive: true });
const temp = mkdtempSync(resolve(tmpdir(), 'wedding-browser-'));
const chrome = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
if (!chrome) throw new Error('Không tìm thấy Chrome/Edge. Đặt BROWSER_PATH đến tệp trình duyệt.');
const dbPath = resolve(temp, 'qa.sqlite');
const initialConfig = JSON.parse(readFileSync(resolve(root, 'config/wedding.json'), 'utf8'));
initialConfig.sides = {
  bride: { enabled: true },
  groom: { enabled: true, events: [{ ...initialConfig.events[0], startsAt: '2027-12-18T09:00:00+07:00', venue: 'ĐỊA ĐIỂM NHÀ TRAI QA' }], copy: { invitationText: 'LỜI MỜI NHÀ TRAI QA' } },
};
initialConfig.gifts = [
  { title: 'Mừng cưới cô dâu', qrImage: '/assets/qa-missing-qr.png' },
  { title: 'Mừng cưới chú rể', bank: '', accountName: '', accountNumber: '', qrImage: '' },
];
const initialConfigPath = resolve(temp, 'initial.json'); writeFileSync(initialConfigPath, JSON.stringify(initialConfig));
const adminPassword = 'browser-test-only';
const app = createApp({ dbPath, rateLimit: 100, adminPassword, configPath: initialConfigPath });
await app.ready;
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${app.address().port}`;
const chromeMajor = Number(execFileSync(chrome, ['--version'], { encoding: 'utf8' }).match(/\d+/)?.[0]);
const browser = spawn(chrome, [chromeMajor >= 112 ? '--headless=new' : '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${temp}/chrome`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserError;
let browserOutput = '';
browser.stderr.on('data', chunk => { browserOutput = (browserOutput + chunk.toString()).slice(-12000); });
browser.on('error', error => { browserError = error; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, extraApp;
try {
  const portFile = resolve(temp, 'chrome/DevToolsActivePort');
  for (let i = 0; !existsSync(portFile) && !/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.test(browserOutput) && i < 100; i++) { if (browserError) throw browserError; await delay(100); }
  const port = existsSync(portFile) ? readFileSync(portFile, 'utf8').split('\n')[0] : browserOutput.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];
  if (!port) throw new Error('Chrome chưa khởi động được. ' + browserOutput);
  let target;
  for (let i = 0; !target && i < 100; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = targets.find(t => t.type === 'page');
    if (!target) await delay(100);
  }
  if (!target) throw new Error('Chrome chưa tạo được trang kiểm thử.');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let seq = 0;
  const pending = new Map(), errors = [], failures = [], requests = [];
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  let failSubmission = false;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const p = pending.get(message.id); if (p) { pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); }
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    else if (message.method === 'Network.loadingFailed' && !message.params.canceled) failures.push(message.params.errorText);
    else if (message.method === 'Fetch.requestPaused') {
      if (failSubmission) command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"error":"QA failure"}').toString('base64') });
      else command('Fetch.continueRequest', { requestId: message.params.requestId });
    }
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error('Timeout: ' + expression); };
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const viewport = (width, height, mobile) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await viewport(390, 844, true);
  await command('Page.navigate', { url });
  await until(`document.querySelector('#invitation')?.getAttribute('aria-busy')==='false' && !!document.querySelector('.cover')`);
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate(`document.querySelector('.cover-caption h2').textContent`), initialConfig.copy.tagline);
  assert.equal(await evaluate(`!!document.querySelector('.cover-guest-name')`), false, 'generic invitation has no invented recipient');
  if (!initialConfig.copy.rsvpIntro) assert.equal(await evaluate(`document.querySelector('#rsvp > .section-intro')===null`), true, 'omitted RSVP introduction leaves no placeholder');
  // Load lazy images before full-page capture.
  await evaluate(`Promise.all([...document.images].map(img=>{img.loading='eager'; return img.decode().catch(()=>{});}))`);
  const screenshot = async name => {
    const { cssContentSize: size } = await command('Page.getLayoutMetrics');
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
    writeFileSync(resolve(artifacts, name), Buffer.from(result.data, 'base64'));
  };
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile overflow');
  assert.equal(await evaluate('[...document.images].filter(i=>i.hasAttribute("src")).every(i=>i.complete && i.naturalWidth>0)'), true, 'all photos loaded');
  assert.equal(await evaluate(`!!document.querySelector('.gift-section .gift-illustration')`), true, 'gift illustration visible');
  assert.equal(await evaluate(`document.querySelector('.bottom-nav').getBoundingClientRect().bottom <= innerHeight+1 && document.querySelector('.bottom-nav').getBoundingClientRect().bottom > innerHeight-2`), true, 'toolbar fixed to viewport');
  await screenshot('mobile-full.png');
  const giftClip = await evaluate(`(()=>{const r=document.querySelector('.gift-section').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()`);
  const giftShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: giftClip });
  writeFileSync(resolve(artifacts, 'gift-section.png'), Buffer.from(giftShot.data, 'base64'));
  const coverShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(artifacts, 'mobile-cover.png'), Buffer.from(coverShot.data, 'base64'));
  await evaluate(`document.querySelector('.gift-trigger').click()`);
  await until(`document.querySelector('#gift-dialog').open && document.querySelector('.gift-qr').hidden && !document.querySelector('.gift-qr').hasAttribute('src')`);
  assert.equal(await evaluate(`!document.querySelector('.qr-pending').hidden && !document.querySelector('.copy-account')`), true, 'missing QR shows pending without fake account');
  assert.equal(await evaluate(`document.querySelectorAll('#gift-dialog .gift-account').length`), 2);
  assert.equal(await evaluate(`document.querySelectorAll('#gift-dialog .gift-account')[1].querySelector('.gift-qr')===null`), true, 'unconfigured groom has no fake QR');
  assert.equal(await evaluate(`!document.querySelectorAll('#gift-dialog .gift-account')[1].querySelector('.qr-pending').hidden`), true);
  await evaluate(`document.querySelector('#gift-dialog').close(); document.querySelector('.gift-title').click()`);
  assert.equal(await evaluate(`document.querySelector('#gift-dialog').open`), true, 'gift title also opens dialog');
  await evaluate(`document.querySelector('#gift-dialog').close()`);
  await evaluate(`document.querySelector('[data-open="menu-dialog"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#menu-dialog').open`), true);
  await evaluate(`document.querySelector('#menu-dialog a[href="#events"]').click()`);
  assert.equal(await evaluate(`!document.querySelector('#menu-dialog').open && document.querySelector('#events').getBoundingClientRect().top < 60`), true);
  await evaluate(`document.querySelector('[data-gallery="album"]').click()`);
  const oldSrc = await evaluate(`document.querySelector('#lightbox img').src`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.notEqual(await evaluate(`document.querySelector('#lightbox img').src`), oldSrc);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`!document.querySelector('#lightbox').open`), true);
  await evaluate(`document.querySelector('.more-photos').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.extra-photo[hidden]').length`), 0);
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/rsvp' }] });
  failSubmission = true;
  await evaluate(`document.querySelector('#rsvp-name').value="Khách QA"; document.querySelector('[value="attending"]').checked=true; document.querySelector('[data-form="rsvp"]').requestSubmit()`);
  await until(`!document.querySelector('[data-form="rsvp"]').dataset.pending`);
  assert.equal(await evaluate(`document.querySelector('#rsvp-name').value`), 'Khách QA', 'failed submission keeps content');
  assert.equal(await evaluate(`document.querySelector('[data-form="rsvp"] .form-status').textContent.includes('Chưa gửi')`), true);
  failSubmission = false;
  await evaluate(`document.querySelector('[data-form="rsvp"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="rsvp"] .success')`);
  await command('Fetch.disable');
  await evaluate(`document.querySelector('[data-open="wish-dialog"]').click()`);
  await until(`document.querySelector('.wish-list-status').textContent.includes('Chưa có lời chúc')`);
  await evaluate(`document.querySelector('#wish-name').value="Khách QA";document.querySelector('#wish-message').value="Chúc hạnh phúc!"; document.querySelector('[data-form="wishes"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="wishes"] .success')`);
  await until(`document.querySelector('.wish-entry p')?.textContent==='Chúc hạnh phúc!'`);
  assert.equal(await evaluate(`document.querySelector('.wish-entry h4').textContent`), 'Khách QA');
  await evaluate(`document.querySelector('#wish-dialog').close()`);
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/wishes' }] });
  failSubmission = true;
  await evaluate(`document.querySelector('[data-open="wish-dialog"]').click()`);
  await until(`!document.querySelector('.wish-retry').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-form="wishes"] [type="submit"]').disabled`), false, 'list loading failure does not block writing');
  failSubmission = false;
  await evaluate(`document.querySelector('.wish-retry').click()`);
  await until(`document.querySelector('.wish-list-status').textContent==='' && document.querySelector('.wish-retry').hidden`);
  await command('Fetch.disable');
  await evaluate(`document.querySelector('#wish-dialog').close()`);
  await until(`document.querySelector('.music-toggle').getAttribute('aria-pressed')==='true'`);
  // Earlier interactions should have started music if initial autoplay was blocked.
  await evaluate(`document.querySelector('.music-toggle').click()`);
  assert.equal(await evaluate(`document.querySelector('.music-toggle').getAttribute('aria-pressed')`), 'false');
  await evaluate(`document.querySelector('[data-open="wish-dialog"]').click();document.querySelector('#wish-dialog').close()`);
  assert.equal(await evaluate(`document.querySelector('.music-toggle').getAttribute('aria-pressed')`), 'false', 'explicitly muted music stays off on later interactions');
  await evaluate(`document.querySelector('.music-toggle').click()`);
  await until(`document.querySelector('.music-toggle').getAttribute('aria-pressed')==='true'`);
  await evaluate(`document.querySelector('.music-toggle').click()`);
  assert.equal(await evaluate(`document.querySelector('.music-toggle').getAttribute('aria-pressed')`), 'false');
  await evaluate(`scrollTo(0,0)`);
  await viewport(1440, 1000, false);
  await screenshot('desktop-full.png');
  assert.ok(await evaluate(`Math.abs(document.querySelector('.invitation').getBoundingClientRect().width-428) < 1`), 'desktop width 428px');
  await viewport(320, 740, true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '320px overflow');

  // Admin creation and personalized RSVP use only the temporary QA database.
  await command('Page.navigate', { url: url + '/admin' });
  await until(`!document.querySelector('#login-panel')?.hidden`);
  await evaluate(`document.querySelector('#password').value=${JSON.stringify(adminPassword)};document.querySelector('#login-form').requestSubmit()`);
  await until(`!document.querySelector('#dashboard')?.hidden`);
  const guestName = 'Anh Nguyễn & gia đình <img src=x onerror=alert(1)>';
  for (const [name, side] of [[guestName, 'bride'], ['Chị Hà', 'groom'], ['Chị Hà', 'bride']]) {
    const previous = await evaluate(`document.querySelectorAll('.guest-card').length`);
    await evaluate(`document.querySelector('#invitation-side').value=${JSON.stringify(side)};document.querySelector('#invitation-side').dispatchEvent(new Event('change'));document.querySelector('#guest-name').value=${JSON.stringify(name)};document.querySelector('#create-form').requestSubmit()`);
    await until(`document.querySelectorAll('.guest-card').length===${previous + 1}`);
  }
  const personal = await evaluate(`fetch('/api/admin/invitations').then(r=>r.json()).then(d=>d.invitations.find(i=>i.name===${JSON.stringify(guestName)}))`);
  const groomPersonal = await evaluate(`fetch('/api/admin/invitations').then(r=>r.json()).then(d=>d.invitations.find(i=>i.side==='groom'))`);
  await evaluate(`document.querySelector('#filter-side').value='groom';document.querySelector('#filter-side').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelectorAll('.guest-card').length`), 1);
  assert.equal(await evaluate(`document.querySelector('.side-label').textContent`), 'Nhà trai');
  await evaluate(`document.querySelector('#filter-side').value='';document.querySelector('#filter-side').dispatchEvent(new Event('change'))`);
  await screenshot('admin.png');
  await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}});document.querySelector('#copy-created').click()`);
  await until(`document.querySelector('#create-form .status').textContent.includes('Ctrl+C')`);
  const personalUrl = url + '/?guest=' + personal.token;
  await command('Page.navigate', { url: personalUrl });
  await until(`!!document.querySelector('.guest-name')`);
  assert.equal(await evaluate(`document.querySelector('.guest-name').textContent`), guestName);
  assert.equal(await evaluate(`document.querySelector('.cover-guest-name').textContent`), guestName);
  assert.equal(await evaluate(`document.querySelector('.cover-guest-name').children.length`), 0, 'cover recipient is escaped');
  assert.equal(await evaluate(`!!document.querySelector('#rsvp-name')`), false);
  assert.equal(await evaluate(`document.querySelector('.guest-name').children.length`), 0, 'guest name escaped');
  await evaluate(`document.querySelector('[data-open="wish-dialog"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#wish-name')===null`), true, 'personal wishes do not ask for name');
  assert.equal(await evaluate(`document.querySelector('.wish-sender strong').textContent`), guestName);
  assert.equal(await evaluate(`document.querySelector('.wish-sender strong').children.length`), 0, 'sender is safely escaped');
  await evaluate(`document.querySelector('#wish-message').value='Lời chúc từ thiệp riêng';document.querySelector('[data-form="wishes"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="wishes"] .success')`);
  assert.equal(await evaluate(`document.querySelector('#wish-message').value`), '', 'successful wish clears the message');
  assert.equal(await evaluate(`document.querySelector('.wish-sender strong').textContent`), guestName);
  await until(`document.querySelector('.wish-entry p')?.textContent==='Lời chúc từ thiệp riêng'`);
  assert.equal(await evaluate(`document.querySelector('.wish-entry h4').textContent`), guestName);
  assert.equal(await evaluate(`document.querySelector('.wish-entry h4').children.length`), 0, 'public wish author is safely escaped');
  for (const width of [320, 390]) {
    await viewport(width, 844, true);
    assert.equal(await evaluate(`document.querySelector('#wish-dialog').scrollWidth<=document.querySelector('#wish-dialog').clientWidth`), true, 'wish list fits phone');
  }
  await evaluate(`document.querySelector('#wish-dialog').close()`);
  for (const width of [320, 390, 1440]) {
    await viewport(width, 900, width < 700);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'personal link overflow');
  }
  await viewport(390, 844, true);
  await evaluate(`document.querySelector('[value="attending"]').checked=true;document.querySelector('[data-form="rsvp"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="rsvp"] .success')`);
  await command('Page.navigate', { url: personalUrl });
  await until(`document.querySelector('[value="attending"]')?.checked===true`);
  await evaluate(`document.querySelector('[value="declined"]').checked=true;document.querySelector('[data-form="rsvp"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="rsvp"] .success')`);
  await evaluate(`document.querySelector('#events').scrollIntoView()`);
  await delay(400); await screenshot('personal-invitation.png');
  await command('Page.navigate', { url: url + '/?guest=' + groomPersonal.token + '&side=bride' });
  await until(`document.querySelector('#invitation')?.dataset.side==='groom' && document.querySelector('#invitation')?.getAttribute('aria-busy')==='false'`);
  assert.equal(await evaluate(`document.querySelector('.cover-guest-name').textContent`), 'Chị Hà');
  assert.equal(await evaluate(`document.querySelector('.invitation-heading>p:last-child').textContent`), 'LỜI MỜI NHÀ TRAI QA');
  assert.equal(await evaluate(`document.querySelector('.event-card h4').textContent`), 'ĐỊA ĐIỂM NHÀ TRAI QA');
  await evaluate(`document.querySelector('[value="attending"]').checked=true;document.querySelector('[data-form="rsvp"]').requestSubmit()`);
  await until(`!!document.querySelector('[data-form="rsvp"] .success')`);
  await command('Page.navigate', { url: url + '/?guest=invalid' });
  await until(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-form="rsvp"]')`), false);
  await command('Page.navigate', { url: url + '/admin' });
  await until(`document.querySelectorAll('.guest-card').length===3`);
  assert.equal(await evaluate(`document.querySelector('#summary').textContent.includes('1 không tham dự')`), true);
  assert.equal(await evaluate(`document.querySelector('#summary').textContent.includes('3 lượt mở link')`), true);
  assert.equal(await evaluate(`document.querySelector('#summary').textContent.includes('2 thiệp đã được mở')`), true);
  assert.equal(await evaluate(`document.querySelectorAll('.guest-views').length`), 3);
  assert.equal(await evaluate(`[...document.querySelectorAll('.guest-views')].filter(el=>el.textContent.includes('Mở gần nhất')).length`), 2);
  await evaluate(`document.querySelector('#filter-side').value='groom';document.querySelector('#filter-side').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#summary').textContent.includes('1 lượt mở link')`), true);
  await viewport(320, 740, true);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'view statistics fit narrow admin');
  await evaluate(`document.querySelector('#logout').click()`);
  await until(`!document.querySelector('#login-panel').hidden`);

  // Exercise configured gifts and content escaping against another temporary server.
  const config = JSON.parse(readFileSync(resolve(root, 'config/wedding.json'), 'utf8'));
  config.couple.groom = 'Nguyễn Minh Thành <3';
  config.gifts = [
    { title: 'Mừng cưới cô dâu', bank: 'Ngân hàng mẫu', accountName: 'CO DAU QA', accountNumber: '0123456789', qrImage: config.photos.cover },
    { title: 'Mừng cưới chú rể', bank: 'Ngân hàng thử', accountName: 'CHU RE QA', accountNumber: '9876543210', qrImage: config.photos.groom },
  ];
  const configPath = resolve(temp, 'gifts.json'); writeFileSync(configPath, JSON.stringify(config));
  config.sides = { bride: { enabled: true }, groom: { enabled: false, events: [], copy: {} } };
  writeFileSync(configPath, JSON.stringify(config));
  extraApp = createApp({ configPath, dbPath: resolve(temp, 'gifts.sqlite'), adminPassword });
  await new Promise(resolve => extraApp.listen(0, '127.0.0.1', resolve));
  const extraUrl = `http://127.0.0.1:${extraApp.address().port}`;
  await command('Browser.grantPermissions', { origin: extraUrl, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await command('Page.navigate', { url: extraUrl });
  await until(`!!document.querySelector('.gift-section')`);
  await command('Page.bringToFront');
  assert.equal(await evaluate(`document.querySelector('.label-names span').textContent`), config.couple.groom);
  await evaluate(`document.querySelector('[data-open="gift-dialog"]').click()`);
  await until(`!document.querySelector('.gift-qr').hidden && document.querySelector('.gift-qr').naturalWidth>0`);
  await until(`[...document.querySelectorAll('.gift-qr')].every(img=>!img.hidden&&img.naturalWidth>0)`);
  for (const width of [320, 390, 1440]) {
    await viewport(width, 1000, width < 700);
    const boxes = await evaluate(`[...document.querySelectorAll('#gift-dialog .gift-account')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right}})`);
    assert.equal(boxes.length, 2);
    assert.ok(boxes[0].x < boxes[1].x && Math.abs(boxes[0].y-boxes[1].y)<1, 'bride left and groom right on the same row');
    assert.equal(await evaluate(`document.querySelector('#gift-dialog').scrollWidth<=document.querySelector('#gift-dialog').clientWidth`), true, 'gift dialog has no horizontal overflow');
    assert.ok(boxes[0].x >= 0 && boxes[1].right <= width);
  }
  await viewport(390, 1000, true);
  const splitShot = await command('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  writeFileSync(resolve(artifacts,'gift-two-columns.png'),Buffer.from(splitShot.data,'base64'));
  assert.equal(await evaluate(`document.querySelector('.qr-pending').hidden`), true, 'configured QR replaces placeholder');
  assert.equal(await evaluate(`document.querySelector('#gift-dialog').open && document.querySelector('.account-number').textContent === '0123456789'`), true);
  await evaluate(`document.querySelector('.copy-account').click()`);
  await until(`!!document.querySelector('.copy-status').textContent`);
  assert.equal(await evaluate(`document.querySelector('.copy-status').textContent`), config.ui.copied);
  await evaluate(`document.querySelectorAll('.copy-account')[1].click()`);
  await until(`navigator.clipboard.readText().then(text=>text==='9876543210')`);
  await command('Page.navigate', { url: extraUrl + '/admin' });
  await until(`!document.querySelector('#login-panel')?.hidden`);
  await evaluate(`document.querySelector('#password').value=${JSON.stringify(adminPassword)};document.querySelector('#login-form').requestSubmit()`);
  await until(`!document.querySelector('#dashboard')?.hidden`);
  await evaluate(`document.querySelector('#invitation-side').value='groom';document.querySelector('#invitation-side').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelector('#create-form button[type="submit"]').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('#side-status').textContent.includes('chưa có đủ thông tin')`), true);
  await command('Page.navigate', { url: extraUrl + '/?side=groom' });
  await until(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate(`document.querySelector('[role="alert"]').textContent.includes('đang chờ cập nhật')`), true);
  // Exercise the animated path too: the earlier form/layout checks use reduced motion.
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await command('Page.navigate', { url });
  await until(`document.querySelector('#invitation')?.classList.contains('motion-enabled')`);
  await until(`document.querySelector('.envelope-scene')?.classList.contains('motion-active')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.cover-photo')).animationName`), 'photo-emerge');
  await delay(2100);
  await screenshot('animated-cover.png');
  for (const width of [320, 390, 1440]) {
    await viewport(width, 900, width < 700);
    await evaluate(`document.querySelector('.portraits').scrollIntoView({behavior:'instant',block:'center'})`);
    await until(`[...document.querySelectorAll('.portraits figure')].every(el=>el.classList.contains('visible'))`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, 'motion does not overflow');
  }
  await viewport(390, 900, true);
  await evaluate(`document.querySelector('#album').scrollIntoView({behavior:'instant',block:'start'})`);
  await until(`document.querySelector('.album-photo').classList.contains('visible')`);
  try {
    await until(`!document.querySelector('.envelope-scene').classList.contains('motion-active')`);
  } catch (error) {
    console.log('Motion viewport diagnostic:', await evaluate(`JSON.stringify({scrollY,innerHeight,visualHeight:visualViewport.height,sceneBottom:document.querySelector('.envelope-scene').getBoundingClientRect().bottom,albumTop:document.querySelector('#album').getBoundingClientRect().top,hidden:document.hidden})`));
    throw error;
  }
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lilies')).animationPlayState`), 'paused', 'offscreen decoration pauses');
  await evaluate(`document.querySelector('.more-photos').click();document.querySelector('.extra-photo').scrollIntoView({behavior:'instant',block:'center'})`);
  await until(`document.querySelector('.extra-photo').classList.contains('visible')`);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(`!document.querySelector('#invitation').classList.contains('motion-enabled')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.cover-photo')).animationName`), 'none');
  assert.equal(await evaluate(`[...document.querySelectorAll('.reveal')].every(el=>getComputedStyle(el).opacity==='1')`), true, 'reduced motion leaves all content visible');
  assert.equal(requests.some(url => new URL(url).pathname === '/api/config'), false, 'viewing invitations uses static content, no config function');
  assert.ok(requests.some(url => new URL(url).pathname === '/invitation-config.json'));
  assert.ok(requests.some(url => new URL(url).pathname.endsWith('.woff2')), 'compressed fonts are loaded');
  assert.equal(requests.some(url => new URL(url).pathname.endsWith('.ttf')), false, 'no original TTF downloads');
  assert.deepEqual(errors, [], 'no uncaught browser exceptions');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM rsvps').get().n, 3);
  assert.equal(db.prepare('SELECT attendance FROM rsvps WHERE invitation_id IS NOT NULL').get().attendance, 'declined');
  assert.equal(db.prepare("SELECT r.attendance FROM rsvps r JOIN invitations i ON r.invitation_id=i.id WHERE i.side='groom'").get().attendance, 'attending');
  assert.equal(db.prepare('SELECT count(*) AS n FROM wishes').get().n, 2);
  assert.equal(db.prepare('SELECT name FROM wishes WHERE message=?').get('Lời chúc từ thiệp riêng').name, guestName); db.close();
  console.log('Browser QA passed: 390px, 320px, 1440px; local assets, forms, gifts, admin login/create/copy fallback/logout, duplicate names, personalized RSVP updates/reload, invalid links and escaping.');
  console.log(`Screenshots: ${artifacts}\nTemporary QA data: ${temp}`);
  if (failures.length) console.log('Network events:', failures);
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  browser.kill();
  await new Promise(resolve => app.close(resolve));
  if (extraApp) await new Promise(resolve => extraApp.close(resolve));
}
