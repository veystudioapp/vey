# Xử lý sự cố

## "Could not find `claude`"

Vey chạy chính Claude Code CLI của bạn, và tìm nó giống như login shell
của bạn. Nếu CLI được cài ở chỗ `PATH` của shell không với tới, hãy đặt
`CLAUDE_BIN` thành đường dẫn đầy đủ tới file `claude` trước khi mở app.
**Settings › Updates** cho biết phiên bản nào đã được tìm thấy.

## Tài khoản chưa đăng nhập

Mở menu của tài khoản trong mục **Accounts** ở cuối cột chat. **Check again**
kiểm tra lại tài khoản; **Sign in…** đăng nhập lại. Mỗi tài khoản là một lần đăng nhập Claude Code riêng, nên đăng xuất tài
khoản này không ảnh hưởng tài khoản khác.

## Chat dừng vì chạm giới hạn

Tài khoản đó đã hết hạn mức 5 giờ (hoặc hạn mức tuần). Thẻ trên chat cho biết
khi nào hạn mức reset; gửi tin nhắn tiếp theo sau thời điểm đó, chat sẽ làm tiếp
với toàn bộ cuộc trò chuyện.

## Chat có vẻ bị treo

- **Chiếc khiên** trên hàng của chat nghĩa là nó đang chờ bạn: mở chat và trả lời
  thẻ phía trên khung soạn tin.
- Nếu không, bấm **Stop** rồi gửi lại tin nhắn.

## Dữ liệu của tôi nằm ở đâu?

Project của bạn vẫn nằm nguyên chỗ cũ. Dữ liệu riêng của Vey — danh sách
project, cài đặt, chat và các phiên đăng nhập tài khoản Claude — nằm trong
`~/.veystudio` trên máy bạn. Mọi chat đi thẳng từ tài khoản Claude của bạn tới
Anthropic, hoặc tới endpoint API tuỳ chỉnh bạn đã cấu hình. Server của Vey chỉ
nhận số liệu sử dụng ẩn danh — ứng dụng được dùng bao lâu, phiên bản và hệ điều
hành — không bao giờ có gì về project hay chat của bạn.
