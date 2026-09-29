# 表格编辑器（纯前端 · React + TypeScript）

100,000 行 × 200 列的逻辑表格，不调用任何后端：稀疏存储、虚拟滚动、
首行与前两列冻结、矩形选区、TSV 复制粘贴、20 步成组撤销/重做。

## 快速验收（Docker）

```bash
docker compose config --quiet   # 1. 校验 compose 配置
docker compose build            # 2. 构建镜像
docker compose run --rm verify  # 3. 一次性验证：tsc + Vitest + Playwright
```

`verify` 服务跑完即退出，退出码即验收结果。
日常开发可起交互页面：`docker compose up app`，访问 http://localhost:5173 。

## 本地开发

```bash
npm install
npm run dev         # 开发服务器（5173 端口）
npm run test:unit   # Vitest：坐标模型 / 可见区 / 历史 / TSV
npm run test:e2e    # Playwright：冻结交界 / 键盘 / DOM 数量（自动起 dev server）
npm run verify      # = typecheck + test:unit + test:e2e
```

## 架构

逻辑与视图严格分层。`src/grid/` 下全部为不依赖 React/DOM 的纯模块，可独立单测：

| 模块 | 职责 |
| --- | --- |
| `src/grid/coords.ts` | 坐标模型：行列地址、单元格 key 编解码、选区归一化、边界钳制 |
| `src/grid/viewport.ts` | 可见区计算：正文渲染窗口、冻结条尺寸、键盘滚动跟随 |
| `src/grid/history.ts` | 编辑历史：容量 20 的成组撤销/重做栈（一组修改 = 一步） |
| `src/grid/store.ts` | 稀疏存储：`Map<key, string>`，未编辑单元格不分配对象；应用/回滚修改组 |
| `src/grid/tsv.ts` | TSV 解析/导出、粘贴规划：越界或 >10,000 格整次拒绝，不产生部分修改 |

`src/components/Grid.tsx` 只负责把上述纯逻辑映射到 DOM：

- 滚动容器里只有一块 spacer，撑出 24,000 × 2,800,000 的逻辑像素尺寸；
- 渲染层与滚动位置同步，只挂载「可见窗口 + 冻结条」的单元格
  （1280×720 视口下约 300 个 DOM 节点，与 100,000×200 的逻辑规模无关）；
- 冻结行/列/角用更高 z-index 压在正文层上，正文滚动时从冻结条下方滑过；
- 表头（首行）、单元格、选区高亮、键盘焦点全部由同一套逻辑坐标 `(r, c)`
  推导，滚动只是坐标 → 像素的纯函数映射，四者天然对应同一坐标系。

### 关键设计

- **稀疏存储**：单元格值放在 `Map<r*200+c, string>` 里，编辑才写入、清空即删 key；
  撤销/重做条目只记录被改动的 `{key, prev, next}`。
- **成组历史**：一次粘贴、一次清除、一次单格编辑各算一步，共保留 20 步；
  第 21 步挤出最旧一步，新操作清空重做栈。
- **粘贴原子性**：`planPaste` 先完整校验（非空、≤10,000 格、目标区域不越界），
  失败只返回原因、不返回修改集，调用方无从落盘，保证整次拒绝、不留部分修改。
- **TSV 语义**：复制按选区逐格导出（空格为空串）；粘贴时空串清除已有值，
  参差行按最大列数补空，与常见表格软件一致。

## 交互

- 方向键 / Tab / Enter / PageUp / PageDown / Home / End / Ctrl+Home / Ctrl+End
  移动活动单元格，Shift 扩展选区；鼠标点击、Shift+点击、拖动框选。
- 直接输入、F2 或双击进入编辑；Enter 提交并下移，Tab 提交并右移，Esc 取消；
  Delete / Backspace 清空选区（作为一步撤销）。
- Ctrl+C 复制选区为 TSV；Ctrl+V 从活动单元格粘贴，粘贴区域成为新选区。
- Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做；状态栏按钮等效。
- 粘贴越界或超过 10,000 格时状态栏提示拒绝原因，表格内容不变。

## 测试

- `src/grid/__tests__/`（Vitest）：
  - `viewport.test.ts` 对拍可见区窗口与滚动跟随（含冻结条偏移、末尾钳制）；
  - `history.test.ts` 对拍 20 步容量、成组撤销/重做、redo 栈清空；
  - `coords.test.ts` / `tsv.test.ts` 覆盖坐标编解码与粘贴校验的全部拒绝分支。
- `e2e/grid.spec.ts`（Playwright）：
  - 冻结区交界：滚动后角/首行/前两列的像素位置固定，正文列从冻结层下滑过；
  - 键盘移动：方向键、Shift 扩展、Ctrl+End/Home 的滚动跟随与活动格可见性；
  - 大数据 DOM 数量：任意滚动位置下 `[data-cell]` 节点数有界（< 500）；
  - 编辑 → 粘贴 → 复制 → 撤销 → 重做 → 越界/超量拒绝的完整链路。
