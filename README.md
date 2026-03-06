# 22-Claw Projects 🌸

22 的小工具和项目集合

> _由 22 和 11 共同开发维护_

---

## 📦 项目列表

### [chatroom](./chatroom/) - 临时云聊天室 ✅

[📖 查看详细文档](./chatroom/README.md) | [🎉 项目总结](./chatroom/PROJECT_SUMMARY.md)

<details>
<summary>展开简介</summary>

轻量级临时聊天室，支持实时通讯和多媒体分享

- **技术栈**: Node.js + Express + WebSocket
- **特性**:
  - ⏱️ 临时房间（1-72 小时自动过期）
  - 🔒 密码保护
  - 👥 实时成员列表
  - 📸 图片分享（预览 + 弹窗）
  - 🎬 视频分享（缩略图 + 弹窗播放）
  - 🎵 音频分享（播放 + 下载）
  - 📎 文件分享（所有类型 + 下载）
  - 🏷️ @提及（高亮 + 双击成员）
  - 💬 回复消息（双击/左滑 + 点击跳转）
  - 🛡️ 管理员命令
  - 🔄 断线重连保护
  - 🔔 浏览器通知
  - 📝 Markdown + 代码高亮
  - 🎨 现代化 UI
- **部署**: 支持 Alpine Linux 小小鸡（64MB+ 内存）
- **状态**: ✅ 已完成，生产环境运行中
- **开发时间**: 6.5 小时
- **代码行数**: 2500+ 行

</details>

---

### [api-test-site](./api-test-site/) - 临时 API 测试站 ✅

[📖 查看详细文档](./api-test-site/README.md) | [☁️ Workers 版本](./api-test-site/workers/README.md) | [🐳 Docker 部署](./api-test-site/DOCKER.md)

<details>
<summary>展开简介</summary>

用于临时测试 OpenAI / Anthropic 风格接口的轻量网页工具。

- **技术栈**: Node.js + Express + 原生前端 + Cloudflare Workers
- **特性**:
  - 🔌 输入 `baseUrl` 与可选 `apiKey`
  - 🔍 自动探测 `/models`、`/chat/completions`、`/responses`、`/messages`
  - 🤖 支持 OpenAI 兼容 / Anthropic Messages / 自动识别
  - 💬 临时聊天测试界面
  - 🧪 调试信息与路径尝试展示
  - 🎨 明亮 / 暗色可切换界面
  - 🐳 支持 Docker 部署
  - ☁️ 支持 Cloudflare Workers 部署
  - 🛠️ 支持 OpenRC 自启动脚本
- **部署**: 适合 VPS、Docker、自托管，也适合 Workers 轻部署
- **状态**: ✅ 可用，持续优化中

</details>

---

### [proxy-manager](./proxy-manager/) - 代理管理脚本 🚧

[📋 查看规划文档](./proxy-manager/PLANNING.md)

<details>
<summary>展开简介</summary>

简单易用的 sing-box/xray 管理脚本，针对个人使用习惯定制

- **技术栈**: Shell + sing-box/xray
- **特性**:
  - 🎯 交互式菜单
  - 🔧 一键安装/配置
  - 👥 多用户管理
  - 📊 流量统计
  - 🔗 订阅链接生成
  - 🛡️ 安全增强
  - 💾 自动备份
- **部署**: 适合小鸡部署
- **状态**: 🚧 规划中，尚未开始开发
- **预计时间**: 10-15 天

</details>

---

## 🚀 快速开始

每个项目都有独立的 README 和部署说明，点击项目名称或文档链接查看详情。

## 💡 开发理念

- **轻量优先**: 针对低资源环境优化
- **开箱即用**: 最小化配置，快速部署
- **代码质量**: 模块化设计，易于维护
- **实用至上**: 解决实际问题，不过度设计
- **个性化**: 根据使用习惯定制

## 📊 项目统计

| 项目 | 状态 | 类型 | 部署方式 |
|------|------|------|----------|
| chatroom | ✅ 完成 | 实时聊天室 | Node / Docker / OpenRC |
| api-test-site | ✅ 可用 | API 测试站 | Node / Docker / Workers / OpenRC |
| proxy-manager | 🚧 规划中 | 代理管理脚本 | Shell |

## 📝 许可

各项目可能使用不同的开源许可，具体见各项目目录。

---

_最后更新: 2026-03-06_
