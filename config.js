import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIMEZONE } from './public/core.js';

export function loadConfig(filename, publicDir) {
  let c;
  try { c = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new Error(`config/wedding.json: ${error.message}`); }
  return validateConfig(c, publicDir);
}

export function validateConfig(c, publicDir) {
  const errors = [];
  const fail = (field, message) => errors.push(`${field}: ${message}`);
  const string = (value, field, allowEmpty = false) => {
    if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(field, 'cần là chuỗi văn bản' + (allowEmpty ? '' : ' không rỗng'));
  };
  const object = (value, field) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(field, 'cần là object'); return {}; }
    return value;
  };
  const asset = (value, field, optional = false, allowMissing = false) => {
    if (optional && value === '') return;
    if (typeof value !== 'string' || !/^\/assets\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes('..')) {
      fail(field, 'cần là đường dẫn local /assets/tên-tệp'); return;
    }
    if (!allowMissing && !existsSync(resolve(publicDir, value.slice(1)))) fail(field, `không tìm thấy tệp ${value}`);
  };
  c = object(c, 'config');
  const couple = object(c.couple, 'couple');
  for (const key of ['groom', 'bride']) string(couple[key], `couple.${key}`);
  if (c.timezone !== TIMEZONE) fail('timezone', `phải là ${TIMEZONE}`);
  const theme = object(c.theme, 'theme');
  if (!/^#[a-fA-F0-9]{6}$/.test(theme.accent)) fail('theme.accent', 'cần là màu hex 6 ký tự');
  for (const key of ['serif', 'script', 'ornamental', 'sans', 'date']) {
    if (typeof theme[key] !== 'string' || !/^[a-zA-Z0-9 -]+$/.test(theme[key])) fail(`theme.${key}`, 'tên phông chỉ gồm chữ, số, khoảng trắng và dấu gạch ngang');
  }
  asset(theme.fontsStylesheet, 'theme.fontsStylesheet');
  if (!Array.isArray(c.families) || c.families.length !== 2) fail('families', 'cần đúng 2 gia đình');
  (Array.isArray(c.families) ? c.families : []).forEach((value, i) => {
    const family = object(value, `families[${i}]`);
    for (const key of ['title', 'address']) string(family[key], `families[${i}].${key}`);
    for (const key of ['father', 'mother']) {
      if (family[key] !== undefined) string(family[key], `families[${i}].${key}`, true);
    }
  });
  if (!Array.isArray(c.events) || c.events.length < 1) fail('events', 'cần ít nhất một sự kiện');
  (Array.isArray(c.events) ? c.events : []).forEach((value, i) => {
    const event = object(value, `events[${i}]`), field = `events[${i}]`;
    for (const key of ['title', 'venue', 'address']) string(event[key], `${field}.${key}`);
    string(event.lunarDate, `${field}.lunarDate`, true);
    const match = typeof event.startsAt === 'string' && event.startsAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+07:00$/);
    let valid = false;
    if (match) {
      const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      valid = year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
    }
    if (!valid) fail(`${field}.startsAt`, 'cần ngày giờ hợp lệ dạng 2027-10-20T09:00:00+07:00');
    try { if (!['https:', 'http:'].includes(new URL(event.mapUrl).protocol)) throw new Error(); }
    catch { fail(`${field}.mapUrl`, 'cần là link http/https hợp lệ'); }
  });
  const copy = object(c.copy, 'copy');
  for (const key of ['tagline', 'groomLabel', 'brideLabel', 'chapterTitle', 'chapterText', 'saveTheDate', 'invitationTitle', 'invitationText', 'storyTitle', 'calendarTitle', 'albumTitle', 'rsvpIntro', 'giftIntro', 'giftTitle', 'closing']) string(copy[key], `copy.${key}`);
  if (!Array.isArray(copy.story) || copy.story.length === 0) fail('copy.story', 'cần danh sách đoạn văn');
  else copy.story.forEach((text, i) => string(text, `copy.story[${i}]`));
  const ui = object(c.ui, 'ui');
  for (const key of ['day', 'hour', 'minute', 'second', 'atTime', 'atVenue', 'map', 'rsvp', 'wishes', 'menu', 'home', 'couple', 'events', 'story', 'album', 'soundOn', 'soundOff', 'musicError', 'name', 'namePlaceholder', 'attending', 'declined', 'sendRsvp', 'message', 'messagePlaceholder', 'sendWish', 'rsvpSuccess', 'wishSuccess', 'sending', 'sendError', 'rateError', 'more', 'close', 'previous', 'next', 'copyAccount', 'copied', 'copyError', 'imageAlt', 'loading', 'loadError']) string(ui[key], `ui.${key}`);
  if (!Array.isArray(ui.weekdays) || ui.weekdays.length !== 7) fail('ui.weekdays', 'cần 7 tên ngày từ thứ Hai');
  else ui.weekdays.forEach((text, i) => string(text, `ui.weekdays[${i}]`));
  const photos = object(c.photos, 'photos');
  for (const key of ['cover', 'groom', 'bride', 'saveTheDate', 'calendar', 'closing']) asset(photos[key], `photos.${key}`);
  for (const key of ['slideshow', 'album']) {
    if (!Array.isArray(photos[key]) || !photos[key].length) fail(`photos.${key}`, 'cần ít nhất một ảnh');
    else photos[key].forEach((value, i) => asset(value, `photos.${key}[${i}]`));
  }
  const decorations = object(c.decorations, 'decorations');
  for (const key of ['envelopeBack', 'envelopeFront', 'label', 'bow', 'lilies', 'roses', 'ribbon', 'seal', 'flourish']) asset(decorations[key], `decorations.${key}`);
  if (decorations.gift) asset(decorations.gift, 'decorations.gift');
  if (ui.qrPending !== undefined) string(ui.qrPending, 'ui.qrPending');
  asset(c.music, 'music', true);
  if (!Array.isArray(c.gifts)) fail('gifts', 'cần danh sách, hoặc [] để ẩn');
  else c.gifts.forEach((value, i) => {
    const gift = object(value, `gifts[${i}]`);
    string(gift.title, `gifts[${i}].title`);
    for (const key of ['bank', 'accountName', 'accountNumber']) {
      if (gift[key] !== undefined) string(gift[key], `gifts[${i}].${key}`, true);
    }
    if (gift.qrImage) asset(gift.qrImage, `gifts[${i}].qrImage`, false, true);
  });
  if (errors.length) throw new Error(`Cấu hình thiệp không hợp lệ:\n- ${errors.join('\n- ')}`);
  return c;
}

export function loadVariants(config, publicDir) {
  const { sides, ...shared } = config;
  if (sides !== undefined && (!sides || typeof sides !== 'object' || Array.isArray(sides))) throw new Error('sides: cần là object.');
  if (sides && Object.keys(sides).some(side => !['bride', 'groom'].includes(side))) throw new Error('sides: chỉ hỗ trợ bride và groom.');
  return [['bride', 'Nhà gái'], ['groom', 'Nhà trai']].map(([side, label]) => {
    const overrides = sides?.[side] ?? {};
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error(`sides.${side}: cần là object.`);
    if (Object.keys(overrides).some(key => !['enabled', 'events', 'copy'].includes(key))) throw new Error(`sides.${side}: chỉ chỉnh enabled, events và copy; ảnh và QR dùng chung.`);
    const enabled = overrides.enabled ?? side === 'bride';
    if (typeof enabled !== 'boolean') throw new Error(`sides.${side}.enabled: cần true hoặc false.`);
    if (overrides.copy !== undefined && (!overrides.copy || typeof overrides.copy !== 'object' || Array.isArray(overrides.copy))) throw new Error(`sides.${side}.copy: cần là object.`);
    if (overrides.events !== undefined && !Array.isArray(overrides.events)) throw new Error(`sides.${side}.events: cần danh sách sự kiện.`);
    if (enabled && side === 'groom' && !Array.isArray(overrides.events)) throw new Error('sides.groom.events: cần khai báo lịch và địa điểm riêng của nhà trai.');
    const variant = { ...shared, events: overrides.events ?? shared.events, copy: { ...shared.copy, ...overrides.copy } };
    if (enabled) {
      try { validateConfig(variant, publicDir); }
      catch (error) { throw new Error(`sides.${side}: ${error.message}`); }
    }
    return { side, label, enabled, config: variant };
  });
}
