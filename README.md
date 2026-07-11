# Papyra - PDF 知识库

Typora 极简风格的桌面 PDF 知识库阅读器，基于 Electron + Vue 3 + PDF.js 构建。

## 特性

- **树形文件管理**：嵌套文件夹、展开/折叠、树形引导线、拖拽自由排序
- **连续滚动阅读**：PDF 连续滚动渲染，支持键盘翻页（↑↓ PageUp PageDown Home End）
- **缩放控制**：`Ctrl +` / `Ctrl -` / `Ctrl 0` 缩放，支持鼠标滚轮
- **ZIP 批量导入**：拖入或导入 ZIP 文件自动解压到知识库
- **拖拽排序**：PDF 和文件夹可自由拖入任意目录、调整顺序
- **右键菜单**：重命名、导入 PDF/ZIP、删除
- **阅读进度记忆**：自动保存每个 PDF 的滚动位置
- **纯离线**：所有数据存储在本地，配置保存在 `%APPDATA%/pdf-knowledge-base`

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 28 | 桌面容器 |
| Vue 3 (CDN) | UI 框架 |
| PDF.js 3.11 | PDF 渲染引擎 |
| Vite 5 | 前端构建 |
| adm-zip | ZIP 解压 |
| electron-builder | 打包 NSIS 安装包 |

## 开发

```bash
# 安装依赖
npm install

# 开发模式（Vite + Electron）
npm start

# 仅前端开发
npm run dev

# 构建打包
npm run electron:build
```

## 快捷键

| 按键 | 功能 |
|------|------|
| Ctrl + / Ctrl - / Ctrl 0 | 缩放 |
| ↑ / ↓ | 上下滚动 |
| PageUp / PageDown | 翻页 |
| Home / End | 文档首/尾 |

## 项目结构

```
pdf-knowledge-base/
├── electron-main.js   # Electron 主进程（IPC 处理、文件操作）
├── preload.js         # 安全桥接（contextBridge 暴露 API）
├── src/
│   ├── App.vue        # 主界面组件（全部 UI + 业务逻辑）
│   └── main.js        # Vue 入口
├── index.html         # HTML 模板
├── vite.config.js     # Vite 配置
├── package.json       # 依赖与打包配置
├── start.bat          # Windows 快速启动脚本
└── release/           # 构建产物
```

## License

MIT
