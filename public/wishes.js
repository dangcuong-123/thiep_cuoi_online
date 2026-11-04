export function setupWishWall(dialog) {
  const wall = dialog.querySelector('.wish-wall');
  const list = wall.querySelector('.wish-list');
  const status = wall.querySelector('.wish-list-status');
  const more = wall.querySelector('.wish-load-more');
  const retry = wall.querySelector('.wish-retry');
  let cursor = null, active = null;

  const refresh = async (reset = true) => {
    if (active && !reset) return;
    active?.abort();
    const controller = new AbortController(); active = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    list.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang tải lời chúc…'; more.hidden = true; retry.hidden = true;
    try {
      const response = await fetch('/api/wishes' + (!reset && cursor ? `?before=${cursor}` : ''), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      if (active !== controller) return;
      if (reset) list.replaceChildren();
      for (const wish of data.wishes) {
        const card = document.createElement('article'); card.className = 'wish-entry';
        const name = document.createElement('h4'); name.textContent = wish.name;
        const message = document.createElement('p'); message.textContent = wish.message;
        const time = document.createElement('time'); time.dateTime = wish.created_at;
        const iso = wish.created_at.includes('T') ? wish.created_at : wish.created_at.replace(' ', 'T') + 'Z';
        const date = new Date(iso);
        time.textContent = Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
        card.append(name, message, time); list.append(card);
      }
      cursor = data.nextCursor;
      more.hidden = cursor === null;
      status.textContent = list.children.length ? '' : 'Chưa có lời chúc nào. Hãy gửi lời chúc đầu tiên nhé!';
    } catch {
      if (active !== controller || !dialog.open) return;
      status.textContent = 'Chưa tải được lời chúc. Bạn có thể thử lại hoặc tiếp tục gửi lời chúc.';
      retry.hidden = false; retry.onclick = () => { void refresh(reset); };
    } finally {
      clearTimeout(timeout);
      if (active === controller) { active = null; list.setAttribute('aria-busy', 'false'); }
    }
  };
  more.addEventListener('click', () => { void refresh(false); });
  dialog.querySelector('.view-wishes').addEventListener('click', () => wall.scrollIntoView({ block: 'start', behavior: 'instant' }));
  dialog.addEventListener('close', () => { active?.abort(); active = null; });
  return refresh;
}
