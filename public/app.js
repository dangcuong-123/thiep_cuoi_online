import { displayDate, eventTime, countdown, calendar } from './core.js';
import { setupMotion } from './motion.js';
import { setupWishWall } from './wishes.js';

const root = document.querySelector('#invitation');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  music: '<path d="M9 18V5l11-2v13M9 7l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  gift: '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

async function main() {
  const params = new URLSearchParams(location.search);
  // Public content comes from the CDN while a personal link resolves its recipient.
  // Catch immediately so a failed fetch cannot become an unhandled rejection.
  const catalogRequest = fetch('/invitation-config.json').then(async response => {
    if (!response.ok) throw new Error('config');
    return { catalog: await response.json() };
  }).catch(error => ({ error }));
  const guestToken = params.has('guest') ? params.get('guest') : null;
  let guest = null;
  if (guestToken !== null) {
    const result = await fetch(`/api/invitation?token=${encodeURIComponent(guestToken)}`, { cache: 'no-store' });
    if (!result.ok) throw Object.assign(new Error('invitation'), { userMessage: result.status === 404
      ? 'Link thiệp không hợp lệ. Vui lòng liên hệ người gửi để nhận lại link.'
      : 'Chưa tải được thông tin khách mời. Vui lòng tải lại trang.' });
    guest = await result.json();
  }
  // A personal link always uses the side saved with its token, not URL overrides.
  const side = guest?.side ?? params.get('side') ?? 'bride';
  const result = await catalogRequest;
  if (result.error) throw result.error;
  const variant = result.catalog.find(item => item.side === side);
  if (!variant) throw Object.assign(new Error('side'), { userMessage: 'Loại thiệp không hợp lệ. Chọn nhà trai hoặc nhà gái.' });
  if (!variant.enabled) throw Object.assign(new Error('side'), { userMessage: `Thiệp ${variant.label.toLocaleLowerCase('vi')} đang chờ cập nhật ngày giờ, địa điểm và lời mời. Vui lòng liên hệ người gửi.` });
  const c = variant.config, { copy, ui, photos: p, decorations: d } = c;
  root.dataset.side = side;
  const text = value => escape(value);
  const names = `${c.couple.groom} & ${c.couple.bride}`;
  const alt = ui.imageAlt.replace('{groom}', c.couple.groom).replace('{bride}', c.couple.bride);
  document.title = `${names} — ${ui.home}`;
  document.querySelector('meta[name="description"]').content = `${names} · ${displayDate(c.events[0].startsAt)} · ${copy.invitationText}`;
  document.querySelector('meta[name="theme-color"]').content = c.theme.accent;
  if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.getAttribute('href') === c.theme.fontsStylesheet)) {
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet'; fonts.href = c.theme.fontsStylesheet; document.head.append(fonts);
  }
  for (const key of ['serif', 'script', 'ornamental', 'sans', 'date']) root.style.setProperty(`--font-${key}`, `"${c.theme[key]}"`);
  root.style.setProperty('--wine', c.theme.accent);
  const photo = (src, className = '', eager = false) => `<img class="${className}" src="${text(src)}" alt="${text(alt)}" loading="${eager ? 'eager' : 'lazy'}" ${eager ? 'fetchpriority="high"' : ''} decoding="async">`;
  const decoration = (src, className) => `<img class="decoration ${className}" src="${text(src)}" alt="" aria-hidden="true" decoding="async">`;
  const nameStack = `<span>${text(c.couple.groom)}</span><span class="ampersand">&amp;</span><span>${text(c.couple.bride)}</span>`;
  const day = c.events[0].startsAt;
  const cal = calendar(day);
  const closeButton = `<button class="icon-button dialog-close" data-close aria-label="${text(ui.close)}">${icon('close')}</button>`;
  const formName = id => `<label for="${id}-name">${text(ui.name)}</label><input id="${id}-name" name="name" autocomplete="name" maxlength="100" placeholder="${text(ui.namePlaceholder)}" required>`;
  const familyParents = family => {
    const parents = [family.father, family.mother].filter(value => typeof value === 'string' && value.trim());
    return parents.length ? `<p>${parents.map(text).join('<br>')}</p>` : '';
  };
  const menu = [['home', ui.home], ['couple', ui.couple], ['events', ui.events], ['story', ui.story], ['album', ui.album], ['rsvp', ui.rsvp]];
  root.innerHTML = `
    <section id="home" class="cover">
      <div class="envelope-scene" aria-label="${text(names)}">
        ${decoration(d.envelopeBack, 'envelope-back')}
        ${photo(p.cover, 'cover-photo', true)}
        ${decoration(d.envelopeFront, 'envelope-front')}
        ${decoration(d.lilies, 'lilies')}
        ${decoration(d.roses, 'roses')}
        ${decoration(d.ribbon, 'ribbon')}
        ${decoration(d.seal, 'seal')}
        <div class="keepsake-label">${decoration(d.label, 'label-frame')}<h1 class="label-names">${nameStack}</h1>${decoration(d.bow, 'label-bow')}</div>
      </div>
      <div class="cover-caption reveal"><h2>${text(copy.tagline)}</h2>${guest ? `<p class="cover-guest-name">${text(guest.name)}</p>` : ''}<p class="cover-date">${displayDate(day)}</p>
        <div class="countdown" aria-label="${text(copy.saveTheDate)}">${['day', 'hour', 'minute', 'second'].map((key, i) => `<div><span data-count="${i}">0</span><small>${text(ui[key])}</small></div>`).join('')}</div>
      </div>
    </section>
    <section id="couple" class="couple-section">
      <div class="portraits reveal">
        <figure class="groom-portrait">${photo(p.groom)}<figcaption><span>${text(copy.groomLabel)}</span><h2>${text(c.couple.groom)}</h2></figcaption></figure>
        <figure class="bride-portrait"><figcaption><span>${text(copy.brideLabel)}</span><h2>${text(c.couple.bride)}</h2></figcaption>${photo(p.bride)}</figure>
        ${decoration(d.flourish, 'portrait-flourish')}
      </div>
      <div class="chapter prose reveal"><h2>${text(copy.chapterTitle)}</h2><p>“${text(copy.chapterText)}”</p></div>
    </section>
    <section class="save-date reveal">${photo(p.saveTheDate)}<h2>${text(copy.saveTheDate)}</h2></section>
    <section id="events" class="invitation-section">
      <header class="invitation-heading reveal"><h2>${text(copy.invitationTitle)}</h2>${guest ? `<p class="guest-name">${text(guest.name)}</p>` : ''}<p>${text(copy.invitationText)}</p></header>
      <div class="families reveal">${c.families.map(f => `<div><h3>${text(f.title)}</h3>${familyParents(f)}<address>${text(f.address)}</address></div>`).join('')}</div>
      <div class="invitation-names reveal">${nameStack}</div>
      <div class="event-list">${c.events.map((event, i) => `<article class="event-card reveal"><h3>${text(event.title)}</h3><p class="event-time">${text(ui.atTime)} ${eventTime(event.startsAt)}</p><p class="event-date">${displayDate(event.startsAt)}</p>${event.lunarDate ? `<p class="lunar-date">${text(event.lunarDate)}</p>` : ''}<p class="at-venue">${text(ui.atVenue)}</p><h4>${text(event.venue)}</h4><address>${text(event.address)}</address><a class="map-link" href="${text(event.mapUrl)}" target="_blank" rel="noopener noreferrer">${icon('pin')}${text(ui.map)}</a>${decoration(d.flourish, `event-flourish flourish-${i % 2}`)}</article>`).join('')}</div>
    </section>
    <section id="story" class="story-section">
      <div class="slideshow reveal"><div class="slides" tabindex="0" aria-label="${text(copy.storyTitle)}">${p.slideshow.map((src, i) => `<button class="slide" data-gallery="story" data-index="${i}" aria-label="${text(alt)} ${i + 1}">${photo(src)}</button>`).join('')}</div><div class="slide-dots">${p.slideshow.map((_, i) => `<button data-slide="${i}" class="${i === 0 ? 'active' : ''}" aria-label="${text(ui.album)} ${i + 1}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('')}</div></div>
      <div class="story-heading reveal"><h2>${text(copy.storyTitle)}</h2>${decoration(d.bow, 'story-bow')}</div>
      <div class="prose story-text reveal">${copy.story.map((paragraph, i) => `<p>${i === 0 ? '“' : ''}${text(paragraph)}${i === copy.story.length - 1 ? '”' : ''}</p>`).join('')}</div>
    </section>
    <section class="calendar-section">
      ${photo(p.calendar, 'calendar-photo')}
      <div class="calendar-card reveal"><h2>${text(copy.calendarTitle.replace('{month}', cal.month))}</h2><p class="calendar-year">${cal.year}</p><div class="calendar-weekdays">${ui.weekdays.map(label => `<span>${text(label)}</span>`).join('')}</div><div class="calendar-days">${cal.cells.map(n => n === null ? '<span></span>' : `<span class="${n === cal.selected ? 'selected' : ''}" ${n === cal.selected ? `aria-label="${displayDate(day)}"` : ''}>${n === cal.selected ? icon('heart') : ''}<b>${n}</b></span>`).join('')}</div></div>
      ${decoration(d.ribbon, 'calendar-ribbon')}${decoration(d.roses, 'calendar-roses')}
    </section>
    <section id="album" class="album-section reveal"><h2>${text(copy.albumTitle)}</h2><div class="album-grid">${p.album.map((src, i) => `<button class="album-photo ${i >= 6 ? 'extra-photo' : ''}" ${i >= 6 ? 'hidden' : ''} data-gallery="album" data-index="${i}" aria-label="${text(alt)} ${i + 1}">${photo(src)}</button>`).join('')}</div>${p.album.length > 6 ? `<button class="pill more-photos">${text(ui.more)}</button>` : ''}</section>
    <section id="rsvp" class="rsvp-section reveal">${copy.rsvpIntro ? `<p class="section-intro">${text(copy.rsvpIntro)}</p>` : ''}<form class="rsvp-card" data-form="rsvp"><h2>${text(ui.rsvp)}</h2>${guest ? `<p class="rsvp-guest-name">${text(guest.name)}</p>` : formName('rsvp')}<fieldset><legend>${text(ui.rsvp)}</legend><label class="radio-label"><input type="radio" name="attendance" value="attending" required>${text(ui.attending)}</label><label class="radio-label"><input type="radio" name="attendance" value="declined" required>${text(ui.declined)}</label></fieldset><button class="submit-button" type="submit">${text(ui.sendRsvp)}</button><p class="form-status" role="status" aria-live="polite"></p></form></section>
    ${c.gifts.length ? `<section class="gift-section reveal"><button class="gift-trigger" data-open="gift-dialog" aria-label="${text(copy.giftTitle)}">${d.gift ? decoration(d.gift, 'gift-illustration') : icon('gift')}<span class="gift-hint" aria-hidden="true">Ấn vào</span></button><button class="pill gift-title" data-open="gift-dialog">${text(copy.giftTitle)}</button><p class="section-intro">${text(copy.giftIntro)}</p></section>` : ''}
    <footer class="closing">${photo(p.closing)}<div class="closing-copy reveal"><p>${text(names)}</p>${decoration(d.flourish, 'closing-flourish')}<h2>${text(copy.closing)}</h2></div></footer>
    <nav class="bottom-nav" aria-label="${text(ui.menu)}"><div class="nav-left">${c.music ? `<button class="music-toggle" aria-pressed="false" aria-label="${text(ui.soundOff)}">${icon('music')}<span><b class="sound-label">${text(ui.soundOff)}</b><i class="sound-bars"><i></i><i></i><i></i><i></i></i></span></button>` : ''}</div><button class="icon-button" data-open="menu-dialog" aria-label="${text(ui.menu)}">${icon('menu')}</button><button class="wish-button" data-open="wish-dialog">${text(ui.wishes)}</button></nav>
    <dialog id="menu-dialog" class="menu-dialog" aria-labelledby="menu-title">${closeButton}<h2 id="menu-title">${text(ui.menu)}</h2><nav>${menu.map(([id, title], i) => `<a href="#${id}"><small>0${i + 1}</small>${text(title)}${icon('arrow')}</a>`).join('')}</nav></dialog>
    <dialog id="wish-dialog" class="wish-dialog" aria-labelledby="wish-title"><div class="wish-dialog-toolbar">${closeButton}</div><div class="wish-dialog-content"><form data-form="wishes"><h2 id="wish-title">${text(ui.wishes)}</h2><p class="wish-names">${text(names)}</p><button type="button" class="view-wishes">Xem lời chúc của mọi người ↓</button>${guest ? `<p class="wish-sender">Người gửi: <strong>${text(guest.name)}</strong></p>` : formName('wish')}<p class="wish-public-note">Lời chúc và tên người gửi sẽ được hiển thị công khai bên dưới.</p><label for="wish-message">${text(ui.message)}</label><textarea id="wish-message" name="message" rows="5" maxlength="2000" placeholder="${text(ui.messagePlaceholder)}" required></textarea><button class="pill" type="submit">${text(ui.sendWish)}</button><p class="form-status" role="status" aria-live="polite"></p></form><section class="wish-wall" aria-labelledby="wish-wall-title"><h3 id="wish-wall-title">Những lời chúc yêu thương</h3><p class="wish-list-status" role="status" aria-live="polite"></p><div class="wish-list" aria-busy="false"></div><button type="button" class="wish-load-more" hidden>Xem thêm lời chúc</button><button type="button" class="wish-retry" hidden>Thử lại</button></section></div></dialog>
    <dialog id="lightbox" class="lightbox" aria-label="${text(copy.albumTitle)}">${closeButton}<div class="lightbox-stage"><button class="icon-button lightbox-previous" aria-label="${text(ui.previous)}">${icon('arrow')}</button><img alt="${text(alt)}"><button class="icon-button lightbox-next" aria-label="${text(ui.next)}">${icon('arrow')}</button></div><p class="lightbox-counter" role="status"></p></dialog>
    ${c.gifts.length ? `<dialog id="gift-dialog" class="gift-dialog${c.gifts.length > 1 ? ' gift-dialog-split' : ''}" aria-labelledby="gift-title">${closeButton}<h2 id="gift-title">${text(copy.giftTitle)}</h2><div class="gift-accounts">${c.gifts.map((gift, i) => `<article class="gift-account"><h3>${text(gift.title)}</h3><div class="gift-qr-slot">${gift.qrImage ? `<img class="gift-qr" data-qr-src="${text(gift.qrImage)}" alt="${text(gift.title)} QR" hidden>` : ''}<p class="qr-pending" role="status">${text(ui.qrPending || 'QR ngân hàng sẽ được cập nhật sớm.')}</p></div>${gift.bank ? `<p>${text(gift.bank)}</p>` : ''}${gift.accountName ? `<p>${text(gift.accountName)}</p>` : ''}${gift.accountNumber ? `<p class="account-number">${text(gift.accountNumber)}</p><button class="pill copy-account" data-gift="${i}">${text(ui.copyAccount)}</button>` : ''}</article>`).join('')}</div><p class="copy-status" role="status"></p></dialog>` : ''}
    <p class="toast" role="status" aria-live="polite"></p>
  `;
  root.setAttribute('aria-busy', 'false');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observeNewPhotos = setupMotion(root, reduced);
  const toast = message => {
    const el = root.querySelector('.toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4500);
  };
  const wishDialog = root.querySelector('#wish-dialog');
  const refreshWishes = setupWishWall(wishDialog);
  root.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.open);
    dialog.showModal();
    if (dialog === wishDialog) void refreshWishes();
    // Load on open so a QR copied into assets appears without restarting the server.
    if (dialog.id === 'gift-dialog') dialog.querySelectorAll('[data-qr-src]').forEach(img => {
      const pending = img.parentElement.querySelector('.qr-pending');
      img.onload = () => { img.hidden = false; pending.hidden = true; };
      img.onerror = () => { img.hidden = true; pending.hidden = false; img.removeAttribute('src'); };
      img.src = img.dataset.qrSrc + '?v=' + Date.now();
    });
  }));
  root.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
  });
  root.querySelectorAll('.menu-dialog a').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); link.closest('dialog').close();
    document.querySelector(link.getAttribute('href')).scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' });
  }));
  const updateCountdown = () => countdown(day).forEach((value, i) => { root.querySelector(`[data-count="${i}"]`).textContent = String(value).padStart(2, '0'); });
  updateCountdown(); setInterval(updateCountdown, 1000);

  if (c.music) {
    const audio = new Audio(c.music); audio.loop = true; audio.preload = 'metadata';
    const button = root.querySelector('.music-toggle');
    let wantsMusic = true;
    const update = () => { const playing = !audio.paused; button.classList.toggle('playing', playing); button.setAttribute('aria-pressed', String(playing)); button.setAttribute('aria-label', playing ? ui.soundOn : ui.soundOff); button.querySelector('.sound-label').textContent = playing ? ui.soundOn : ui.soundOff; };
    const gestures = ['click', 'touchend', 'keydown'];
    const stopAutomaticStart = () => gestures.forEach(type => document.removeEventListener(type, onGesture, true));
    const startMusic = async (showError = false) => {
      try {
        await audio.play();
        if (!wantsMusic) audio.pause();
        else stopAutomaticStart();
      } catch {
        // Autoplay blocking is expected on phones; retry during a real interaction.
        if (showError && wantsMusic) toast(ui.musicError);
      }
      update();
    };
    function onGesture(event) {
      if (!wantsMusic || event.target instanceof Element && event.target.closest('.music-toggle')) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      void startMusic();
    }
    button.addEventListener('click', async () => {
      stopAutomaticStart();
      if (audio.paused) { wantsMusic = true; await startMusic(true); }
      else { wantsMusic = false; audio.pause(); update(); }
    });
    audio.addEventListener('play', () => {
      if (!wantsMusic) audio.pause();
      else stopAutomaticStart();
      update();
    });
    audio.addEventListener('pause', update);
    audio.addEventListener('error', () => { audio.pause(); stopAutomaticStart(); update(); });
    gestures.forEach(type => document.addEventListener(type, onGesture, { capture: true, passive: true }));
    void startMusic();
  }
  let gallery = [], galleryIndex = 0;
  const lightbox = root.querySelector('#lightbox');
  const showPhoto = i => {
    galleryIndex = (i + gallery.length) % gallery.length;
    lightbox.querySelector('img').src = gallery[galleryIndex];
    lightbox.querySelector('.lightbox-counter').textContent = `${galleryIndex + 1} / ${gallery.length}`;
  };
  root.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => {
    gallery = button.dataset.gallery === 'story' ? p.slideshow : p.album;
    showPhoto(Number(button.dataset.index)); lightbox.showModal();
  }));
  lightbox.querySelector('.lightbox-previous').addEventListener('click', () => showPhoto(galleryIndex - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => showPhoto(galleryIndex + 1));
  lightbox.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showPhoto(galleryIndex + (event.key === 'ArrowLeft' ? -1 : 1)); }
  });
  root.querySelector('.more-photos')?.addEventListener('click', event => { root.querySelectorAll('.extra-photo').forEach(el => { el.hidden = false; }); observeNewPhotos(); event.currentTarget.remove(); });

  const slides = root.querySelector('.slides'), slideEls = [...slides.children], dots = [...root.querySelectorAll('[data-slide]')];
  let slideIndex = 0, pauseUntil = 0;
  const goSlide = i => {
    slideIndex = i; slides.scrollTo({ left: slideEls[i].offsetLeft - slides.offsetLeft, behavior: reduced.matches ? 'instant' : 'smooth' });
  };
  dots.forEach((dot, i) => dot.addEventListener('click', () => { pauseUntil = Date.now() + 10000; goSlide(i); }));
  const pauseSlides = () => { pauseUntil = Date.now() + 10000; };
  for (const event of ['pointerdown', 'focusin', 'wheel']) slides.addEventListener(event, pauseSlides, { passive: true });
  slides.addEventListener('scroll', () => {
    slideIndex = slideEls.reduce((best, el, i) => Math.abs(el.offsetLeft - slides.offsetLeft - slides.scrollLeft) < Math.abs(slideEls[best].offsetLeft - slides.offsetLeft - slides.scrollLeft) ? i : best, 0);
    dots.forEach((dot, i) => { dot.classList.toggle('active', i === slideIndex); dot.setAttribute('aria-current', String(i === slideIndex)); });
  }, { passive: true });
  setInterval(() => {
    const r = slides.getBoundingClientRect();
    if (!reduced.matches && !document.hidden && !document.querySelector('dialog[open]') && Date.now() > pauseUntil && !slides.matches(':hover, :focus-within') && r.bottom > 0 && r.top < innerHeight) goSlide((slideIndex + 1) % slideEls.length);
  }, 4500);

  if (guest?.attendance) {
    root.querySelector(`[data-form="rsvp"] [value="${guest.attendance === 'attending' ? 'attending' : 'declined'}"]`).checked = true;
    root.querySelector('[data-form="rsvp"] .form-status').textContent = 'Bạn đã xác nhận. Bạn có thể thay đổi lựa chọn và gửi lại.';
  }
  root.querySelectorAll('[data-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.pending) return;
    const button = form.querySelector('[type="submit"]'), status = form.querySelector('.form-status'), label = button.textContent;
    const data = Object.fromEntries(new FormData(form));
    if (guest) data.token = guestToken;
    form.dataset.pending = 'true'; button.disabled = true; button.textContent = ui.sending; status.textContent = ''; status.classList.remove('success');
    try {
      const res = await fetch(`/api/${form.dataset.form}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(res.status === 429 ? ui.rateError : res.status === 400 ? body.error || ui.sendError : ui.sendError);
      }
      status.textContent = form.dataset.form === 'rsvp' ? ui.rsvpSuccess : ui.wishSuccess;
      status.classList.add('success');
      if (!(guest && form.dataset.form === 'rsvp')) form.reset();
      if (form.dataset.form === 'wishes' && wishDialog.open) {
        void refreshWishes();
        wishDialog.querySelector('.wish-wall').scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    } catch (error) { status.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? ui.sendError : error.message; }
    finally { delete form.dataset.pending; button.disabled = false; button.textContent = label; }
  }));
  root.querySelectorAll('.copy-account').forEach(button => button.addEventListener('click', async () => {
    const status = root.querySelector('.copy-status');
    try { await navigator.clipboard.writeText(c.gifts[Number(button.dataset.gift)].accountNumber); status.textContent = ui.copied; }
    catch { status.textContent = ui.copyError; }
  }));
}

main().catch(error => {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<p class="loading" role="alert">${escape(error.userMessage || 'Chưa mở được thiệp. Vui lòng tải lại trang.')}</p>`;
});
