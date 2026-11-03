# Tài khoản Claude

Vey chạy chính Claude Code của bạn, đăng nhập bằng tài khoản của bạn. Nếu bạn
dùng nhiều tài khoản Claude — công việc, cá nhân, team — hãy đăng nhập mỗi tài
khoản một lần và chọn chat nào chạy trên tài khoản nào, để việc của khách hàng
nằm trên tài khoản của khách hàng đó.

## Thêm tài khoản

1. Ở cuối cột chat, bên dưới các chat của project, tìm **Accounts** rồi bấm
   **+** cạnh nó.
1. Đặt tên cho tài khoản: _Công việc_, _Cá nhân_, _Team_…
1. Đăng nhập. Đây là màn hình login của chính Claude Code, nên mật khẩu của bạn
   không bao giờ đi qua Vey.

`claude` bạn đang dùng sẵn được liệt kê đầu tiên, tên là **This account**. Mỗi
tài khoản bạn thêm nằm trong một thư mục riêng và giữ nguyên trạng thái đăng
nhập. Mỗi hàng cho biết tài khoản đã đăng nhập chưa, và bằng email nào. Mở menu
của một hàng để **Check again**, hoặc **Sign in…** lại (hoặc **Sign in as
another account…** với tài khoản đã đăng nhập).

Mỗi hàng tài khoản cũng cho biết đã dùng bao nhiêu hạn mức 5 giờ và hằng tuần.

![Mục Accounts ở cuối cột chat: This account với thanh hạn mức 5 giờ và tuần](/screenshots/accounts.png)

## Thêm API tuỳ chỉnh {#them-api-tuy-chinh}

1. Bấm **+** cạnh **Accounts** và chọn **API tuỳ chỉnh**.
2. Chọn nhà cung cấp để điền sẵn base URL, hoặc tự nhập.
3. Dán API key. Điền **Model** và **Model nhanh** nếu hướng dẫn Claude Code của
   nhà cung cấp có ghi; để trống thì endpoint tự chọn.
4. Bấm **Lưu**. Endpoint hiện trong danh sách và trong menu tài khoản của mọi
   chat, như mọi tài khoản khác.

Muốn sửa, mở menu của dòng đó và chọn **Sửa endpoint…**. Để trống ô key thì
key đã lưu được giữ nguyên.

::: warning
Chỉ dùng endpoint bạn có quyền dùng: gói của chính nhà cung cấp, hoặc gateway
của công ty. Dịch vụ bán lại quyền truy cập tài khoản Claude của người khác vi
phạm điều khoản của Anthropic.
:::

## Chọn tài khoản cho một chat

Mỗi chat có menu **Account** trong khung soạn tin. Chọn tài khoản ở đó trước khi
gửi, chat sẽ chạy trên tài khoản đó.

## Gói còn lại bao nhiêu

Cạnh khung soạn tin có một thanh đo cho biết tài khoản đã dùng bao nhiêu hạn mức
5 giờ. Bấm vào để xem mọi hạn mức, kể cả hạn mức theo tuần.

![Plan usage: hạn mức 5 giờ đã dùng 19%, hạn mức 7 ngày đã dùng 40%, kèm thời điểm reset](/screenshots/plan-usage.png)
