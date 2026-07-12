/**
 * PDF知识库 - Electron 主进程
 * 窗口管理 + IPC通信 + 文件系统操作 + 配置管理
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

// ==================== 配置管理 ====================

const configPath = path.join(app.getPath('userData'), 'config.json');

const defaultConfig = {
  lastFolder: '',
  lastPdf: '',
  readingProgress: {},
  scrollPositions: {},
  directoryOrder: {}, // { "目录路径": ["文件名.pdf", "子文件夹/", ...] }
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    }
  } catch (err) { console.error('[Config] 加载失败:', err.message); }
  return { ...defaultConfig };
}

function saveConfig(config) {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) { console.error('[Config] 保存失败:', err.message); return false; }
}

// ==================== 窗口管理 ====================

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'PDF知识库', backgroundColor: '#ffffff', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ==================== 文件系统辅助 ====================

/** 列出目录的直接子项（文件夹+PDF文件），按配置顺序排序 */
function listDirectory(dirPath, configOrder) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const e of entries) {
    if (e.isDirectory()) {
      folders.push({ name: e.name, type: 'folder', path: path.join(dirPath, e.name) });
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
      files.push({ name: e.name, type: 'file', path: path.join(dirPath, e.name) });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  // 应用自定义排序（路径统一用 / 避免 Windows \ 不匹配）
  const dirKey = (dirPath || '').replace(/\\/g, '/');
  const order = configOrder[dirKey] || [];
  const ordered = [];

  for (const key of order) {
    const inFolders = folders.findIndex(f => f.name === key);
    const inFiles = files.findIndex(f => f.name === key);
    if (inFolders >= 0) { ordered.push(folders[inFolders]); folders.splice(inFolders, 1); }
    else if (inFiles >= 0) { ordered.push(files[inFiles]); files.splice(inFiles, 1); }
  }

  return [...ordered, ...folders, ...files];
}

// ==================== IPC 处理器 ====================

function registerIpcHandlers() {

  // ---- 对话框 ----

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'], title: '选择知识库根目录', buttonLabel: '选择文件夹',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectPdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF / ZIP 文件', extensions: ['pdf', 'zip'] }],
      title: '选择要导入的PDF或ZIP文件',
    });
    return result.canceled ? [] : result.filePaths;
  });

  // ---- 文件操作 ----

  ipcMain.handle('fs:listTree', (_event, dirPath) => {
    try {
      const config = loadConfig();
      return listDirectory(dirPath, config.directoryOrder);
    } catch (err) { console.error('[FS] listTree失败:', err.message); return []; }
  });

  ipcMain.handle('fs:readPdfFile', (_event, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (err) { console.error('[FS] readPdf失败:', err.message); return null; }
  });

  ipcMain.handle('fs:fileExists', (_event, filePath) => {
    try { return fs.existsSync(filePath); } catch { return false; }
  });

  ipcMain.handle('fs:createFolder', (_event, parentPath, folderName) => {
    try {
      const fullPath = path.join(parentPath, folderName);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath);
        return { success: true, path: fullPath };
      }
      return { success: false, error: '文件夹已存在' };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('fs:importPdf', (_event, sourcePath, targetDir) => {
    try {
      const fileName = path.basename(sourcePath);
      let targetPath = path.join(targetDir, fileName);

      // 重名处理：自动加序号
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        targetPath = path.join(targetDir, `${base} (${counter})${ext}`);
        counter++;
      }

      fs.copyFileSync(sourcePath, targetPath);
      return { success: true, path: targetPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('fs:rename', (_event, oldPath, newName) => {
    try {
      const newPath = path.join(path.dirname(oldPath), newName);
      if (fs.existsSync(newPath)) return { success: false, error: '同名文件已存在' };
      fs.renameSync(oldPath, newPath);
      return { success: true, path: newPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('fs:move', (_event, srcPath, destDir) => {
    try {
      const name = path.basename(srcPath);
      let destPath = path.join(destDir, name);
      // 重名处理
      let counter = 1;
      while (fs.existsSync(destPath)) {
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        destPath = path.join(destDir, `${base} (${counter})${ext}`);
        counter++;
      }
      fs.renameSync(srcPath, destPath);
      return { success: true, path: destPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('fs:importAndExtract', (_event, sourcePath, targetDir) => {
    try {
      const ext = path.extname(sourcePath).toLowerCase();

      if (ext === '.zip') {
        // 解压 ZIP 到以文件名命名的子文件夹
        const zipName = path.basename(sourcePath, '.zip');
        const extractDir = path.join(targetDir, zipName);

        // 处理重名
        let finalDir = extractDir;
        let counter = 1;
        while (fs.existsSync(finalDir)) {
          finalDir = path.join(targetDir, `${zipName} (${counter})`);
          counter++;
        }

        const zip = new AdmZip(sourcePath);
        // 检查 ZIP 内是否有顶层文件夹
        const entries = zip.getEntries();
        const topLevelNames = new Set();
        for (const entry of entries) {
          const topName = entry.entryName.split('/')[0].split('\\')[0];
          if (topName) topLevelNames.add(topName);
        }

        if (topLevelNames.size === 1) {
          // 只有一个顶层目录：直接解压并把内容提到合适层级
          const singleTopDir = [...topLevelNames][0];
          const tempDir = path.join(targetDir, '_temp_extract_' + Date.now());
          zip.extractAllTo(tempDir, true);
          const singleDirPath = path.join(tempDir, singleTopDir);
          if (fs.existsSync(singleDirPath) && fs.statSync(singleDirPath).isDirectory()) {
            // 如果 ZIP 内容就在这个目录下，将它重命名为目标目录名
            if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true });
            fs.renameSync(singleDirPath, finalDir);
            // 清理临时目录
            if (fs.readdirSync(tempDir).length === 0) fs.rmdirSync(tempDir);
            else fs.rmSync(tempDir, { recursive: true, force: true });
          } else {
            // 否则把整个临时目录内容移过去
            if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true });
            fs.renameSync(tempDir, finalDir);
          }
        } else {
          // 多个顶层文件/目录：解压到新建的文件夹
          zip.extractAllTo(finalDir, true);
        }

        return { success: true, path: finalDir };
      } else {
        // PDF 文件：直接复制
        const fileName = path.basename(sourcePath);
        let destPath = path.join(targetDir, fileName);
        let counter = 1;
        while (fs.existsSync(destPath)) {
          const fileExt = path.extname(fileName);
          const base = path.basename(fileName, fileExt);
          destPath = path.join(targetDir, `${base} (${counter})${fileExt}`);
          counter++;
        }
        fs.copyFileSync(sourcePath, destPath);
        return { success: true, path: destPath };
      }
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('fs:delete', (_event, targetPath) => {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  // ---- 配置 ----

  ipcMain.handle('config:load', () => loadConfig());
  ipcMain.handle('config:save', (_event, config) => saveConfig(config));
  ipcMain.handle('app:getPath', () => app.getPath('userData'));
}

// ==================== 生命周期 ====================

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
