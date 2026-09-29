# 网格编辑器（Grid Editor）

纯前端表格编辑器：TypeScript + React，不调用任何后端。逻辑规模 **100,000 行 × 200 列**，首行与前两列冻结，全量虚拟化渲染。

## 验收（固定三步）

```bash
docker compose config --quiet
docker compose build
docker compose run --rm verify
```

`verify` 是一次性测试服务，依次执行：TypeScript 类型检查 → Vitest 单元测试 → Vite 生产构建 → Playwright 端到端测试（Chromium）。全部通过则以退出码 0 结束。

本地开发（不使用 Docker 时）：

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run verify     # 与容器内一致的完整验证（需先 npx playwright install chromium）
```

也可以用 Docker 起开发服务器：`docker compose run --rm --service-ports app`。

## 功能

- 100,000 × 200 逻辑网格，**未编辑单元格不分配数据对象**（稀疏 Map 存储）
- 首行 + 前两列冻结；滚动时表头、单元格、选区、键盘焦点始终对应同一逻辑坐标
- 虚拟化渲染：页面只挂载可见窗口（含 2 格 overscan），DOM 数量与视口成正比
- 矩形选择（拖拽 / Shift+方向键 / Shift+点击 / Ctrl+A）
- TSV 复制、剪切、粘贴（与 Excel / Google Sheets 互通）
- **20 步成组撤销/重做**：一次粘贴或清除算一组
- 粘贴整体校验：越界或外接矩形超过 10,000 格时**整次拒绝**，不留部分修改
- 单元格内编辑（输入即编辑 / F2 / 双击），Enter 提交、Escape 取消

## 操作

| 操作 | 按键 / 鼠标 |
| --- | --- |
| 移动焦点 | 方向键、Tab、Enter、PageUp/Down、Home/End、Ctrl+Home/End |
| 扩展选区 | Shift+方向键、鼠标拖拽、Shift+点击、Ctrl+A 全选 |
| 编辑 | 直接输入、F2、双击；Enter 提交并下移，Escape 取消 |
| 清除 | Delete / Backspace |
| 复制 / 剪切 / 粘贴 | Ctrl+C / Ctrl+X / Ctrl+V |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Y（或 Ctrl+Shift+Z），或工具栏按钮 |

## 架构

坐标模型、可见区计算、编辑历史是三个互相独立的核心模块，存储、TSV、控制器再在其上组合；React 组件只做"逻辑坐标 → DOM"的映射和事件翻译。

```
src/
├── core/
│   ├── coords.ts     # 坐标模型：CellRef/CellRange、钳制、求交、A1 列名换算
│   ├── viewport.ts   # 可见区计算：滚动钳制、可见窗口、scrollToReveal（纯函数）
│   ├── history.ts    # 编辑历史：成组撤销/重做栈，上限 20 组
│   ├── store.ts      # 稀疏存储：Map<row*COLS+col, string>，只承载 CellEdit 的应用/回滚
│   ├── tsv.ts        # TSV 解析/序列化、粘贴规划（越界/超上限整体拒绝）
│   └── editor.ts     # 控制器：所有修改收敛为"一组 CellEdit 的原子提交"
├── components/
│   └── Grid.tsx      # 四窗格冻结渲染 + 虚拟化 + 键盘/鼠标/剪贴板交互
├── App.tsx / main.tsx / styles.css
tests/
├── unit/             # Vitest：coords / viewport / history / store / tsv / editor
└── e2e/              # Playwright：冻结交界、键盘移动、DOM 数量、粘贴原子性
```

依赖方向：`components → editor → {store, history, tsv} → coords`，`viewport` 独立。`store` 不认识历史，`history` 不认识单元格，`coords`/`viewport` 不认识任何人。

### 关键设计

- **稀疏存储**：`CellStore` 内部是 `Map<线性键, 字符串>`，未编辑或已清空的单元格没有任何条目（`store.size` 即已分配单元格数，有单元测试保证）。
- **四窗格冻结**：主体窗格（原生滚动）+ 表头窗格（translateX 同步）+ 冻结列窗格（translateY 同步）+ 角窗格。每个窗格按自己的逻辑坐标范围渲染同一套 `data-cell="行:列"` 单元格，选区与焦点框按逻辑坐标换算后叠加在对应窗格内，因此滚动时四者永远对齐。
- **虚拟化**：`computeVisibleRange` 由滚动偏移和视口尺寸算出行列窗口，主体内容只是一个 `99999×28px × 198×110px` 的占位盒；E2E 断言全表 DOM 单元格数远小于 2000。
- **键盘/剪贴板焦点**：一个 1px 隐藏 textarea 恒持焦点，保证方向键、输入、copy/paste 事件可靠触发；编辑时焦点转移到单元格内 input。
- **原子提交**：`Editor.commit` 先收集整组编辑（含 prev/next），过滤 no-op 后一次性应用并压入历史；`planPaste` 在任何修改发生前完成全部校验，拒绝时存储、历史、版本号零变化（有单元测试断言）。
- **保护上限**：粘贴外接矩形 ≤ 10,000 格；复制选区 ≤ 1,000,000 格（防止全选 2000 万格时序列化卡死）。

## 测试策略

**Vitest（50 个用例）**

- `viewport.test.ts`：随机滚动位置下与**暴力参考实现逐索引对拍**（含 100,000×200 全量规模的边界滚动、越界钳制、overscan）
- `editor.test.ts`：800 次随机 set/undo/redo 后与**朴素参考模型**（完整 Map + 同样 20 组上限的手写栈）逐步对拍；粘贴原子性（超量/越界拒绝后存储、历史、版本号零变化）；20 组上限
- `history.test.ts`：LIFO、重做栈清空、20 组上限丢弃最旧
- `coords / store / tsv`：列名换算、稀疏性、TSV 往返、粘贴规划边界
- `grid.smoke.test.tsx`：jsdom 挂载冒烟——组件渲染、键盘移动、输入即编辑、撤销重做的完整渲染路径

**Playwright（5 个用例，Chromium）**

- 大数据下实际 DOM 单元格数量有界，滚动区域尺寸精确等于逻辑规模，可滚到最后一格
- 冻结区交界：滚动后角格不动、表头与主体同列对齐、冻结列与主体同行对齐、交界线像素位置精确
- 键盘移动：焦点框穿越冻结区时落在正确窗格，长距离移动自动滚动且焦点始终可见，Ctrl+End 到 `GR100000`
- 编辑、TSV 复制粘贴往返、整组撤销/重做
- 超量与越界粘贴整体拒绝，目标格保持为空
