.PHONY: help install test test-smoke test-ui test-headed debug report codegen typecheck clean

help:
	@echo "可用命令:"
	@echo "  make install      - 安装依赖与 Chromium"
	@echo "  make test         - 运行全部测试（直连 alva.ai，无需本地服务）"
	@echo "  make test-smoke   - 只跑 @smoke 冒烟用例"
	@echo "  make test-ui      - UI 模式运行测试"
	@echo "  make test-headed  - 有头模式运行测试"
	@echo "  make debug        - 调试模式运行测试"
	@echo "  make report       - 显示 HTML 测试报告"
	@echo "  make codegen      - 打开 Playwright 代码生成器"
	@echo "  make typecheck    - TypeScript 类型检查"
	@echo "  make clean        - 清理测试结果和报告"
	@echo ""
	@echo "说明:"
	@echo "  被测对象是线上站点 https://alva.ai，不需要启动本地服务。"
	@echo "  可用环境变量覆盖: BASE_URL / PLAYBOOK_PATH"

install:
	npm install
	npx playwright install chromium

test:
	npm test

test-smoke:
	npm run test:smoke

test-ui:
	npm run test:ui

test-headed:
	npm run test:headed

debug:
	npm run test:debug

report:
	npm run report

codegen:
	npm run codegen

typecheck:
	npm run typecheck

clean:
	rm -rf test-results
	rm -rf playwright-report
