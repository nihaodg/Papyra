/**
 * PDF知识库 - 预加载脚本
 * 安全地向渲染进程暴露主进程 API
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 对话框
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  selectPdf: () => ipcRenderer.invoke('dialog:selectPdf'),

  // 文件系统
  listTree: (dirPath) => ipcRenderer.invoke('fs:listTree', dirPath),
  readPdfFile: (filePath) => ipcRenderer.invoke('fs:readPdfFile', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),

  // 文件操作
  createFolder: (parentPath, folderName) => ipcRenderer.invoke('fs:createFolder', parentPath, folderName),
  importAndExtract: (sourcePath, targetDir) => ipcRenderer.invoke('fs:importAndExtract', sourcePath, targetDir),
  rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  move: (srcPath, destDir) => ipcRenderer.invoke('fs:move', srcPath, destDir),
  delete: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),

  // 配置
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getAppDataPath: () => ipcRenderer.invoke('app:getPath'),
});
