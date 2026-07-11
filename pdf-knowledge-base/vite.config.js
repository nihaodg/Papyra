/**
 * PDF知识库 - Vite 构建配置
 * 负责 Vue 项目的开发和构建设置
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  // Vue 插件
  plugins: [vue()],

  // 使用相对路径（适配 Electron file:// 协议加载）
  base: './',

  // 构建配置
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 确保资源文件使用相对路径
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  // 开发服务器配置
  server: {
    port: 5173,
    strictPort: true,
    // 允许 Electron 主进程连接
    cors: true,
  },

  // 依赖优化（预构建 CommonJS 模块）
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },

  // 解析配置
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
