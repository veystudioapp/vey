# Chat

Một chat là một cuộc trò chuyện Claude Code, chạy trong thư mục của một project.
Bạn mở bao nhiêu chat cũng được, trên bao nhiêu project cũng được, và tất cả vẫn
chạy tiếp trong lúc bạn đọc thứ khác.

![Một chat: cột project và các chat bên trái, cuộc trò chuyện ở giữa, khung soạn tin ở dưới](/screenshots/chat.png)

## Mở chat mới

Bấm **+** trên hàng của project, hoặc chuột phải vào project và chọn **New chat
here**. Tab mở ra ngay; chat chỉ được lưu khi bạn gửi tin nhắn đầu tiên, nên một
tab không gõ gì sẽ không để lại dấu vết.

Chat được đặt tên theo câu hỏi đầu tiên, rồi đổi sang tiêu đề do chính Claude
Code đặt khi có. Chuột phải vào chat và chọn **Rename** để tự đặt tên — tên bạn
đặt sẽ không bao giờ bị thay.

## Khung soạn tin

Mọi thứ quyết định tin nhắn tiếp theo chạy thế nào nằm ở thanh dưới ô nhập:

- **Account** — chat chạy trên tài khoản Claude nào. Xem
  [Tài khoản Claude](/vi/docs/accounts).
- **Model** và **effort** — Haiku, Sonnet hay Opus, và mức suy nghĩ (Low đến
  Max). Cả hai đổi được giữa các tin nhắn mà không phải khởi động lại chat.
- **Quyền** — chat được tự làm những gì (xem dưới).
- **Context còn lại** — cuộc trò chuyện còn bao nhiêu chỗ trước khi bị nén, và
  thanh đo hạn mức 5 giờ của tài khoản.

![Menu model: Default (recommended), từng model Claude, và Inherit](/screenshots/chat-model-menu.png)

**Inherit** dùng đúng model mà `claude` của bạn đang đặt. Gắn sao cho model để
nó nằm gần đầu danh sách.

Nút **+** ở bên phải khung soạn tin chứa phần còn lại: **Attach file** (`⌘U`),
**Mention a file…** (`@`), **Run a command…** (`/`, các slash command của Claude
Code) và **MCP servers…**.

![Menu + của khung soạn tin: Attach file, Mention a file, Run a command, MCP servers](/screenshots/chat-add-menu.png)

Nhấn `Enter` để gửi, `Shift+Enter` để xuống dòng.

### Các chế độ quyền

| Chế độ          | Làm gì                                                             |
| --------------- | ------------------------------------------------------------------ |
| **Plan**        | Đọc và trả lời bằng một kế hoạch. Không thay đổi gì.               |
| **Read only**   | Đọc và trả lời. Không sửa file, không chạy shell.                  |
| **Ask**         | Hỏi đúng những gì `claude` CLI sẽ hỏi, theo cài đặt của chính bạn. |
| **Edits**       | Sửa file và chạy lệnh trong thư mục này. Mặc định.                 |
| **Full access** | Không hỏi gì cả, kể cả với công cụ Vey chưa liệt kê.               |

![Menu quyền: Plan, Read only, Ask, Edits và Full access](/screenshots/chat-permissions.png)

Khi chat cần bạn cho phép, một thẻ hiện phía trên khung soạn tin, ghi rõ lệnh nó
muốn chạy. Chat sẽ chờ — bao lâu cũng được — cho đến khi bạn đồng ý hoặc từ chối.
Đổi chế độ giữa chừng không tốn kém: cache của cuộc trò chuyện vẫn giữ nguyên.

### Nhắc tới file

Gõ `@` để chọn một file hoặc thư mục của project. Nhắc tới chỉ là đường dẫn, nên
Claude mở file đúng như hiện tại chứ không phải một bản sao.

![Gõ @ sẽ liệt kê thư mục và file của project, kèm số token ước tính của mỗi mục](/screenshots/chat-mention.png)

### Hình ảnh

Dán ảnh chụp màn hình hoặc kéo thả ảnh vào khung soạn tin. Ảnh được đính kèm
dưới dạng `[Image #1]` và hiện thumbnail cả trong khung soạn tin lẫn trong cuộc
trò chuyện.

### Trả lời một đoạn đã chọn

Bôi đen một phần câu trả lời, nút **Reply** sẽ hiện bên cạnh: nó trích đoạn đó
vào khung soạn tin để bạn hỏi đúng chỗ ấy.

## Khi chat đang chạy

- **Cứ gõ tiếp.** Tin nhắn gửi khi Claude còn đang làm sẽ xếp hàng sau lượt hiện
  tại, có nhãn **Queued** cho đến khi được xử lý.
- **Stop** dừng lượt hiện tại mà không đóng chat.
- Các subagent chạy nền được liệt kê trong chat khi đang chạy.

## Sửa một tin nhắn

Rê chuột lên tin nhắn của bạn và chọn **Edit**. Cuộc trò chuyện được cắt về ngay
trước tin nhắn đó, **và các file Claude đã sửa sau đó cũng được trả lại như
cũ**, rồi tin nhắn đã sửa được gửi đi. Dùng khi muốn đi hướng khác mà không phải
làm lại từ đầu.

## Tìm trong chat

- `⌘F` mở thanh tìm kiếm trên cuộc trò chuyện, tìm cả trong phần output công cụ
  đang thu gọn.
- Mục lục bên cạnh cuộc trò chuyện liệt kê mọi tin nhắn bạn đã gửi; bấm để nhảy
  tới.

![Thanh tìm kiếm trên chat, mọi chỗ khớp được tô sáng, 1 of 17](/screenshots/chat-find.png)

## MCP servers

Chat dùng các MCP server mà `claude` của bạn đã có cho thư mục đó —
`~/.claude.json`, `.mcp.json` của project, plugin và connector của claude.ai. Mở
**MCP servers…** trong menu **+** của khung soạn tin để xem, và tắt bất kỳ công cụ hay
cả server nào cho riêng chat này. Đổi danh sách đó sẽ mở một phiên mới phía sau;
cuộc trò chuyện vẫn tiếp tục.

## Biết khi nào chat cần bạn

Bạn không cần ngồi nhìn chat mới biết nó đang ở đâu:

- **Vòng xoay** trên hàng của chat khi đang chạy, và **chiếc khiên** khi nó dừng
  lại chờ câu trả lời. Project đang thu gọn sẽ hiện số đếm.
- **Một chấm và tiêu đề in đậm** trên chat đã trả lời trong lúc bạn đọc chat
  khác — tức là _chưa đọc_.
- **Thông báo** khi chat xong, lỗi hoặc cần hỏi gì trong lúc cửa sổ ở nền (tắt
  trong **Settings › Chats**).
- **Huy hiệu đỏ** trên icon ứng dụng ở Dock, đếm chat chưa đọc và chat đang chờ
  bạn.

## Chat trong cửa sổ riêng

Nút **Open in its own window** ở đầu chat tách nó ra cửa sổ riêng — tiện khi có
màn hình thứ hai. Cửa sổ tách ra có thể ghim nằm trên các cửa sổ khác.

## Xuất, xoá

Chuột phải vào chat để chọn **Copy as Markdown**, **Export as Markdown…**,
**Export as HTML…**, hoặc **Delete chat…**. Xoá chat sẽ xoá cuộc trò chuyện khỏi
Vey, không hoàn tác được; file của bạn không bị ảnh hưởng.

![Menu chuột phải của chat: Rename, Copy as Markdown, Export as Markdown, Export as HTML, Delete chat](/screenshots/chat-menu.png)

## Giới hạn và chat dài

Thanh đo cạnh khung soạn tin cho biết tài khoản đã dùng bao nhiêu hạn mức 5 giờ.
Khi hết, chat dừng lại cho đến khi hạn mức reset, giống như trong Claude Code.
Cuộc trò chuyện quá dài sẽ được Claude Code tự động nén lại.
