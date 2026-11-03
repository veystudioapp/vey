# Bắt đầu

Vey là ứng dụng desktop để chạy các cuộc chat Claude Code trên những thư
mục đã có sẵn trong máy bạn, và xem lại chúng đã thay đổi gì: chat, editor,
diff, commit và terminal trong cùng một cửa sổ.

## Cài đặt {#install}

### macOS

macOS 12 (Monterey) trở lên.

<DownloadButton build="mac-arm64">Apple Silicon (M1 trở lên)</DownloadButton>
<DownloadButton build="mac-x64">Intel</DownloadButton>

Mở file `.dmg` rồi kéo **Vey** vào **Applications**.

### Windows

x64.

<DownloadButton build="windows">Windows (.exe)</DownloadButton>

Chạy file `.exe`.

### Linux

x64.

<DownloadButton build="linux">Linux (AppImage)</DownloadButton>

Rồi:

```bash
chmod +x Vey-*.AppImage
./Vey-*.AppImage
```

Cần có FUSE (`sudo apt install libfuse2` trên Debian và Ubuntu).

## Claude Code

Chat chạy trên chính `claude` của bạn, tức Claude Code CLI. Ứng dụng vẫn mở
được khi chưa có CLI, nhưng bạn cần nó để chat.

## Cuộc chat đầu tiên

1. **Thêm project.** Bấm **+** cạnh **Projects**, chọn một thư mục (hoặc kéo
   thả từ Finder) rồi bấm **Add folder**. Project là một thư mục đã có trong
   máy: Vey làm việc ngay tại chỗ, không bao giờ sao chép nó.

   ![Hộp thoại Add a folder](/screenshots/add-project.png)

2. **Kiểm tra tài khoản.** `claude` bạn đang dùng có sẵn trong **Accounts** ở
   cuối cột chat, tên là **This account**; muốn thêm tài khoản khác hoặc một
   endpoint API thì bấm **+** cạnh đó. Xem [Tài khoản Claude](/vi/docs/accounts).
3. **Bấm `+`** trên hàng của project để mở chat, rồi gõ tin nhắn. Xem
   [Chat](/vi/docs/chats) để biết mọi thứ khung soạn tin làm được.

## Cập nhật {#updating}

Khi có bản mới, một nút sẽ hiện trên thanh trạng thái. Bấm vào, ứng dụng tự tải
và cài bản cập nhật. Trên Linux, nút này mở trang release.
