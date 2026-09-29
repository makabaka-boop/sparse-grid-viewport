// @vitest-environment jsdom
/**
 * Grid 组件冒烟测试（jsdom，无布局）：验证组件真实挂载、
 * 键盘事件驱动逻辑焦点移动、输入即编辑并提交的完整渲染路径。
 * 像素级对齐由 Playwright 端到端测试覆盖。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../src/App';

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('Grid 冒烟（jsdom）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<App />);
    await tick();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  const hidden = () => container.querySelector<HTMLTextAreaElement>('[data-testid="hidden-input"]')!;
  const key = (el: Element, k: string, opts: KeyboardEventInit = {}) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  const status = (testid: string) => container.querySelector(`[data-testid="${testid}"]`)?.textContent;

  it('挂载后渲染冻结角、占位表头与状态栏', () => {
    expect(container.querySelector('[data-cell="0:0"]')).toBeTruthy();
    expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe('A'); // 列表头占位
    expect(status('status-active')).toBe('A1');
    expect(status('status-selection')).toBe('1×1');
    // 绝不渲染整张表
    expect(container.querySelectorAll('[data-cell]').length).toBeLessThan(2000);
  });

  it('方向键与 Ctrl+End 移动逻辑焦点', async () => {
    key(hidden(), 'ArrowDown');
    await tick();
    expect(status('status-active')).toBe('A2');
    key(hidden(), 'ArrowRight');
    await tick();
    expect(status('status-active')).toBe('B2');
    key(hidden(), 'End', { ctrlKey: true });
    await tick();
    expect(status('status-active')).toBe('GR100000');
    expect(status('status-selection')).toBe('1×1');
  });

  it('Shift+方向键扩展矩形选区', async () => {
    key(hidden(), 'ArrowDown', { shiftKey: true });
    key(hidden(), 'ArrowDown', { shiftKey: true });
    key(hidden(), 'ArrowRight', { shiftKey: true });
    await tick();
    expect(status('status-selection')).toBe('3×2');
  });

  it('输入即编辑，Enter 提交并下移', async () => {
    key(hidden(), 'x');
    await tick();
    const input = container.querySelector<HTMLInputElement>('[data-testid="cell-editor"]');
    expect(input).toBeTruthy();
    expect(input!.value).toBe('x');
    input!.value = 'xyz';
    key(input!, 'Enter');
    await tick();
    expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe('xyz');
    expect(status('status-active')).toBe('A2');
    expect(status('status-history')).toContain('撤销 1');
  });

  it('Ctrl+Z / Ctrl+Y 撤销重做', async () => {
    key(hidden(), 'h');
    await tick();
    const input = container.querySelector<HTMLInputElement>('[data-testid="cell-editor"]')!;
    key(input, 'Enter');
    await tick();
    expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe('h');
    key(hidden(), 'z', { ctrlKey: true });
    await tick();
    expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe('A'); // 恢复占位符
    key(hidden(), 'y', { ctrlKey: true });
    await tick();
    expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe('h');
  });
});
