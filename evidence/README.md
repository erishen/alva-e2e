# 缺陷证据目录（由测试运行产出，随仓库提交）
# D-1 守卫在 EV/市值 全为 $0.0 时自动生成两张截图（皆先切到 Comps Tab，再在跨域 iframe 内截取，
# 规避整页白屏与 display:none 截不到内容）：
#   comps-ev-mc-zero.png：主证据 —— .comps-grid 元素截图，EV/Market cap 两列已注入红框+浅红底高亮
#   comps-full.png：上下文证据 —— Comps 区块整段（抬高视口截取 iframe body，含区块标题/红框高亮/
#     顶部红色文字标注横幅「⚠ 缺陷证据：EV / Market cap 两列全部 = $0.0…」），证明是真实 AMD 页面
# 视频由 playwright.config.ts 的 video:'retain-on-failure' 自动留存于 test-results/，
#   但本组 serial+beforeAll 共享页面用例录制的是空白 fixture page，不可作证据；以截图为可靠证据
