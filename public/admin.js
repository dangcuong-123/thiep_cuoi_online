const $ = selector => document.querySelector(selector);
let invitations = [];
const pageStatus = $('#page-status');
function loggedOut() {
  $('#login-panel').hidden = false;
  $('#dashboard').hidden = true;
  invitations = [];
  $('#invitation-list').replaceChildren();
  $('#created-url').value = '';
  $('#created').hidden = true;
}
async function api(path, body) {
  const result = await fetch(`/api/admin/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await result.json();
  if (!result.ok) {
    if (result.status === 401 && path !== 'login') loggedOut();
    throw new Error(data.error || 'Không thực hiện được. Vui lòng thử lại.');
  }
  return data;
}
const statusOf = guest => guest.attendance === 'attending' ? 'Tham dự' : guest.attendance === 'declined' ? 'Không tham dự' : 'Chưa xác nhận';
async function copy(url, input, hint) {
  try { await navigator.clipboard.writeText(url); hint.textContent = 'Đã sao chép link.'; }
  catch {
    input.hidden = false; input.value = url; input.focus(); input.select();
    hint.textContent = 'Hãy sao chép link đã chọn: Ctrl+C hoặc nhấn giữ trên điện thoại.';
  }
}
function render() {
  const counts = invitations.reduce((acc, i) => { acc[i.attendance || 'pending']++; return acc; }, { attending: 0, declined: 0, pending: 0 });
  $('#summary').textContent = `${invitations.length} thiệp · ${counts.attending} tham dự · ${counts.declined} không tham dự · ${counts.pending} chưa xác nhận`;
  const search = $('#search').value.trim().toLocaleLowerCase('vi');
  const filtered = invitations.filter(i => i.name.toLocaleLowerCase('vi').includes(search));
  $('#empty').hidden = filtered.length > 0;
  $('#empty').textContent = invitations.length ? 'Không tìm thấy người nhận phù hợp.' : 'Chưa có thiệp nào. Tạo lời mời đầu tiên ở phía trên.';
  const list = $('#invitation-list'); list.replaceChildren();
  for (const guest of filtered) {
    const card = document.createElement('article'); card.className = 'guest-card';
    const top = document.createElement('div'); top.className = 'guest-top';
    const info = document.createElement('div');
    const name = document.createElement('h3'); name.textContent = guest.name;
    const time = document.createElement('time');
    const timestamp = guest.updated_at || guest.created_at;
    time.dateTime = timestamp;
    time.textContent = `${guest.updated_at ? 'Phản hồi' : 'Tạo thiệp'}: ${new Date(timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    info.append(name, time);
    const badge = document.createElement('span'); badge.className = `badge ${guest.attendance || ''}`; badge.textContent = statusOf(guest);
    top.append(info, badge);
    const actions = document.createElement('div'); actions.className = 'guest-actions';
    const copyButton = document.createElement('button'); copyButton.type = 'button'; copyButton.className = 'secondary'; copyButton.textContent = 'Sao chép link';
    const open = document.createElement('a'); open.href = guest.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = 'Mở thiệp ↗';
    const input = document.createElement('input'); input.readOnly = true; input.hidden = true; input.setAttribute('aria-label', `Link thiệp của ${guest.name}`);
    const hint = document.createElement('p'); hint.className = 'copy-hint'; hint.setAttribute('role', 'status');
    copyButton.addEventListener('click', () => copy(guest.url, input, hint));
    actions.append(copyButton, open);
    card.append(top, actions, input, hint); list.append(card);
  }
}
async function refresh() {
  const data = await api('invitations'); invitations = data.invitations; render();
}
async function loadDashboard() {
  const session = await api('session');
  $('#base-url').textContent = `Địa chỉ gửi thiệp: ${session.baseUrl}`;
  await refresh();
  $('#login-panel').hidden = true; $('#dashboard').hidden = false; pageStatus.textContent = '';
  $('#guest-name').focus();
}
async function submit(form, action) {
  const button = form.querySelector('button[type="submit"]'), status = form.querySelector('.status');
  if (button.disabled) return;
  button.disabled = true; status.textContent = 'Đang xử lý…';
  try { await action(status); }
  catch (error) { status.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'Chưa kết nối được máy chủ. Vui lòng thử lại.' : error.message; }
  finally { button.disabled = false; }
}
$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  void submit(event.currentTarget, async status => {
    await api('login', { password: $('#password').value }); $('#password').value = ''; status.textContent = '';
    await loadDashboard();
  });
});
$('#create-form').addEventListener('submit', event => {
  event.preventDefault();
  void submit(event.currentTarget, async status => {
    const data = await api('invitations', { name: $('#guest-name').value });
    invitations.unshift(data.invitation); render();
    $('#created-url').value = data.invitation.url; $('#created').hidden = false;
    $('#guest-name').value = ''; status.textContent = `Đã tạo thiệp cho ${data.invitation.name}.`;
  });
});
$('#copy-created').addEventListener('click', () => copy($('#created-url').value, $('#created-url'), $('#create-form .status')));
$('#search').addEventListener('input', render);
$('#refresh').addEventListener('click', async event => {
  event.currentTarget.disabled = true; pageStatus.textContent = 'Đang tải danh sách…';
  try { await refresh(); pageStatus.textContent = ''; }
  catch (error) { pageStatus.textContent = error.message; }
  finally { $('#refresh').disabled = false; }
});
$('#logout').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try { await api('logout', {}); loggedOut(); pageStatus.textContent = 'Đã đăng xuất.'; }
  catch (error) { pageStatus.textContent = error.message; }
  finally { $('#logout').disabled = false; }
});
loadDashboard().catch(error => { loggedOut(); pageStatus.textContent = error.message; });
