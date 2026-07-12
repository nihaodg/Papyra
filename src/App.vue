<template>
  <div class="app">
    <!-- ==================== 工具栏 ==================== -->
    <header class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-icon-only" @click="sidebarCollapsed = !sidebarCollapsed" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
          &#9776;
        </button>
        <button class="btn btn-primary" @click="openFolder">&#128193; 打开文件夹</button>
        <span class="folder-path" :title="folderPath" @click="openFolder">{{ folderPath || '选择知识库根目录' }}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-mode" @click="toggleMode" :title="editMode ? '切换到阅读模式' : '切换到编辑模式'">
          {{ editMode ? '&#128214; 阅读模式' : '&#9998; 编辑模式' }}
        </button>
        <span v-if="folderPath" class="stat">共 {{ totalPdfCount }} 个PDF</span>
        <span v-if="currentPage > 0" class="stat">第 {{ currentPage }} / {{ totalPages }} 页</span>
      </div>
    </header>

    <div class="main" @click="closeMenus">
      <!-- ==================== 左侧树状侧边栏 ==================== -->
      <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }" @click.stop>
        <div v-if="!sidebarCollapsed" class="sidebar-body">
          <!-- 侧边栏头部 -->
          <div class="sidebar-header">
            <h3>文件列表</h3>
            <div class="sidebar-actions" ref="addBtnRef">
              <button class="icon-btn" @click.stop="refreshTree" title="刷新文件列表">
                <span>&#8635;</span>
              </button>
              <button class="icon-btn" @click.stop="toggleAddMenu" title="新建">
                <span class="plus-icon">+</span>
              </button>
            </div>
          </div>

          <!-- 新建菜单弹出（position:fixed 避免被 overflow:hidden 裁剪） -->
          <div v-if="addMenuVisible" class="popup-menu add-popup-fixed" :style="addMenuStyle" @click.stop>
            <div class="popup-item" @click="startCreateFolderInput">&#128193; 新建文件夹</div>
            <div class="popup-item" @click="importPdfFile">&#128196; 导入PDF</div>
          </div>

          <!-- 新建文件夹内联输入 -->
          <div v-if="creatingFolder" class="create-folder-bar">
            <input
              v-model="newFolderName"
              placeholder="文件夹名称"
              class="folder-name-input"
              @keyup.enter="confirmCreateFolder"
              @keyup.escape="cancelCreateFolder"
              ref="folderInputRef"
            />
            <button class="btn btn-sm" @click="confirmCreateFolder">确定</button>
            <button class="btn btn-sm" @click="cancelCreateFolder">取消</button>
          </div>

          <!-- 文件树 -->
          <ul v-if="folderPath" class="tree-list">
            <li v-if="flatTree.length === 0" class="tree-empty">空目录</li>
            <li
              v-for="node in flatTree"
              :key="node.path"
              :class="{
                'tree-item': true,
                active: currentPdfPath === node.path,
                folder: node.type === 'folder',
                'drag-over-before': dragIndicator === node.path + ':before',
                'drag-over-after': dragIndicator === node.path + ':after',
                'drag-over-inside': dragIndicator === node.path + ':inside',
              }"
              :style="{ paddingLeft: (node._depth * 20 + 8) + 'px' }"
              :draggable="true"
              @click="node.type === 'folder' ? toggleFolder(node) : selectPdfFile(node)"
              @contextmenu.prevent.stop="onContextMenu($event, node)"
              @dragstart="onDragStart($event, node)"
              @dragover.prevent="onDragOver($event, node)"
              @dragleave="onDragLeave($event, node)"
              @drop.prevent="onDrop($event, node)"
              @dragend="onDragEnd"
            >
              <!-- 树形引导线 -->
              <span v-if="node._depth > 0" class="tree-lines">
                <span
                  v-for="d in node._depth"
                  :key="d"
                  class="tree-line"
                  :class="{
                    'line-vertical': d < node._depth || !node._isLast,
                    'line-corner': d === node._depth
                  }"
                  :style="{ left: ((d - 1) * 20 + 4) + 'px' }"
                ></span>
              </span>

              <!-- 展开/折叠箭头 -->
              <span v-if="node.type === 'folder'" class="tree-arrow">{{ node.expanded ? '&#9662;' : '&#9656;' }}</span>
              <span v-else class="tree-arrow-placeholder"></span>

              <!-- 图标 -->
              <span class="tree-icon">{{ node.type === 'folder' ? (node.expanded ? '&#128194;' : '&#128193;') : '&#128196;' }}</span>

              <!-- 名称 / 重命名输入框 -->
              <input
                v-if="renamingPath === node.path"
                v-model="renameValue"
                class="rename-input"
                @blur="confirmRename(node)"
                @keyup.enter="confirmRename(node)"
                @keyup.escape="cancelRename"
                @click.stop
                ref="renameInputRef"
              />
              <span v-else class="tree-name">{{ node.name }}</span>

              <!-- ⋯ 更多操作按钮 -->
              <span v-if="hoveredPath === node.path || contextMenu.node?.path === node.path"
                    class="tree-more" @click.stop="onContextMenu($event, node)">&#8943;</span>
            </li>
          </ul>
          <div v-else class="sidebar-empty">请选择知识库根目录</div>
        </div>
      </aside>

      <!-- 上下文菜单 -->
      <div
        v-if="contextMenu.visible"
        class="popup-menu context-popup"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
        <div class="popup-item" @click="startRename(contextMenu.node)">&#9998; 重命名</div>
        <div v-if="contextMenu.node?.type === 'folder'" class="popup-item" @click="importIntoFolder(contextMenu.node)">&#128196; 导入PDF/ZIP</div>
        <div v-if="contextMenu.node?.type === 'folder'" class="popup-item" @click="startCreateFolderIn(contextMenu.node)">&#128193; 新建文件夹</div>
        <div class="popup-item danger" @click="deleteItem(contextMenu.node)">&#128465; 删除</div>
      </div>

      <!-- ==================== 右侧PDF阅读区 ==================== -->
      <main class="reader" ref="readerRef" @scroll="onReaderScroll">
        <!-- 空状态 -->
        <div v-if="!currentFileName" class="empty-state">
          <div class="empty-icon">&#128214;</div>
          <p>{{ folderPath ? '从左侧选择一个PDF开始阅读' : '打开文件夹即可开始' }}</p>
          <div class="shortcut-hints">
            <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> 滚动</span>
            <span><kbd>PgUp</kbd><kbd>PgDn</kbd> 翻页</span>
            <span><kbd>Ctrl</kbd><kbd>+</kbd><kbd>-</kbd> 缩放</span>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-else-if="loading" class="loading">
          <div class="spinner"></div>
          <p>正在加载 PDF ...</p>
        </div>

        <!-- PDF连续滚动 -->
        <div v-else class="pdf-container" ref="pdfContainerRef">
          <div v-for="n in totalPages" :key="n" class="pdf-page" :data-page="n">
            <div style="position: relative; display: inline-block;">
              <canvas></canvas>
              <div class="text-layer" :data-text-page="n"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, reactive, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const SCROLL_SAVE_DELAY = 500;
const SCALE_STEP = 0.1;
const SCALE_MIN = 0.5;
const SCALE_MAX = 3.0;

export default defineComponent({
  name: 'PdfKnowledgeBase',

  setup() {
    // ========== DOM引用 ==========
    const readerRef = ref(null);
    const pdfContainerRef = ref(null);
    const renameInputRef = ref(null);
    const addBtnRef = ref(null);
    const folderInputRef = ref(null);

    // ========== 应用状态 ==========
    const folderPath = ref('');
    const sidebarCollapsed = ref(false);
    const totalPages = ref(0);
    const currentPage = ref(0);
    const loading = ref(false);
    const currentFileName = ref('');
    const currentPdfPath = ref('');
    const currentPdfDir = ref('');
    const userScale = ref(null); // 用户手动设置的缩放比例，null表示自动
    const editMode = ref(false); // 阅读模式 / 编辑模式

    // ========== 树状侧边栏状态 ==========
    const treeData = ref([]);
    const hoveredPath = ref('');
    const addMenuVisible = ref(false);
    const addMenuStyle = reactive({ top: '0px', left: '0px' });
    const renamingPath = ref('');
    const renameValue = ref('');
    // 新建文件夹内联输入
    const creatingFolder = ref(false);
    const newFolderName = ref('');
    const currentCreateParent = ref(null); // 右键菜单创建子文件夹时的目标父节点

    // 拖拽状态
    let dragNode = null;
    const dragIndicator = ref('');

    // 上下文菜单
    const contextMenu = reactive({ visible: false, x: 0, y: 0, node: null });

    // ========== 配置 ==========
    let config = {
      lastFolder: '', lastPdf: '',
      readingProgress: {}, scrollPositions: {},
      directoryOrder: {},
    };

    // PDF渲染
    let pdfDocument = null;
    let scrollTimer = null;
    let observer = null;

    // ========== 计算属性 ==========

    /** 将树结构展开为扁平列表（带层级和最后子节点标记） */
    const flatTree = computed(() => {
      const result = [];
      function flatten(nodes, depth, ancestorsLast) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const isLast = i === nodes.length - 1;
          node._depth = depth;
          node._isLast = isLast;
          node._ancestorsLast = [...ancestorsLast, isLast];
          result.push(node);
          if (node.type === 'folder' && node.expanded && node._children) {
            flatten(node._children, depth + 1, [...ancestorsLast, isLast]);
          }
        }
      }
      flatten(treeData.value, 0, []);
      return result;
    });

    /** 计算PDF总数（通过递归遍历树） */
    const totalPdfCount = computed(() => {
      let count = 0;
      function countFiles(nodes) {
        for (const node of nodes) {
          if (node.type === 'file') count++;
          if (node.type === 'folder' && node._children) countFiles(node._children);
        }
      }
      countFiles(treeData.value);
      return count;
    });

    // ========== 工具函数 ==========

    function getCanvas(pageNum) {
      return document.querySelector(`.pdf-page[data-page="${pageNum}"] canvas`);
    }

    function getScale() {
      if (userScale.value != null) return userScale.value;
      const w = readerRef.value?.clientWidth || 800;
      return Math.max(1.0, (w - 80) / 595);
    }

    /** 路径分隔符统一为 / */
    function normalizePath(p) {
      return (p || '').replace(/\\/g, '/');
    }

    // ========== 配置管理 ==========

    async function loadConfig() {
      try {
        const saved = await window.electronAPI.loadConfig();
        if (saved) config = { ...config, ...saved };
      } catch (e) { /* ignore */ }
    }

    function saveConfigToDisk() {
      window.electronAPI.saveConfig(config).catch(e => {});
    }

    // ========== 菜单管理 ==========

    function closeMenus() {
      contextMenu.visible = false;
      addMenuVisible.value = false;
    }

    function toggleMode() {
      editMode.value = !editMode.value;
      if (currentPdfPath.value) reRenderAll();
    }

    function toggleAddMenu() {
      if (addMenuVisible.value) {
        addMenuVisible.value = false;
        return;
      }
      const btn = addBtnRef.value;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        addMenuStyle.top = (rect.bottom + 4) + 'px';
        addMenuStyle.left = (rect.right - 160) + 'px';
      }
      addMenuVisible.value = true;
      contextMenu.visible = false;
    }

    function onContextMenu(e, node) {
      contextMenu.visible = true;
      contextMenu.x = e.clientX;
      contextMenu.y = e.clientY;
      contextMenu.node = node;
      addMenuVisible.value = false;
    }

    // ========== 文件夹操作 ==========

    async function openFolder() {
      const folder = await window.electronAPI.openFolder();
      if (!folder) return;
      folderPath.value = folder;
      config.lastFolder = folder;
      saveConfigToDisk();
      await loadTree();
      if (config.lastPdf) {
        const target = findNodeByPath(treeData.value, config.lastPdf);
        if (target) await selectPdfFile(target);
      }
    }

    /** 递归查找节点 */
    function findNodeByPath(nodes, targetPath) {
      for (const node of nodes) {
        if (node.path === targetPath) return node;
        if (node.type === 'folder' && node._children) {
          const found = findNodeByPath(node._children, targetPath);
          if (found) return found;
        }
      }
      return null;
    }

    /** 加载根目录的树数据 */
    async function loadTree() {
      if (!folderPath.value) return;
      try {
        treeData.value = await window.electronAPI.listTree(folderPath.value);
        // 巩固深度信息
        for (const n of treeData.value) n._depth = 0;
      } catch (e) { treeData.value = []; }
    }

    /** 展开/折叠文件夹（按需加载子项） */
    async function toggleFolder(node) {
      if (node.type !== 'folder') return;

      if (!node.expanded) {
        // 展开：如果还没加载子项，异步加载
        if (!node._children) {
          node._loading = true;
          try {
            node._children = await window.electronAPI.listTree(node.path);
          } catch (e) { node._children = []; }
          node._loading = false;
        }
        node.expanded = true;
      } else {
        node.expanded = false;
      }
    }

    /** 展开到指定节点所在路径 */
    async function expandToNode(targetPath) {
      const parts = targetPath.replace(folderPath.value, '').split(/[\\/]/).filter(Boolean);
      let currentNodes = treeData.value;
      let currentPath = folderPath.value;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        currentPath = currentPath + '/' + folderName;
        const folder = currentNodes.find(n => n.type === 'folder' && n.name === folderName);
        if (!folder) break;
        if (!folder._children) {
          folder._children = await window.electronAPI.listTree(folder.path);
        }
        folder.expanded = true;
        currentNodes = folder._children;
      }
    }

    // ========== 文件操作 ==========

    /** 简化版：获取节点所属的兄弟列表 */
    function getSiblingsForNode(targetNode) {
      const targetPath = normalizePath(targetNode.path);
      // 根目录的直接子项
      if (normalizePath(folderPath.value) === normalizePath(pathDirname(targetPath))) {
        return treeData.value;
      }

      // 递归查找父文件夹节点
      function findParent(nodes, childPath) {
        for (const n of nodes) {
          const nPath = normalizePath(n.path);
          // 如果n是文件夹且有children，检查children中是否有匹配的
          if (n.type === 'folder' && n._children) {
            if (n._children.some(c => normalizePath(c.path) === childPath)) {
              return n;
            }
            const found = findParent(n._children, childPath);
            if (found) return found;
          }
        }
        return null;
      }

      const parent = findParent(treeData.value, targetPath);
      return parent?._children || [];
    }

    /** path.dirname 的浏览器实现 */
    function pathDirname(p) {
      const normalized = normalizePath(p);
      const idx = normalized.lastIndexOf('/');
      return idx > 0 ? normalized.substring(0, idx) : normalized;
    }

    /** 刷新指定父目录下的树 */
    async function refreshTree(parentPath) {
      if (!parentPath || parentPath === folderPath.value) {
        await loadTree();
        return;
      }

      function findAndRefresh(nodes) {
        for (const node of nodes) {
          if (node.type === 'folder' && node.expanded && node._children) {
            const child = node._children.find(c => c.path === parentPath);
            if (child && child.type === 'folder') {
              // 异步加载但不阻塞
              window.electronAPI.listTree(parentPath).then(children => {
                child._children = children;
              });
              return true;
            }
            if (findAndRefresh(node._children)) return true;
          }
        }
        return false;
      }

      // 处理根级别
      if (treeData.value.some(n => n.path === parentPath)) {
        // 是根目录的直接子项
        // 递归到全部展开节点去更新
      }

      findAndRefresh(treeData.value);
      await loadTree();
    }

    // ========== 新建文件夹 ==========

    function startCreateFolderInput() {
      currentCreateParent.value = null;
      addMenuVisible.value = false;
      contextMenu.visible = false;
      creatingFolder.value = true;
      newFolderName.value = '新建文件夹';
      nextTick(() => {
        const input = document.querySelector('.folder-name-input');
        if (input) { input.focus(); input.select(); }
      });
    }

    function startCreateFolderIn(folderNode) {
      contextMenu.visible = false;
      currentCreateParent.value = folderNode;
      creatingFolder.value = true;
      newFolderName.value = '新建文件夹';
      nextTick(() => {
        const input = document.querySelector('.folder-name-input');
        if (input) { input.focus(); input.select(); }
      });
    }

    async function confirmCreateFolder() {
      const name = newFolderName.value.trim();
      creatingFolder.value = false;
      if (!name) return;

      let targetDir = currentCreateParent.value ? currentCreateParent.value.path : folderPath.value;
      if (!currentCreateParent.value && currentPdfDir.value) targetDir = currentPdfDir.value;

      const result = await window.electronAPI.createFolder(targetDir, name);
      if (result.success) {
        await loadTree();
        if (currentCreateParent.value) {
          currentCreateParent.value.expanded = true;
          currentCreateParent.value._children = await window.electronAPI.listTree(targetDir);
        }
        await refreshSubTree(targetDir);
      } else {
        alert('创建失败：' + result.error);
      }
      currentCreateParent.value = null;
    }

    function cancelCreateFolder() {
      creatingFolder.value = false;
      newFolderName.value = '';
    }

    async function refreshSubTree(parentPath) {
      function findAndUpdate(nodes) {
        for (const node of nodes) {
          if (node.path === parentPath && node.type === 'folder') {
            window.electronAPI.listTree(parentPath).then(children => {
              node._children = children;
            });
            return true;
          }
          if (node.type === 'folder' && node._children) {
            if (findAndUpdate(node._children)) return true;
          }
        }
        return false;
      }
      findAndUpdate(treeData.value);
    }

    // ========== 导入PDF/ZIP ==========

    async function importPdfFile() {
      addMenuVisible.value = false;
      contextMenu.visible = false;
      let targetDir = folderPath.value;
      if (currentPdfDir.value) targetDir = currentPdfDir.value;
      await doImport(targetDir);
    }

    async function importIntoFolder(folderNode) {
      contextMenu.visible = false;
      await doImport(folderNode.path);
    }

    async function doImport(targetDir) {
      const files = await window.electronAPI.selectPdf();
      if (!files || files.length === 0) return;

      for (const src of files) {
        const result = await window.electronAPI.importAndExtract(src, targetDir);
        if (!result.success) {
          alert('导入失败：' + result.error);
        }
      }

      await loadTree();
      await refreshSubTree(targetDir);
    }

    // ========== 重命名 ==========

    function startRename(node) {
      contextMenu.visible = false;
      renamingPath.value = node.path;
      renameValue.value = node.name;
      nextTick(() => {
        const input = document.querySelector('.rename-input');
        if (input) {
          input.focus();
          // 选中文件名（不含扩展名）
          const dotIdx = node.name.lastIndexOf('.');
          if (dotIdx > 0) {
            input.setSelectionRange(0, dotIdx);
          } else {
            input.select();
          }
        }
      });
    }

    async function confirmRename(node) {
      const newName = renameValue.value.trim();
      renamingPath.value = '';

      if (!newName || newName === node.name) return;

      const result = await window.electronAPI.rename(node.path, newName);
      if (result.success) {
        // 如果正在打开被重命名的PDF，更新路径
        if (currentPdfPath.value === node.path) {
          currentPdfPath.value = result.path;
          currentFileName.value = newName;
        }
        await loadTree();
      } else {
        alert('重命名失败：' + result.error);
      }
    }

    function cancelRename() {
      renamingPath.value = '';
    }

    // ========== 删除 ==========

    async function deleteItem(node) {
      contextMenu.visible = false;

      const msg = node.type === 'folder'
        ? `确定要删除文件夹"${node.name}"及其所有内容吗？此操作不可恢复。`
        : `确定要删除"${node.name}"吗？`;
      if (!confirm(msg)) return;

      const result = await window.electronAPI.delete(node.path);
      if (result.success) {
        if (currentPdfPath.value === node.path) {
          currentPdfPath.value = '';
          currentFileName.value = '';
          cleanupPdfState();
        }
        await loadTree();
      } else {
        alert('删除失败：' + result.error);
      }
    }

    // ========== 拖拽排序 ==========

    function onDragStart(e, node) {
      dragNode = node;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.path);
      // 让拖拽图像小一点
      const el = e.target;
      e.dataTransfer.setDragImage(el, 0, 0);
    }

    function onDragOver(e, node) {
      if (!dragNode || dragNode === node) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const h = rect.height;

      // 判断拖放位置：上方1/3、中间1/3、下方1/3
      if (y < h * 0.25) {
        dragIndicator.value = node.path + ':before';
      } else if (y > h * 0.75) {
        dragIndicator.value = node.path + ':after';
      } else {
        // 如果是文件夹，中间表示放入内部
        if (node.type === 'folder') {
          dragIndicator.value = node.path + ':inside';
        } else {
          dragIndicator.value = node.path + ':after';
        }
      }
    }

    function onDragLeave(e, node) {
      if (dragIndicator.value && dragIndicator.value.startsWith(node.path)) {
        dragIndicator.value = '';
      }
    }

    async function onDrop(e, node) {
      dragIndicator.value = '';
      if (!dragNode || dragNode === node) return;

      const srcDir = normalizePath(pathDirname(dragNode.path));
      const tgtDir = normalizePath(pathDirname(node.path));

      const rect = e.currentTarget.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const intoFolder = node.type === 'folder' && relY > rect.height * 0.25 && relY < rect.height * 0.75;

      // 拖动文件放入文件夹
      if (intoFolder) {
        if (dragNode.path === node.path) return;
        if (normalizePath(dragNode.path).startsWith(normalizePath(node.path) + '/')) return;
        const moveResult = await window.electronAPI.move(dragNode.path, node.path);
        if (!moveResult || !moveResult.success) {
          alert('移动失败：' + (moveResult?.error || '未知错误'));
          return;
        }
        await loadTree();
        if (node.expanded && node._children) {
          node._children = await window.electronAPI.listTree(node.path);
        }
        return;
      }

      // 跨目录拖拽排序：先移动文件再插入位置
      if (srcDir !== tgtDir) {
        const moveResult = await window.electronAPI.move(dragNode.path, tgtDir);
        if (!moveResult || !moveResult.success) {
          alert('移动失败：' + (moveResult?.error || '未知错误'));
          return;
        }
        if (!config.directoryOrder) config.directoryOrder = {};
        delete config.directoryOrder[srcDir];
        await loadTree();
      }

      const siblings = getSiblingsForNode(node);
      const srcIdx = siblings.findIndex(n => n.name === dragNode.name);
      let tgtIdx = siblings.findIndex(n => normalizePath(n.path) === normalizePath(node.path));
      if (tgtIdx < 0) return;

      if (srcIdx >= 0) {
        if (relY > rect.height * 0.75) tgtIdx++;
        const item = siblings.splice(srcIdx, 1)[0];
        if (tgtIdx > srcIdx) tgtIdx--;
        siblings.splice(Math.max(0, tgtIdx), 0, item);
      } else {
        if (relY > rect.height * 0.75) tgtIdx++;
        const newNode = flatTree.value.find(n => n.name === dragNode.name);
        if (newNode) siblings.splice(Math.max(0, tgtIdx), 0, newNode);
      }

      const dirKey = normalizePath(tgtDir);
      if (!config.directoryOrder) config.directoryOrder = {};
      config.directoryOrder[dirKey] = siblings.map(n => n.name);
      saveConfigToDisk();
      await loadTree();

      if (dragNode.type === 'folder' && dragNode.expanded) {
        await nextTick();
        const restored = findNodeByPath(treeData.value, dragNode.path);
        if (restored) { restored.expanded = true; restored._children = dragNode._children; }
      }
    }

    function onDragEnd() {
      dragNode = null;
      dragIndicator.value = '';
    }

    // ========== PDF选择与渲染 ==========

    async function selectPdfFile(node) {
      if (node.type !== 'file') return;
      if (currentPdfPath.value === node.path) return;

      saveReadingProgress();
      loading.value = true;
      cleanupPdfState();

      currentFileName.value = node.name;
      currentPdfPath.value = node.path;
      // 记录当前PDF所在目录
      const parts = node.path.split(/[\\/]/);
      parts.pop();
      currentPdfDir.value = parts.join('/');

      config.lastPdf = node.path;
      saveConfigToDisk();

      // 展开树到该文件所在路径
      await expandToNode(node.path);

      await nextTick();
      await loadAndRenderPdf();
    }

    function cleanupPdfState() {
      totalPages.value = 0;
      currentPage.value = 0;
      if (observer) { observer.disconnect(); observer = null; }
      if (pdfDocument) { pdfDocument.destroy(); pdfDocument = null; }
    }

    async function loadAndRenderPdf() {
      try {
        const raw = await window.electronAPI.readPdfFile(currentPdfPath.value);
        if (!raw) { loading.value = false; return; }

        const data = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);
        const task = pdfjsLib.getDocument({ data });
        pdfDocument = await task.promise;
        totalPages.value = pdfDocument.numPages;
      } catch (err) {
        console.error('加载PDF失败:', err);
        loading.value = false;
      }
    }

    // 监听 totalPages 变化触发渲染
    watch(totalPages, async (newVal) => {
      if (newVal <= 0 || !pdfDocument) return;
      await nextTick();
      await nextTick();
      loading.value = false;
      await nextTick();
      await renderAllPages();
      setupIntersectionObserver();
      scrollToLastPosition(currentFileName.value);
    });

    async function renderAllPages() {
      const scale = getScale();
      const total = pdfDocument.numPages;
      const BATCH = 8;

      for (let start = 1; start <= total; start += BATCH) {
        const end = Math.min(start + BATCH - 1, total);
        const jobs = [];
        for (let p = start; p <= end; p++) jobs.push(renderPage(p, scale));
        await Promise.all(jobs);
      }
    }

    async function renderPage(pageNum, scale) {
      const canvas = getCanvas(pageNum);
      if (!canvas) return;

      try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // 编辑模式下渲染文本层
        if (editMode.value) {
          await nextTick();
          const textLayerDiv = document.querySelector(`.text-layer[data-text-page="${pageNum}"]`);
          if (textLayerDiv) {
            textLayerDiv.innerHTML = '';
            textLayerDiv.style.display = 'block';
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
              textDivs: [],
            });
            pdfjsLib.setLayerDimensions(textLayerDiv, viewport);
          }
        } else {
          const textLayerDiv = document.querySelector(`.text-layer[data-text-page="${pageNum}"]`);
          if (textLayerDiv) textLayerDiv.style.display = 'none';
        }
      } catch (err) { console.error(`渲染第${pageNum}页失败:`, err); }
    }

    // ========== 阅读进度 ==========

    function setupIntersectionObserver() {
      if (observer) observer.disconnect();
      observer = new IntersectionObserver((entries) => {
        let best = 0, bestRatio = 0;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            best = parseInt(e.target.dataset.page, 10);
          }
        }
        if (best > 0) currentPage.value = best;
      }, { root: readerRef.value, threshold: [0, 0.25, 0.5, 0.75, 1] });

      document.querySelectorAll('.pdf-page').forEach(el => observer.observe(el));
    }

    function onReaderScroll() {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveReadingProgress, SCROLL_SAVE_DELAY);
    }

    function saveReadingProgress() {
      const name = currentFileName.value;
      if (!name) return;
      if (currentPage.value > 0) config.readingProgress[currentPdfPath.value] = currentPage.value;
      if (readerRef.value) config.scrollPositions[currentPdfPath.value] = readerRef.value.scrollTop;
      saveConfigToDisk();
    }

    function scrollToLastPosition(fileName) {
      if (!readerRef.value) return;
      const pos = config.scrollPositions[currentPdfPath.value];
      if (pos != null && pos > 0) {
        readerRef.value.scrollTop = pos;
        return;
      }
      const page = config.readingProgress[currentPdfPath.value];
      if (page > 0) {
        const el = document.querySelector(`.pdf-page[data-page="${page}"]`);
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }

    // ========== 键盘快捷键 ==========

    function onKeyDown(e) {
      const r = readerRef.value;
      if (!r || !currentFileName.value) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const cur = userScale.value != null ? userScale.value : getScale();
        userScale.value = Math.min(SCALE_MAX, cur + SCALE_STEP);
        reRenderAll();
        return;
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        const cur = userScale.value != null ? userScale.value : getScale();
        userScale.value = Math.max(SCALE_MIN, cur - SCALE_STEP);
        reRenderAll();
        return;
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        userScale.value = null;
        reRenderAll();
        return;
      }

      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); r.scrollBy({ top: 60, behavior: 'smooth' }); break;
        case 'ArrowUp': e.preventDefault(); r.scrollBy({ top: -60, behavior: 'smooth' }); break;
        case 'PageDown': e.preventDefault(); r.scrollBy({ top: r.clientHeight * 0.85, behavior: 'smooth' }); break;
        case 'PageUp': e.preventDefault(); r.scrollBy({ top: -r.clientHeight * 0.85, behavior: 'smooth' }); break;
        case 'Home': e.preventDefault(); r.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'End': e.preventDefault(); r.scrollTo({ top: r.scrollHeight, behavior: 'smooth' }); break;
      }
    }

    async function reRenderAll() {
      await nextTick();
      await renderAllPages();
    }

    // ========== 生命周期 ==========

    onMounted(async () => {
      await loadConfig();
      if (config.lastFolder) {
        const exists = await window.electronAPI.fileExists(config.lastFolder);
        if (exists) {
          folderPath.value = config.lastFolder;
          await loadTree();
          if (config.lastPdf) {
            const target = findNodeByPath(treeData.value, config.lastPdf);
            if (target) await selectPdfFile(target);
          }
        }
      }
      window.addEventListener('keydown', onKeyDown);
    });

    onUnmounted(() => {
      saveReadingProgress();
      if (observer) observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      if (pdfDocument) pdfDocument.destroy();
    });

    return {
      readerRef, pdfContainerRef, renameInputRef, addBtnRef, folderInputRef,
      folderPath, sidebarCollapsed, totalPages, currentPage, loading,
      currentFileName, currentPdfPath, treeData, flatTree, totalPdfCount,
      hoveredPath, addMenuVisible, addMenuStyle, renamingPath, renameValue,
      creatingFolder, newFolderName, currentCreateParent,
      dragIndicator, contextMenu, editMode,
      openFolder, toggleFolder, selectPdfFile, onReaderScroll,
      toggleAddMenu, refreshTree, toggleMode, closeMenus, onContextMenu,
      startCreateFolderInput, startCreateFolderIn, confirmCreateFolder, cancelCreateFolder,
      importPdfFile, importIntoFolder, startRename, confirmRename, cancelRename, deleteItem,
      onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
    };
  },
});
</script>

<style>
/* ================================================================
   Typora 极简白色风格 - 树状知识库
   ================================================================ */
:root {
  --bg: #ffffff; --sidebar-bg: #f8f8f8; --border: #e0e0e0;
  --text: #333333; --text-l: #888888; --primary: #1a73e8;
  --primary-hv: #1557b0; --active-bg: #e8f0fe; --hover-bg: #f0f0f0;
  --shadow: rgba(0,0,0,0.08); --toolbar-h: 48px;
  --sidebar-w: 280px; --sidebar-collapsed-w: 0px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #app {
  height: 100%; overflow: hidden;
  font-family: var(--font); font-size: 14px; color: var(--text);
  background: var(--bg); -webkit-font-smoothing: antialiased;
}

.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ---- 工具栏 ---- */
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  height: var(--toolbar-h); padding: 0 12px;
  background: var(--bg); border-bottom: 1px solid var(--border);
  flex-shrink: 0; user-select: none; -webkit-app-region: drag;
}
.toolbar > * { -webkit-app-region: no-drag; }
.toolbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.toolbar-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }

.btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 12px; border: 1px solid var(--border);
  border-radius: 6px; background: var(--bg); color: var(--text);
  font-size: 13px; cursor: pointer; white-space: nowrap; transition: all .15s ease;
}
.btn:hover { background: var(--hover-bg); }
.btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn-primary:hover { background: var(--primary-hv); }
.btn-mode {
  padding: 4px 12px; font-size: 12px; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg);
  transition: all .15s; white-space: nowrap; margin-right: 8px;
}
.btn-mode:hover { background: var(--hover-bg); }
.btn-icon-only { padding: 6px 8px; font-size: 16px; border: none; background: transparent; }
.btn-icon-only:hover { background: var(--hover-bg); }

.folder-path {
  font-size: 12px; color: var(--text-l);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 350px; cursor: pointer; padding: 4px 8px; border-radius: 4px;
}
.folder-path:hover { background: var(--hover-bg); }
.stat { font-size: 12px; color: var(--text-l); }

/* ---- 主体 ---- */
.main { display: flex; flex: 1; overflow: hidden; position: relative; }

/* ---- 侧边栏 ---- */
.sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w);
  background: var(--sidebar-bg); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
  transition: width .2s ease, min-width .2s ease;
}
.sidebar.collapsed { width: var(--sidebar-collapsed-w); min-width: 0; }
.sidebar-body { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.sidebar-header h3 { font-size: 13px; font-weight: 600; }
.sidebar-actions { display: flex; gap: 4px; position: relative; }

.icon-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: 4px; cursor: pointer;
  font-size: 18px; color: var(--text-l); transition: all .1s;
}
.icon-btn:hover { background: #e0e0e0; color: var(--text); }
.plus-icon { font-weight: 300; line-height: 1; }

/* ---- 弹出菜单 ---- */
.popup-menu {
  position: absolute; z-index: 1000;
  background: #fff; border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 4px 0; min-width: 160px;
}
.context-popup { position: fixed; }
.add-popup-fixed { position: fixed; z-index: 1001; }

.popup-item {
  padding: 8px 16px; font-size: 13px; cursor: pointer; white-space: nowrap;
  transition: background .1s;
}
.popup-item:hover { background: var(--hover-bg); }
.popup-item.danger { color: #d93025; }
.popup-item.danger:hover { background: #fce8e6; }

/* ---- 新建文件夹栏 ---- */
.create-folder-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-bottom: 1px solid var(--border);
  background: #fff;
}
.folder-name-input {
  flex: 1; font-size: 13px; padding: 4px 8px;
  border: 1px solid var(--primary); border-radius: 4px;
  outline: none; font-family: var(--font);
}
.btn-sm {
  padding: 3px 10px; font-size: 12px; border: 1px solid var(--border);
  border-radius: 4px; background: var(--bg); cursor: pointer;
}
.btn-sm:hover { background: var(--hover-bg); }

/* ---- 文件树 ---- */
.tree-list {
  list-style: none; overflow-y: auto; flex: 1; padding: 4px 0;
}
.tree-empty, .sidebar-empty {
  padding: 24px 16px; font-size: 12px; color: var(--text-l); text-align: center;
}

.tree-item {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 8px; cursor: pointer; font-size: 13px;
  user-select: none; position: relative;
  transition: background .1s; white-space: nowrap;
}
.tree-item:hover { background: var(--hover-bg); }
.tree-item.active {
  background: var(--active-bg); color: var(--primary); font-weight: 500;
  border-radius: 6px; margin: 0 6px; padding-left: 2px;
}

/* ---- 树形引导线 ---- */
.tree-lines {
  position: absolute; top: 0; left: 0; bottom: 0;
  pointer-events: none; z-index: 1;
}
.tree-line {
  position: absolute; top: 0; bottom: 0; width: 20px;
}
.tree-line::before {
  content: '';
  position: absolute;
  background: #d8d8d8;
}
/* 垂直延续线：从当前行顶部延伸到底部 */
.tree-line.line-vertical::before {
  top: 0; bottom: 0; left: 9px; width: 1px;
}
/* 拐角线：L 形，从垂直线的中间向左拐到水平位置 */
.tree-line.line-corner::before {
  top: 0; bottom: 50%; left: 9px; width: 1px;
}
.tree-line.line-corner::after {
  content: '';
  position: absolute;
  top: 50%; left: 9px; width: 11px; height: 1px;
  background: #d8d8d8;
}

.tree-arrow { width: 16px; font-size: 10px; color: #999; flex-shrink: 0; text-align: center; position: relative; z-index: 2; }
.tree-arrow-placeholder { width: 16px; flex-shrink: 0; }
.tree-icon { font-size: 15px; flex-shrink: 0; line-height: 1; position: relative; z-index: 2; }
.tree-name { overflow: hidden; text-overflow: ellipsis; flex: 1; position: relative; z-index: 2; }

.tree-more {
  display: none; width: 20px; height: 20px; line-height: 20px;
  text-align: center; border-radius: 4px; font-size: 14px; color: var(--text-l);
  flex-shrink: 0;
}
.tree-item:hover .tree-more { display: block; }
.tree-more:hover { background: #d0d0d0; color: var(--text); }

.rename-input {
  flex: 1; font-size: 13px; padding: 2px 6px;
  border: 1px solid var(--primary); border-radius: 4px;
  outline: none; font-family: var(--font); min-width: 0;
}

/* 拖拽指示器 */
.tree-item.drag-over-before {
  box-shadow: inset 0 2px 0 var(--primary);
}
.tree-item.drag-over-after {
  box-shadow: inset 0 -2px 0 var(--primary);
}
.tree-item.drag-over-inside {
  background: var(--active-bg);
}

/* ---- 阅读区 ---- */
.reader {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  background: #f5f5f5; position: relative;
}

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; color: var(--text-l); user-select: none;
}
.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: .4; }
.empty-state p { font-size: 14px; }
.shortcut-hints { display: flex; gap: 20px; margin-top: 16px; font-size: 12px; }
.shortcut-hints kbd {
  display: inline-block; padding: 2px 6px;
  background: #e8e8e8; border: 1px solid #ccc;
  border-radius: 3px; font-family: monospace; font-size: 11px; margin: 0 2px;
}

.loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; color: var(--text-l); gap: 16px;
}
.spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.pdf-container { padding: 24px 0; }
.pdf-page {
  display: flex; flex-direction: column; align-items: center;
  margin-bottom: 4px;
}
.pdf-page canvas {
  box-shadow: 0 1px 6px var(--shadow); border-radius: 2px;
  background: #fff; display: block;
}
.text-layer {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  overflow: hidden; opacity: 0.2; line-height: 1.0;
  user-select: text; z-index: 1;
}
.text-layer span {
  color: transparent; cursor: text;
  position: absolute; white-space: pre;
  transform-origin: 0% 0%;
}
.text-layer span::selection {
  background: rgba(0, 100, 255, 0.3);
}
.text-layer span::-moz-selection {
  background: rgba(0, 100, 255, 0.3);
}

/* ---- 滚动条 ---- */
.reader::-webkit-scrollbar { width: 8px; }
.reader::-webkit-scrollbar-track { background: transparent; }
.reader::-webkit-scrollbar-thumb { background: #c0c0c0; border-radius: 4px; }
.reader::-webkit-scrollbar-thumb:hover { background: #a0a0a0; }
.tree-list::-webkit-scrollbar { width: 4px; }
.tree-list::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 2px; }

::selection { background: var(--active-bg); color: var(--primary); }
</style>
