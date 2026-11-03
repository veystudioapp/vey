# Terminal và tìm kiếm

## Terminal

Terminal nằm dưới chat hoặc file bạn đang đọc, trải hết chiều ngang. Mỗi shell là
một tab; **+** mở thêm shell mới trong thư mục của project hiện tại.

| Phím      | Làm gì                |
| --------- | --------------------- |
| `` ⌃` ``  | Hiện hoặc ẩn terminal |
| `` ⌃⇧` `` | Mở terminal mới       |

`` ⌃` `` dùng được cả khi đang ở trong shell, nên bạn có thể ẩn terminal ngay sau
khi chạy lệnh.

- `⌘`-click vào đường dẫn file trong output để mở file đó.
- Bôi đen một đoạn output rồi gửi vào khung soạn tin của chat hiện tại, để hỏi
  về lỗi mà không phải chép tay.
- **Restart shell** mở shell mới trong cùng tab.

Các shell kết thúc khi Vey thoát.

## Tìm kiếm

**Search** (`⇧⌘F`, hoặc biểu tượng kính lúp trên dải bên trái) tìm trong mọi file
của mọi project **và** mọi điều đã nói trong mọi chat.

- `Aa` phân biệt hoa thường, `ab` khớp nguyên từ, `.*` dùng biểu thức chính quy.
- Thu hẹp bằng **All** / **Files** / **Chats**, **Search only this project**, và
  các file cần gồm hoặc loại trừ (`src/**`, `*.test.ts`).
- **Replace** thay thế trong file, từng chỗ khớp hoặc từng file một. Chat không
  bao giờ bị sửa. Khi bật `.*`, `$1` trong chuỗi thay thế là nhóm thứ nhất, `$&`
  là toàn bộ chỗ khớp.
- `F4` / `⇧F4` đi qua các kết quả; `⌫` bỏ một kết quả.

Bấm vào kết quả để mở file tại dòng đó, hoặc mở chat tại tin nhắn đó.

![Tìm localStorage: 10 kết quả trong 3 chat và 3 kết quả trong một file, mỗi kết quả chat ghi rõ Claude hay You](/screenshots/search.png)

## Command palette

`⌘P`, hoặc ô **Run a command** trên thanh tiêu đề, tìm file hoặc chat theo tên.

![Command palette: ô tìm kiếm với All, Files và Chats, liệt kê các chat của project](/screenshots/command-palette.png)
