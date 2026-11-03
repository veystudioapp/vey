# Cài đặt và plugin

Mở **Settings** bằng `⌘,` hoặc biểu tượng bánh răng ở cuối dải bên trái.

## Appearance

- **Theme** — System, Light hoặc Dark.
- **Accent** — Indigo, Graphite, Teal, Rose hoặc Amber.
- **Font** và **Monospace font** — font của giao diện, và font dùng cho editor,
  diff và terminal.
- **Font size** — Small, Default hoặc Large; phóng to/thu nhỏ cả cửa sổ.
- **Density** — Compact, Comfortable hoặc Spacious.
- **Background** — một bức ảnh phía sau studio, thấy được ở khe giữa các panel.
- **Tour** — xem lại phần giới thiệu lần đầu mở app.

## Tabs & editor

- **Show tabs from every project** — khi tắt, thanh tab chỉ hiện project bạn
  đang làm.
- **Show who last changed the line** — git blame ở cuối dòng hiện tại.

## Chats

- **Notify me when a chat finishes** — bật sẵn. Hiện thông báo khi chat xong,
  lỗi hoặc cần hỏi gì trong lúc cửa sổ ở nền. Bấm vào thông báo để mở chat.

## Claude

- **Your accounts** — các tài khoản Claude mà chat có thể chạy. Xem
  [Tài khoản Claude](/vi/docs/accounts).
- **Helpers › Commit message drafts** — model và tài khoản nút **Draft** của tab
  Git sử dụng.

## Plugins

Plugin bổ sung tính năng cho Vey. Có sẵn hai plugin, đều đang bật:

- **Chat export** — chép chat dưới dạng Markdown, hoặc lưu thành file Markdown
  hay HTML, từ menu chuột phải của chat.
- **Usage** — số token mỗi chat đã dùng, theo ngày, model, project và chat. Mở
  bằng nút **Usage** trên dải bên trái.

Tắt plugin ở đây nếu bạn không dùng.

::: warning
Plugin chạy bên trong studio với đúng quyền của studio — file, terminal và chat
của bạn. Chỉ bật plugin bạn tin tưởng.
:::

## Updates

Hiện phiên bản Vey và Claude Code của bạn, và có bản Vey mới hơn hay
không. Cài bản cập nhật sẽ khởi động lại app, và các phiên terminal đang mở sẽ
kết thúc. Trên Linux, nút này mở trang release.
