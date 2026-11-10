import type { Messages } from "../en"

export const bots: Messages["bots"] = {
  button: "Bot",
  tab: "Bot",
  tabIn: "Bot · {folder}",
  goneTitle: "Dự án này đã rời khỏi workspace",
  goneDetail:
    "Các bot của nó vẫn còn trên đĩa, tạm dừng, và quay lại cùng dự án.",
  header: {
    caption: "Mỗi lần chạy mở một chat trong dự án này. Chỉ khi Vey đang mở.",
    new: "Bot mới",
  },
  empty: {
    title: "Chưa có bot nào",
    detail:
      "Bot gửi một prompt bạn viết sẵn vào một chat mới theo lịch — brief trước giờ làm, đọc trước các PR cần review. Chat của nó chạy bằng claude của chính bạn, với tài khoản, MCP server và file của bạn, chỉ khi Vey đang mở; một lần bị lỡ lúc máy ngủ sẽ chạy bù một lần khi máy thức.",
    startFrom: "Bắt đầu từ",
    blank: "Bot trống",
  },
  templates: {
    brief: {
      name: "Brief buổi sáng",
      detail: "Task hôm nay trên tracker, đối chiếu với các branch ở đây.",
    },
    reviews: {
      name: "PR đang chờ tôi review",
      detail: "Các pull request nhờ bạn review, được đọc trước giúp bạn.",
    },
    standup: {
      name: "Ghi chú standup",
      detail: "Những gì bạn đã commit từ ngày làm việc trước.",
    },
  },
  card: {
    paused: "Tạm dừng",
    next: "Lần tới {when}",
    noNext: "Không bao giờ — chưa chọn ngày",
    runNow: "Chạy ngay",
    enabled: "Chạy theo lịch",
    menu: "Bot",
    edit: "Sửa…",
    delete: "Xoá…",
    noRuns: "Chưa chạy lần nào.",
    goneChat: "chat đã xoá",
  },
  schedule: {
    daily: "{days} lúc {time}",
    every: "Mỗi {hours} giờ · {days}",
    every_one: "Mỗi giờ · {days}",
    everyDay: "mỗi ngày",
    weekdays: "ngày thường",
    weekends: "cuối tuần",
  },
  run: {
    running: "Đang chạy",
    reported: "Có báo cáo",
    quiet: "Không có gì mới",
    failed: "Lỗi",
    skipped: "Bỏ qua",
    manual: "chạy tay",
    catchUp: "chạy bù",
  },
  form: {
    newTitle: "Bot mới",
    editTitle: "Sửa bot",
    name: "Tên",
    prompt: "Prompt",
    promptHint:
      "Được gửi nguyên văn vào một chat mới mỗi lần chạy. Viết như khi bạn hỏi trong chat.",
    when: "Khi nào",
    daily: "Vào một giờ cố định",
    every: "Mỗi vài giờ",
    hours: "{count} giờ",
    hours_one: "Mỗi giờ",
    days: "Ngày",
    checkout: "Chạy trong",
    account: "Tài khoản",
    defaultAccount: "Tài khoản mặc định",
    model: "Model",
    permission: "Quyền",
    quiet: "Im lặng khi không có gì để báo",
    quietHint:
      "Lần chạy được dặn kết thúc bằng NOTHING_TO_REPORT khi không có gì cần bạn; lần chạy đó không bị đánh dấu chưa đọc và không có thông báo.",
    enabled: "Chạy theo lịch",
    cancel: "Huỷ",
    save: "Lưu",
    saving: "Đang lưu…",
  },
  delete: {
    title: "Xoá {name}?",
    detail: "Các chat mà bot đã mở vẫn ở lại trong dự án.",
    confirm: "Xoá",
  },
}
