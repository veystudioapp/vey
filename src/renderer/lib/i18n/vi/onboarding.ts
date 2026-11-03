import type { Messages } from "../en"

export const onboarding: Messages["onboarding"] = {
  language: "Ngôn ngữ",
  lookingForClaude: "Đang tìm Claude Code…",
  setup: {
    pageInstall: "Cài đặt",
    pageSignIn: "Đăng nhập",
    pageWelcome: "Chào mừng",
    installedTitle: "Đã cài Claude Code",
    installedDetail:
      "{claude} {version} — mọi chat ở đây chạy trên nó, ngay trong thư mục của dự án.",
    signedInTitle: "Bạn đã đăng nhập",
    signedInDetail: "Chat chạy dưới một trong các hồ sơ Claude của bạn.",
    checkingSignIn: "Đang kiểm tra đăng nhập…",
    signIn: "Đăng nhập",
    getStarted: "Bắt đầu",
    skipInstall: "Đã cài rồi? Tiếp tục mà không kiểm tra",
    skipSignIn: "Tiếp tục mà không đăng nhập",
    checkAgain: "Kiểm tra lại",
    accountsChip: "3 tài khoản",
    installTitle: "Cài Claude Code",
    installBody:
      "Chat chạy trên Claude Code CLI, mà máy này chưa có. Chạy lệnh này trong {shell}, rồi bấm Kiểm tra lại.",
    installElsewhere:
      "Đã cài ở chỗ khác? Đặt {env} thành đường dẫn của nó rồi khởi động lại. Xem thêm trong {guide}.",
    setupGuide: "hướng dẫn cài đặt",
    signInTitle: "Đăng nhập Claude",
    signInBody:
      "Đã cài {claude}. Đăng nhập một lần, bằng gói Claude hoặc tài khoản Console, và mọi chat sẽ chạy dưới tài khoản đó.",
    signInMore:
      "Bạn có thể thêm tài khoản khác sau, ở mục Tài khoản cuối cột chat.",
    welcomeTitle: "Chào mừng đến với Vey",
    welcomeBody: "Mọi thứ đã sẵn sàng. Tiếp theo là một vòng giới thiệu ngắn.",
    accountsTitle: "Mọi tài khoản Claude của bạn",
    accountsDetail:
      "Đăng nhập bao nhiêu tài khoản tùy ý, mỗi tài khoản đều thấy được khung năm giờ của nó.",
    switchTitle: "Đổi tài khoản không phải làm lại",
    switchDetail:
      "Chat chạm giới hạn sẽ tiếp tục trên tài khoản khác, giữ nguyên cả cuộc trò chuyện.",
    copyCommand: "Sao chép lệnh",
  },
  tour: {
    progress: "{index} / {total}",
    skip: "Bỏ qua",
    projectsTitle: "Dự án của bạn",
    projectsBody:
      "Mỗi thư mục trong workspace là một biểu tượng. Chọn một cái thì cột bên cạnh liệt kê các chat của nó; chọn lại để ẩn cột. Con số trên biểu tượng là số chat đang chờ bạn, vòng xoay là chat đang chạy.",
    paletteTitle: "Chạy lệnh",
    paletteBody:
      "{shortcut} mở bảng lệnh: đi tới một file hay một chat theo tên, hoặc chạy bất cứ thao tác nào studio làm được.",
    composerTitle: "Nhiều chat song song",
    composerBody:
      "Mỗi chat là một cuộc trò chuyện với claude trong thư mục của một dự án. Nhiều chat có thể chạy cùng lúc, và dòng trong cột cho biết chat nào đang trả lời, chat nào đang chờ bạn.",
    accountsTitle: "Tài khoản của bạn",
    accountsBody:
      "Mọi tài khoản Claude bạn đăng nhập, cùng mức đã dùng trong khung năm giờ. Nút + để thêm tài khoản. Chat bị dừng vì giới hạn sẽ đề nghị tiếp tục trên tài khoản còn trống.",
    explorerTitle: "Explorer",
    explorerBody:
      "Mọi file trong thư mục làm việc, và trong tab Git: những gì đã đổi từ commit gần nhất cùng các commit trước đó.",
  },
}
