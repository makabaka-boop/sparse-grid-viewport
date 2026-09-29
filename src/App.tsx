import { Grid } from "./components/Grid";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>表格编辑器</h1>
        <span className="hint">
          100,000 行 × 200 列 · 首行与前两列冻结 · 方向键移动，Shift
          扩展选区，直接输入编辑，Ctrl+C/V 复制粘贴，Ctrl+Z/Y 撤销重做
        </span>
      </header>
      <Grid />
    </div>
  );
}
