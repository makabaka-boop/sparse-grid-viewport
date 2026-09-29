import { Grid } from './components/Grid';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>网格编辑器</h1>
        <span className="subtitle">100,000 行 × 200 列 · 首行与前两列冻结 · 纯前端无后端</span>
      </header>
      <Grid />
    </div>
  );
}
