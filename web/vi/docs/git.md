# Git

Tab **Git** trong Explorer cho thấy những gì đã thay đổi trong checkout của
project và những gì đã commit. Nó dành cho việc đọc lại thứ Claude đã làm và
commit chúng — branch, rebase và các việc khác thì dùng terminal.

## Changes

**Changes** liệt kê mọi file đã thay đổi dạng cây, chia thành **Staged** và
**Working tree**, kèm số dòng thêm và bớt.

- Bấm vào file để mở **diff** — song song hoặc gộp dòng, có **Show whitespace**
  khi cần. Diff chỉ để đọc; mở file nếu muốn sửa.
- Chuột phải để stage, unstage hoặc discard một file, hoặc dùng **Stage
  everything** và **Unstage everything**.
- **Discard every change in this checkout** trả mọi thứ về như commit gần nhất.
  File mới mà lệnh này cần xoá sẽ được bỏ vào thùng rác.

Danh sách tự làm mới khi file thay đổi, kể cả sau khi bạn commit trong terminal.

## Commit

Stage những gì bạn muốn, gõ message vào ô phía trên danh sách rồi nhấn `⌘⏎`.

**Draft** để Claude viết message giúp bạn dựa trên diff đã stage và mười tiêu đề
commit gần nhất, theo cùng văn phong. Nó chỉ điền vào ô — không có gì được commit
cho đến khi bạn tự bấm. Model và tài khoản nó dùng được chọn trong **Settings ›
Chats › Commit message drafts**.

## Commits

**Commits** là lịch sử của branch hiện tại, mới nhất trước, tải thêm khi cuộn.
Lọc theo message, tác giả hoặc hash.

- Commit chưa push được đánh dấu **Not pushed**.
- Bấm vào commit để xem các file nó thay đổi, và bấm vào file để xem diff trong
  commit đó. Chuột phải để chọn **Copy commit SHA** và **Open file at this
  commit**.
- **Push** đẩy branch lên `origin` — và đặt upstream nếu chưa có. Lệnh chạy nền
  và không bao giờ dừng lại hỏi gì; nếu git cần passphrase hay mật khẩu, lệnh
  push sẽ được chạy lại trong terminal để bạn nhập.
