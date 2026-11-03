# Project và file

## Project

Project là một thư mục đã có trong máy bạn. Vey làm việc ngay tại chỗ —
không bao giờ sao chép, di chuyển hay tải nó lên đâu cả. Thêm bao nhiêu cũng
được; tất cả nằm trong cột **Projects** bên trái, mỗi project kèm các chat của
nó.

Để thêm project, bấm **+** cạnh **Projects**, chọn thư mục hoặc kéo thả vào, rồi
bấm **Add folder**.

Chuột phải vào project để chọn **New chat here**, **New terminal here**,
**Rename…**, **Copy path**, **Reveal in file manager**, **Change icon…** và
**Remove project**. Gỡ project chỉ bỏ nó khỏi danh sách; thư mục vẫn nằm nguyên
trên đĩa.

![Menu chuột phải của project: New chat here, New terminal here, Rename, Copy path, Reveal in file manager, Change icon, Reset icon, Remove project](/screenshots/project-menu.png)

Mỗi project hiện 20 chat gần nhất; **View all** liệt kê phần còn lại. `⌘B` ẩn
hoặc hiện cột này.

## Tab

Chat, file và diff mở thành tab ở phía trên. Mặc định thanh tab chỉ hiện tab của
project bạn đang làm; bật **Settings › Tabs & editor › Show tabs from every
project** để thấy tất cả.

| Phím          | Làm gì                       |
| ------------- | ---------------------------- |
| `⌘1` … `⌘9`   | Tab thứ n (`⌘9` là tab cuối) |
| `⌘⇧[` / `⌘⇧]` | Tab bên trái / bên phải      |
| `Ctrl+Tab`    | Tab tiếp theo                |
| `⌘W`          | Đóng tab                     |

## Explorer

Panel bên phải có hai tab: **All files** và **Git** (xem [Git](/vi/docs/git)).
Nó thu gọn thành một dải hẹp khi bạn cần thêm chỗ.

Trong **All files**, file được tô màu theo trạng thái git, và file đã thay đổi
có dấu `M`. Chuột phải vào file để mở dạng văn bản hoặc dạng diff (**Open
with**), **Copy** hay **Cut**, **Copy path** hay **Copy relative path**,
**Reveal in file manager**, **Rename** hoặc **Move to trash…** — Vey không
bao giờ xoá hẳn một file. Thư mục còn có thêm **New file** và **New folder**.

![Menu chuột phải của file trong Explorer: Open with Text editor hoặc Diff, Copy, Cut, Copy path, Copy relative path, Reveal in file manager, Rename, Move to trash](/screenshots/file-menu.png)

## Editor

Bấm vào file để mở trong tab. Editor tô màu khoảng 140 ngôn ngữ, và `⌘S` để lưu.

- File **Markdown** có thể mở bằng block editor, hiển thị trực tiếp tiêu đề,
  danh sách, bảng, hình ảnh và hình vẽ.
- File **HTML** có chế độ xem trước.
- **Merge conflict** được đánh dấu ngay trong file, với **Accept Current
  Change**, **Accept Incoming Change** và **Accept Both Changes** phía trên mỗi
  chỗ.
- **Ai sửa dòng này lần cuối** — khi bật **Settings › Tabs & editor › Show who
  last changed the line**, cuối dòng hiện tại sẽ có tác giả và commit, giống
  GitLens. Bấm vào để xem mọi commit từng sửa dòng đó.

![Một file mở trong editor, với Diff và Edit ở trên, tác giả và commit ở cuối dòng hiện tại](/screenshots/editor-blame.png)

## Hình ảnh

Ảnh mở trong trình xem, kèm trình sửa sau nút **Edit image**: cắt, đổi kích
thước, xoay, lật, và vẽ lên bằng bút, hình chữ nhật và mũi tên. **Save image** ghi
lại đúng định dạng gốc.
