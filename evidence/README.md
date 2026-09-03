# 缺陷证据目录（由测试运行产出，随仓库提交）
# comps-ev-mc-zero.png：D-1 守卫在 EV/市值 全为 $0.0 时自动截取的「可比表（.comps-grid）元素」截图
#   —— 先切到 Comps Tab 再截 iframe 内该元素，规避跨域整页留白与 display:none 截不到内容
# 视频由 playwright.config.ts 的 video:'retain-on-failure' 自动留存于 test-results/，
#   但本组 serial+beforeAll 共享页面用例录制的是空白 fixture page，不可作证据；以截图为可靠证据
