# Thiệp cưới Editorial Keepsake

Thiệp cưới dựng theo [mẫu Editorial Keepsake](https://m-invite.com/template-preview/6acf9f6fd87f65d80e04c9be): khổ 428 px, phong bì đỏ, ảnh ghép, hoa và typography của mẫu. Nội dung tự giãn để thay tên, lời mời và câu chuyện. Mobile vừa chiều ngang, desktop căn giữa.

## Chạy website

Cần **Node.js 24**. Chạy `npm ci` một lần sau khi tải mã nguồn để cài thư viện kết nối Turso. Local vẫn dùng SQLite; hướng dẫn triển khai miễn phí nằm trong [DEPLOY.md](DEPLOY.md).

### Ubuntu / Linux

```bash
cd "$HOME/Desktop/của Tú/thiep_online"
nvm use
npm ci
npm run admin:setup
bash start.sh
```

Mở **http://localhost:3000**, dừng bằng `Ctrl+C`. `start.sh` tự chọn Node.js 24
qua nvm theo `.nvmrc`, không đổi bản Node mặc định của các dự án khác.
Nếu máy chưa có Node.js 24, chạy `nvm install 24` trước.

Để kiểm thử:

```bash
nvm use
npm test
```

Đổi cổng bằng `PORT=3001 bash start.sh`. Thử bằng điện thoại cùng Wi-Fi bằng
`HOST=0.0.0.0 bash start.sh`, rồi mở `http://<IP-máy-tính>:3000`.

### Windows / PowerShell

```powershell
cd C:\Users\MSI\Desktop\home\thiep_online
npm ci
npm run admin:setup
npm start
```

Mở **http://localhost:3000**. Dừng bằng `Ctrl+C`. Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd start` (tương tự cho các lệnh npm khác).

Cổng khác:

```powershell
$env:PORT = '3001'
npm start
```

Mặc định máy chủ chỉ lắng nghe trên máy hiện tại. Để thử bằng điện thoại cùng Wi-Fi, đặt `$env:HOST = '0.0.0.0'`, chạy lại và mở `http://<IP-máy-tính>:3000`. Khi đưa lên Vercel, dùng Turso để lưu dữ liệu bền vững; xem [DEPLOY.md](DEPLOY.md).

## Thiệp riêng và quản trị

Mở **http://localhost:3000/admin**. Mật khẩu local nằm trong `ADMIN_PASSWORD` của `.env`, được tạo bằng `npm run admin:setup`. Đăng nhập tồn tại 12 giờ; đăng xuất hủy phiên trong database.

Chọn **Nhà gái** hoặc **Nhà trai**, nhập nguyên tên/xưng hô muốn hiển thị (ví dụ **Anh Tuấn và gia đình**), bấm **Tạo thiệp riêng**, rồi **Sao chép link**. Tên nằm dưới “Trân Trọng Kính Mời”. Khách chỉ chọn tham dự/không tham dự; gửi lại cập nhật phản hồi cũ. Nút **Làm mới** trên admin tải trạng thái mới nhất. Danh sách hiển thị bên mời và có bộ lọc nhà trai/nhà gái. Mỗi lần tạo là một thiệp riêng, kể cả tên trùng nhau.

### Hai bản thiệp nhà trai và nhà gái

Cả hai bản dùng chung tên cặp đôi, thông tin gia đình, ảnh, nhạc và QR trong `config/wedding.json`.

- **Nhà gái:** dùng `events` và `copy` ở cấp ngoài cùng như trước. `sides.bride.enabled` đang là `true`.
- **Nhà trai:** sửa từng sự kiện trong `sides.groom.events`: `startsAt`, `venue`, `address`, `mapUrl` và `lunarDate` nếu cần. Sửa lời mời trong `sides.groom.copy`. Có thể xóa một thẻ sự kiện nếu chỉ tổ chức một sự kiện.
- Sau khi điền đủ, đổi **`sides.groom.enabled` thành `true`**. Chạy `npm run validate`, khởi động lại máy chủ và tải lại admin. Khi chưa bật, admin vẫn cho chọn Nhà trai nhưng khóa nút tạo link và giải thích nội dung cần hoàn thiện.

Ngày giờ giữ định dạng `2026-11-16T07:30:00+07:00` (thay bằng ngày giờ thực tế của nhà trai). Sự kiện đầu tiên của mỗi bản quyết định ảnh bìa ghi ngày nào, đếm ngược và lịch tháng. Không dùng lịch nhà gái làm dữ liệu mẫu để gửi khách nhà trai.

Xem thiệp chung nhà gái bằng `/?side=bride`, nhà trai bằng `/?side=groom`. Bản chưa bật chỉ hiện thông báo đang cập nhật, không hiển thị lịch của bên kia.

Link riêng vẫn có dạng `/?guest=<mã>`. Bên mời được lưu trong database khi tạo; thêm `side` vào URL không đổi được bên mời của link đó. Các link đã tạo trước tính năng này giữ nguyên mã, phản hồi và được xếp vào **Nhà gái**, phù hợp với nội dung hiện tại. Bản sao lưu/CSV mới có thêm trường `side`; công cụ nhập vẫn nhận được backup cũ.

`PUBLIC_BASE_URL` quyết định địa chỉ trong link được tạo. Link localhost chỉ mở trên máy này; muốn gửi khách từ xa hãy triển khai theo [DEPLOY.md](DEPLOY.md). Người có link riêng có thể xem tên và thay đổi phản hồi của thiệp đó; hãy gửi đúng người.

## Chỉnh toàn bộ nội dung ở một file

Sửa **`config/wedding.json`**, lưu dưới dạng UTF-8, rồi dừng/chạy lại máy chủ và tải lại trang. JSON không có comment, không có dấu phẩy sau phần tử cuối cùng. Khi cấu hình sai hoặc thiếu tài nguyên, máy chủ báo tên trường cần sửa ngay lúc khởi động.

| Trường | Nội dung |
| --- | --- |
| `couple` | Tên chú rể và cô dâu |
| `families` | Hai gia đình: tiêu đề, bố, mẹ, địa chỉ. Có thể bỏ trường bố/mẹ hoặc để `""` để ẩn dòng đó. |
| `events` | Các sự kiện: tiêu đề, ngày giờ, địa điểm, địa chỉ, link bản đồ, ngày âm lịch |
| `copy` | Lời mời, lời giới thiệu, từng đoạn câu chuyện, các tiêu đề và lời kết |
| `ui` | Nhãn nút, biểu mẫu, thông báo, tên các ngày trong tuần |
| `photos` | Ảnh bìa, chân dung, ảnh từng phần, danh sách slideshow và album |
| `decorations` | Phong bì, hoa, con dấu, nơ và khung trang trí |
| `music` | Đường dẫn nhạc local; đặt `""` để ẩn nút nhạc |
| `gifts` | Danh sách nhận quà; đặt `[]` để ẩn toàn bộ phần nhận quà |
| `theme` | Màu chính, stylesheet phông chữ và tên phông cho từng vai trò |

**Ảnh, nhạc, phông chữ và QR:** chép vào `public/assets/` rồi khai báo đường dẫn `/assets/ten-file.jpg`. Nên dùng tên file không dấu và không có khoảng trắng. Tài nguyên được phục vụ local; không cần truy cập CDN để xem thiệp. Nên dùng ảnh dọc cho bìa/chân dung/lời kết, ảnh ngang cho Save the Date. Ảnh được cắt theo khung bằng `object-fit: cover`.

Ví dụ thay tên và ngày giờ:

```json
"couple": { "groom": "Hoàng Nam", "bride": "Thu Hà" }
```

```json
{
  "title": "HÔN LỄ ĐƯỢC TỔ CHỨC",
  "startsAt": "2027-12-18T09:00:00+07:00",
  "lunarDate": "",
  "venue": "TƯ GIA NHÀ TRAI",
  "address": "Địa chỉ của bạn",
  "mapUrl": "https://www.google.com/maps/search/?api=1&query=Dia+chi+cua+ban"
}
```

`events[0].startsAt` là ngày cưới chính: phần đầu, đếm ngược, lịch tháng và ngày đánh dấu đều dùng nguồn này. Mỗi thẻ sự kiện hiển thị ngày giờ riêng của nó. Định dạng ngày giờ bắt buộc `YYYY-MM-DDTHH:mm:ss+07:00`; giữ `timezone` là `Asia/Ho_Chi_Minh`. Đếm ngược dừng ở 0 sau ngày cưới. Tiêu đề lịch có thể dùng `{month}` để tự cập nhật tháng.

Thứ trong tuần được tính từ ngày thực tế, không sao chép dòng “THỨ 7” đang không khớp ngày 20/10/2027 trên mẫu. `lunarDate` là nội dung nhập tay; mặc định để trống vì ngày âm lịch mẫu cũng không khớp năm. Trang không tự quy đổi âm lịch.

### Hộp quà cưới và QR ngân hàng

Hộp quà đã được bật sẵn, dùng đúng hình hộp quà của mẫu. Bấm vào hình hoặc nút **HỘP QUÀ CƯỚI** sẽ mở hộp thoại nhận quà.

Bạn chỉ cần chép ảnh QR ngân hàng của mình thành **`public/assets/qr-ngan-hang.png`**, rồi tải lại trang. Không cần khởi động lại máy chủ khi chỉ thêm/thay ảnh này. Trước khi có ảnh, hộp thoại hiện “QR ngân hàng sẽ được cập nhật sớm.”, không dùng mã QR hoặc tài khoản giả.

Nếu ảnh là JPG, giữ đúng đuôi file (ví dụ `qr-ngan-hang.jpg`), đổi `gifts[0].qrImage` thành `/assets/qr-ngan-hang.jpg`, rồi khởi động lại máy chủ vì đã thay cấu hình. Không đổi đuôi JPG thành PNG bằng cách đổi tên.

Ảnh QR có thể dùng riêng, không cần nhập thông tin tài khoản. Các trường `bank`, `accountName`, `accountNumber` có thể để `""`; chỉ những thông tin đã điền mới hiển thị. Nếu nhập số tài khoản, hộp thoại sẽ có thêm nút sao chép. Không cắt mất viền trắng hoặc làm méo ảnh QR.

Ví dụ cấu hình hộp quà có đầy đủ thông tin:

```json
"gifts": [
  {
    "title": "Mừng cưới chú rể",
    "bank": "Tên ngân hàng",
    "accountName": "TEN CHU TAI KHOAN",
    "accountNumber": "0123456789",
    "qrImage": "/assets/qr-chu-re.png"
  }
]
```

Nếu dùng hai tài khoản, đặt cô dâu ở `gifts[0]` (cột trái), chú rể ở `gifts[1]` (cột phải). Các trường chưa có thông tin có thể để `""`; không hiện nút sao chép khi chưa có số tài khoản.

`qrImage` không bắt buộc; nếu ảnh chưa tồn tại, hộp thoại sẽ hiện thông báo chờ cập nhật. Đặt `gifts` thành `[]` khi muốn ẩn toàn bộ hộp quà. Nút sao chép dùng clipboard của trình duyệt; khi bị từ chối, người xem có thể chọn và sao chép số tài khoản trực tiếp.

## Dữ liệu khách mời

Máy chủ tự tạo **`data/wedding.sqlite`** và các bảng dữ liệu:

- `invitations`: mã link, tên người nhận và thời điểm tạo.
- `rsvps`: `id`, `name`, `attendance` (`attending` hoặc `declined`), `created_at`, `invitation_id`, `updated_at`.
- `wishes`: `id`, `name`, `message`, `created_at`.

Thời điểm lưu là UTC dạng ISO 8601. Link chung tạo dòng mới theo mỗi lần gửi hợp lệ. Link riêng cập nhật duy nhất một phản hồi theo mã thiệp; hai khách trùng tên không bị gộp. Dữ liệu tồn tại qua các lần tắt/mở máy chủ. Trang `/admin` có đăng nhập để quản lý thiệp và xem trạng thái; không có API công khai đọc danh sách. Các file trong `data/` không được máy chủ phục vụ qua web và được loại khỏi Git.

Giao diện chỉ báo thành công khi máy chủ đã lưu xong, giữ dữ liệu đã nhập khi gửi lỗi và chặn thao tác gửi lặp trong lúc chờ. Máy chủ kiểm tra tên dài 1–100 ký tự, lời chúc dài 1–2000 ký tự và trạng thái tham dự hợp lệ. Giới hạn chung 10 yêu cầu gửi/phút/IP; bộ đếm lưu trong database, tiếp tục có hiệu lực khi khởi động lại hoặc chạy nhiều instance. Không dùng địa chỉ IP do khách tự khai báo trong header.

### Xem dữ liệu

Mở `data/wedding.sqlite` bằng DB Browser for SQLite, hoặc dùng `sqlite3`:

```powershell
sqlite3 -header -column data/wedding.sqlite "SELECT * FROM rsvps ORDER BY id DESC;"
sqlite3 -header -column data/wedding.sqlite "SELECT * FROM wishes ORDER BY id DESC;"
```

### Xuất CSV và sao lưu

```powershell
npm run data:export
npm run data:backup
```

CSV UTF-8 có BOM được lưu ở `data/exports/<thời-điểm>/rsvps.csv` và `wishes.csv`, mở được bằng Excel. Dấu nháy, xuống dòng và nội dung có thể bị hiểu là công thức bảng tính được xử lý khi xuất. Sao lưu local tạo file SQLite độc lập trong `data/backups/`, bao gồm WAL. Sao lưu Turso tạo JSON nhất quán của ba bảng khách mời/RSVP/lời chúc, không gồm phiên đăng nhập. Có thể chạy khi máy chủ hoạt động. CSV và bản sao lưu chứa thông tin/link khách: giữ riêng, không commit lên GitHub.

Để phục hồi: dừng máy chủ hoàn toàn, sao lưu bản hiện tại, rồi thay file `data/wedding.sqlite` bằng bản backup. Chỉ thực hiện sau khi không còn tiến trình nào mở cơ sở dữ liệu và không còn các file WAL/SHM của phiên cũ.

## API

| Endpoint | Yêu cầu / kết quả |
| --- | --- |
| `GET /api/config` | Cấu hình đã kiểm tra khi khởi động |
| `POST /api/rsvp` | Link chung: `{name, attendance}`; thiệp riêng: `{token, attendance}`. Tên của thiệp riêng luôn lấy từ database. |
| `GET /api/invitation?token=…` | Tên và trạng thái của đúng một thiệp; tăng nguyên tử lượt mở link |
| `POST /api/admin/login`, `POST /api/admin/logout` | Đăng nhập `{password}` / đăng xuất `{}` |
| `GET /api/admin/session` | Kiểm tra phiên quản trị |
| `GET/POST /api/admin/invitations` | Liệt kê (kèm `view_count`, `last_viewed_at`) / tạo thiệp `{name, side}`; yêu cầu phiên quản trị |
| `POST /api/wishes` | Link chung: `{name, message}`; thiệp riêng: `{token, message}`. Máy chủ tra tên người gửi theo token, không tin tên gửi từ trình duyệt. |

Gửi thành công trả HTTP `201`, `{"ok":true}`. Lỗi trả `{"error":"…"}` với mã `400`, `403`, `413`, `415`, `429` hoặc `500` tùy nguyên nhân. Giới hạn body 8 KiB. `429` kèm `Retry-After`. RSVP link chung và lời chúc không cần token; RSVP thiệp riêng cần mã thiệp; không cho phép nguồn web khác gửi qua browser.

Thống kê lượt mở chỉ áp dụng cho link riêng `?guest=…`, bắt đầu từ khi triển khai
tính năng này. Mở lại/tải lại thiệp và nút Mở thiệp trong admin đều tăng lượt;
đây không phải số người duy nhất. Link chung, sao chép link, gửi RSVP và làm mới
danh sách admin không tăng lượt. Tổng thống kê theo bộ lọc nhà trai/nhà gái;
nhấn Làm mới để lấy số mới nhất. CSV và backup phiên bản 3 lưu cả thống kê;
vẫn nhập được backup phiên bản 1/2 với số lượt ban đầu là 0.

## Kiểm tra

```powershell
npm test
npm run test:browser
```

- Kiểm thử Node: ngày giờ Việt Nam, tháng nhuận, đếm ngược sau ngày cưới, cấu hình sai, lưu và đọc lại SQLite sau khởi động, kiểm tra dữ liệu, giới hạn tần suất, đường dẫn riêng tư và tải nhạc từng đoạn.
- Kiểm thử trình duyệt: dùng Chrome/Edge đã cài, chế độ headless, dữ liệu QA riêng trong thư mục tạm. Kiểm tra 320/390/1440 px, tài nguyên local, menu, phóng ảnh, Escape, album, gửi lỗi rồi thử lại, biểu mẫu, nhạc, hộp quà, clipboard và nội dung có ký tự đặc biệt. Ảnh chụp nằm trong `test-results/`.
- Có thể đặt `BROWSER_PATH` nếu trình duyệt nằm ở đường dẫn khác. Tất cả tiến trình QA đều tự dừng; dữ liệu QA không được ghi vào cơ sở dữ liệu chính.

Các tài nguyên mẫu được giữ để đối chiếu thiết kế và thay bằng ảnh/nhạc của bạn. Nguồn ảnh và nhạc ghi trong `public/assets/sources.json`, nguồn phông ghi trong `font-sources.txt`. Dự án không gửi phản hồi tới M-Invite.
