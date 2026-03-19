# singbox-issues.md

## 2026-03-05

### Missing source dependency in `clawd/singbox_config_generator.sh`
- 症状：脚本 `source "$(dirname "$0")/../lib/common.sh"`，但仓库内没有 `lib/common.sh`。
- 影响：无法直接运行脚本/复现与验证“日志输出改进”等后续功能。
- 建议：
  - 确认真实路径（可能是 `clawd/lib/common.sh` 或 `./lib/common.sh`），或把依赖文件补齐到仓库。
  - 若脚本实际运行环境在别处（例如另一仓库/服务器），需要把那套 `lib/` 同步进来，避免本地开发断链。
