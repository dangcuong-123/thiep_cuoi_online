# Đưa thiệp lên Vercel + Turso

Mã nguồn giữ trên GitHub riêng tư, website dùng Vercel Hobby và dữ liệu dùng
Turso Free. Dùng địa chỉ `.vercel.app`, không cần mua tên miền. Theo dõi hạn mức
trong dashboard; hướng dẫn này không bật gói trả phí.

## 1. Chuẩn bị local

```bash
cd "$HOME/Desktop/của Tú/thiep_online"
nvm use
npm ci
npm run admin:setup
npm run validate
npm test
npm run data:backup
```

Mở `.env` để xem `ADMIN_PASSWORD`. Không đưa `.env`, `data/`, CSV, bản sao lưu
hoặc link riêng của khách lên GitHub. Chúng đã được loại khỏi Git bằng `.gitignore`.
Mật khẩu và khóa Turso chỉ được đặt ở máy chủ, không đặt trong `wedding.json`
hoặc mã JavaScript trong `public/`.

Tạo một repository **Private** trên GitHub, rồi tải các file dự án vào đó.
Nếu dùng Git từ thư mục `thiep_online` chưa có repository:

```bash
git init
git add .
git status --short
git commit -m "Add personalized invitations and admin"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/<repository>.git
git push -u origin main
```

Kiểm tra danh sách file trước khi commit; không có `.env` hay `data/wedding.sqlite`.

## 2. Tạo database Turso

Đăng ký [Turso](https://turso.tech/). Dự án dùng `@libsql/client`: chọn database
**libSQL**, không chọn engine Turso mới dùng SDK khác.
Lấy Database URL và database auth token có quyền đọc/ghi từ dashboard.
Nếu dùng [Turso CLI](https://docs.turso.tech/cli/introduction), đăng nhập rồi:

```bash
turso db create thiep-wedding-production
turso db show thiep-wedding-production --url
turso db tokens create thiep-wedding-production
```

Lệnh `db create` ở trên tạo libSQL; không thêm cờ `--tursodb`.
Không chia sẻ đầu ra chứa auth token.

Tạo thêm một database riêng cho Preview, ví dụ `thiep-wedding-preview`.
Production và Preview phải dùng URL và token khác nhau. Không sao chép dữ liệu
khách thật sang Preview.

## 3. Chuyển dữ liệu hiện tại (nếu cần)

Đầu tiên dừng máy chủ local để không phát sinh phản hồi trong lúc chuyển.
Đã có công cụ sao lưu cả dữ liệu SQLite đang nằm trong WAL:

```bash
npm run data:backup
```

Giữ file SQLite vừa tạo trong `data/backups/`. Sau đó đặt URL và token database
**Production** vào `.env` local:

```dotenv
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=<database-auth-token>
```

Nhập từ đúng file backup vừa tạo:

```bash
npm run data:import -- data/backups/<file-backup>.sqlite
```

Database đích phải trống. Lệnh nâng cấp schema, nhập trong một transaction và
kiểm tra số dòng của ba bảng. Chạy lại cùng nguồn sẽ bỏ qua, không tạo bản trùng.
Nguồn khác gặp database đã có dữ liệu sẽ bị từ chối, không ghi đè phản hồi.
Giữ riêng bản backup gốc để đối chiếu. Các phản hồi cũ không tự gán vào thiệp mới
chỉ vì trùng tên.

Nếu chưa có dữ liệu cần giữ, bỏ qua nhập; ứng dụng tự tạo bảng khi kết nối lần đầu.
Để local tiếp tục dùng SQLite, xóa giá trị hai biến Turso trong `.env` sau khi nhập.

## 4. Tạo project Vercel

1. Đăng nhập [Vercel](https://vercel.com/) bằng tài khoản của bạn và chọn Hobby
   cho dự án thiệp cá nhân.
2. Import repository GitHub riêng tư vừa tạo. Cấp quyền chỉ cho repository cần dùng.
3. Nếu repository chỉ chứa dự án, Root Directory là thư mục gốc. Nếu dự án nằm
   trong một repository lớn, chọn `thiep_online`.
4. Framework: **Other**; Node.js: **24.x**. Build và output lấy từ `vercel.json`:
   `npm run build`, thư mục `public`. API trong `api/` chạy bằng Node Functions.
   Nếu trước đây đã ghi đè Build Command thành `npm run validate` trong dashboard,
   hãy đổi thành `npm run build` hoặc tắt ghi đè để dùng `vercel.json`.
   Build kiểm tra cấu hình/ảnh rồi tạo `public/invitation-config.json` cho CDN;
   tệp này chỉ chứa nội dung thiệp công khai, không chứa tên khách hay dữ liệu RSVP.
5. Đặt các Environment Variables dưới đây trước khi Deploy.

| Biến | Production | Preview |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Mật khẩu mạnh do bạn chọn | Mật khẩu khác dùng thử |
| `TURSO_DATABASE_URL` | URL database production | URL database preview |
| `TURSO_AUTH_TOKEN` | Token production | Token preview |
| `PUBLIC_BASE_URL` | `https://<ten-project>.vercel.app` | Địa chỉ HTTPS preview cố định |

`PUBLIC_BASE_URL` không có đường dẫn con hoặc query. Giá trị này quyết định link
được sao chép; không lấy hostname tùy ý do người gửi request cung cấp.
Nếu chưa có preview hostname cố định, lấy URL preview sau lần deploy đầu,
cập nhật biến trong đúng môi trường Preview rồi redeploy trước khi thử tạo link.

Không đặt biến bí mật vào nhóm biến có thể truy cập từ frontend. Khi đổi biến
môi trường, redeploy để áp dụng. Nếu đổi mật khẩu để thu hồi phiên cũ, xóa các
dòng trong bảng `admin_sessions` qua Turso dashboard rồi redeploy.

## 5. Nghiệm thu trước khi gửi khách

Khi triển khai bản có tính năng nhà trai/nhà gái, chạy `npm run data:backup` với
Turso Production trước khi push. Ứng dụng tự bổ sung cột `invitations.side`, giữ
nguyên mã link và RSVP cũ; các thiệp cũ được xếp vào nhà gái. Hoàn thiện
`sides.groom.events`, `sides.groom.copy` và bật `sides.groom.enabled` trước khi
gửi thiệp nhà trai. Không đặt `enabled: true` khi ngày giờ/địa điểm còn để trống.

- Mở `/admin`, đăng nhập, tạo một thiệp thử và sao chép link.
- Tắt Wi-Fi trên điện thoại, dùng dữ liệu di động mở link; kiểm tra đúng tên.
- Xác nhận tham dự rồi đổi sang không tham dự. Bấm Làm mới ở admin để kiểm tra.
- Redeploy Vercel, mở lại link: tên và phản hồi vẫn còn vì nằm trên Turso.
- Thử link chung, ảnh, nhạc, hộp quà và QR. Tạo hai thiệp trùng tên để kiểm tra độc lập.
- Xác nhận `/data/wedding.sqlite` và `/.env` trả 404; admin API không đăng nhập trả 401.

Việc tạo tài khoản, cấp quyền GitHub và nhập khóa dịch vụ cần thực hiện bằng
tài khoản của chủ website. Mã nguồn và cấu hình có sẵn không có nghĩa website
đã được xuất bản hoặc kết nối database cloud thành công.

## Sao lưu, xuất và phục hồi

Với `.env` trỏ vào Turso:

```bash
npm run data:export
npm run data:backup
```

CSV gồm thiệp, trạng thái RSVP và lời chúc. Backup cloud là JSON của ba bảng này
trong một snapshot nhất quán, không chứa phiên đăng nhập hoặc bộ đếm giới hạn.
Backup local là SQLite đầy đủ. Các file chỉ nằm trong `data/` trên máy chạy lệnh.

Phục hồi cloud: tạo database libSQL trống khác, đặt URL/token mới trong `.env`,
rồi chạy `npm run data:import -- data/backups/<file>.json` hoặc nguồn `.sqlite`.
Kiểm tra dữ liệu trước khi đổi biến môi trường Production và redeploy.
Không nhập đè vào database đang nhận phản hồi. Local: dừng máy chủ trước khi
phục hồi SQLite và giữ bản cũ; tránh để WAL/SHM của phiên cũ cạnh bản vừa phục hồi.

Tham khảo chính thức: [Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js),
[SQLite trên Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel),
[Turso SDK](https://docs.turso.tech/sdk/ts/reference),
[Turso CLI](https://docs.turso.tech/cli/introduction).
