---
title: "用 opencode + agent-skills 开发俄罗斯方块：自然语言驱动工程流"
date: 2026-01-15
update_date: 2026-01-15
description: "用 opencode 终端 agent 跑 addyosmani/agent-skills 的 24 个工程 skill，完整开发一个网页版俄罗斯方块。零斜杠命令，纯自然语言驱动。"
tldr: "opencode 跟 Claude Code 不一样——它没有 /skill 命令。skill 是通过 AGENTS.md 引导 agent 自动选用的。你只说人话，agent 自己判断该跑哪个 skill。本文用俄罗斯方块做实战演示。"
taxonomies:
  tags: ["AI", "LLM", "Coding Agent", "opencode", "agent-skills", "Tetris", "TDD", "Engineering"]
---

之前我写过 [用 Matt Pocock 的 Skill 系统开发 2048](/blog/skill-system-2048-full-demo/)，那套流程是**斜杠命令驱动**——`/grill-with-docs`、`/to-spec`、`/to-tickets`、`/implement`，每个阶段都要手动喊。

这次用 [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) + [opencode](https://opencode.ai/) 跑一遍俄罗斯方块，**全程没说一个斜杠命令**。Skill 不是手动触发的，是 agent 自己根据意图挑的。

---

## 一、为什么是 opencode + agent-skills

两件事说清楚：

**opencode 是什么**：开源终端 AI coding agent，[anomalyco/opencode](https://github.com/anomalyco/opencode)，19 万 star。装好之后就是个 TUI，可以聊、可以改、可以跑命令。

```bash
npm install -g opencode-ai
# 或者
brew install anomalyco/tap/opencode
```

**agent-skills 是什么**：24 个工程实践 skill 的 Markdown 集合，按生命周期分 6 个阶段——Define、Plan、Build、Verify、Review、Ship。

**关键区别**：在 Claude Code 里你写 `/grill-with-docs` 才调 skill。在 opencode 里你**只说人话**，agent 自己根据你的意图挑 skill。背后靠的是项目根目录的 `AGENTS.md`。

---

## 二、准备工作：5 分钟搭好

```bash
mkdir tetris && cd tetris
git clone https://github.com/addyosmani/agent-skills.git .
```

Clone 完之后，工作区里有两样关键东西：

```
tetris/
├── AGENTS.md              # 给 agent 的元指令，告诉它怎么挑 skill
└── skills/                # 24 个 skill 的 SKILL.md
    ├── spec-driven-development/
    ├── planning-and-task-breakdown/
    ├── test-driven-development/
    ├── incremental-implementation/
    ├── frontend-ui-engineering/
    ├── browser-testing-with-devtools/
    ├── debugging-and-error-recovery/
    ├── code-review-and-quality/
    └── ...
```

`AGENTS.md` 是 opencode 的核心。它告诉 agent：

1. **什么时候该查 skills/**（任何非平凡任务）
2. **怎么读 SKILL.md**（Frontmatter → When to Use → Process → Verification）
3. **怎么调**（用 `skill` 工具）

`cd tetris && opencode` 进 TUI，环境就绪。

---

## 三、工作原理：自然语言 → 自动 skill 调度

打开 opencode 后，**不要**先敲 `/spec` 之类的命令。直接说人话。

| 你说的 | agent 自动调用的 skill |
|--------|---------------------|
| "我想做一个网页版俄罗斯方块，先帮我梳理下需求和规格" | `spec-driven-development` |
| "把上面的 spec 拆成可执行的 tickets" | `planning-and-task-breakdown` |
| "按 ticket 顺序实现，每步先写测试" | `incremental-implementation` + `test-driven-development` |
| "界面太丑了，按现代极简风重做" | `frontend-ui-engineering` |
| "在浏览器里实际跑一下，看有没有问题" | `browser-testing-with-devtools` |
| "旋转的时候方块穿墙了，帮我定位下原因" | `debugging-and-error-recovery` |
| "代码 review 一下，看哪里可以改进" | `code-review-and-quality` |

每个 skill 的 `SKILL.md` 都规定了触发条件（"When to Use"）。AGENTS.md 教 agent 看到匹配就调。

这就是 addyosmani/agent-skills 跟 Matt Pocock 那套的本质区别：**没有手动入口，全靠意图匹配**。

---

## 四、实战：俄罗斯方块 7 个阶段

### 阶段 1：spec-driven-development — 把"俄罗斯方块"变成可验收的规格

直接说：

> "我想做一个网页版俄罗斯方块。先按 spec-driven-development 这个 skill 帮我生成完整规格。"

agent 读 `skills/spec-driven-development/SKILL.md`，按它的模板把规格写进 `SPEC.md`。**真实产出**（节选）：

```markdown
# 俄罗斯方块规格说明 (v1)

## 范围

### 核心机制
- 10×20 网格，顶部生成 7 种标准 tetromino (I/O/T/S/Z/L/J)
- 每 800ms 下落一格，level 越高越快
- 方向键 ← → 移动，上键旋转，下键软落，空格硬落
- 一行填满时消除，计分
- 顶部无法放置新方块时 Game Over

### 计分
- 单消：100 × level
- 双消：300 × level
- 三消：500 × level
- 四消（Tetris）：800 × level

### 下一块预览
- 右侧窗口显示下一个方块

## 验收标准
- [ ] 7 种方块形状正确
- [ ] 旋转不穿墙、不覆盖已放置方块（墙 kick 简化版）
- [ ] 满行消除正确，多行同时消除计分正确
- [ ] 硬落立即到底，软落加速下落
- [ ] 等级随消除行数提升，下落速度对应
- [ ] 无法生成新方块时 Game Over
- [ ] 分数、等级、下一个方块 UI 实时更新
```

**跟直接对话的差别**：直接说"做个俄罗斯方块"，agent 大概率直接开干。规格明确后，后面每一步都有锚点——不会出现"做完了发现 UI 风格不是想要的"。

### 阶段 2：planning-and-task-breakdown — 把 spec 切成可验证的 ticket

> "按 spec 拆 ticket，每个独立可验证，标注依赖。"

输出 `tickets/`：

```
tickets/
├── 01-grid-and-rendering.md          # blocking: none
├── 02-piece-spawn-and-types.md       # blocking: 01
├── 03-gravity-and-timing.md          # blocking: 02
├── 04-movement-and-rotation.md       # blocking: 02
├── 05-line-clear-detection.md        # blocking: 01
├── 06-scoring-and-level.md           # blocking: 05
├── 07-next-piece-preview.md          # blocking: 02
├── 08-soft-drop-and-hard-drop.md     # blocking: 04
└── 09-game-over-detection.md         # blocking: 03, 05
```

每个 ticket 自带验收列表。比如 `04-movement-and-rotation.md`：

```markdown
# Ticket 04: 移动与旋转

## 依赖
01 (grid), 02 (piece spawn)

## 实现要点
- ← → 移动：边界检测
- ↑ 旋转：90 度矩阵变换 + 简化版 wall kick（左右各偏移 1 格尝试）
- 旋转不合法时回退原状态

## 测试
- [ ] piece 在左边界时 ← 不动
- [ ] piece 在右边界时 → 不动
- [ ] piece 旋转正确（提供 7 种形状的旋转前/后状态对照）
- [ ] piece 紧贴方块时 ↑ 不旋转、保持原状
- [ ] 旋转越界时 wall kick 成功

## 验收
跑 `npm test`，全部通过；浏览器手动测一遍 7 种方块的旋转。
```

`incremental-implementation` skill 看到这个依赖图，会按拓扑序 01 → 02 → 03 → ... 一个一个做。

### 阶段 3：test-driven-development + incremental-implementation — 红绿循环

以 ticket 04（旋转）为例。

#### Red：先写 failing test

```javascript
// tests/rotation.test.js
import { describe, it, expect } from 'vitest';
import { createPiece, rotatePiece } from '../src/piece.js';

describe('rotation', () => {
  it('T-piece rotates 90 degrees clockwise', () => {
    const t = createPiece('T', 4, 0);
    // T 初始:  .T.
    //          TTT
    const rotated = rotatePiece(t, 1);
    // 旋转后:  T.
    //          TT
    //          T.
    expect(rotated.cells).toEqual([
      { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 2 },
    ]);
  });

  it('rotation fails when blocked, returns original piece', () => {
    // 准备一个 T，紧贴左边墙
    const t = createPiece('T', 0, 5);
    const rotated = rotatePiece(t, 1);
    // wall kick 失败，应回退
    expect(rotated).toBe(t); // 返回原对象
  });
});
```

跑 `npm test` → **Red**。

#### Green：最小实现

```javascript
// src/piece.js
const SHAPES = {
  I: [[0,0],[1,0],[2,0],[3,0]],
  O: [[0,0],[1,0],[0,1],[1,1]],
  T: [[1,0],[0,1],[1,1],[2,1]],
  S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]],
  L: [[0,0],[0,1],[1,1],[2,1]],
  J: [[2,0],[0,1],[1,1],[2,1]],
};

export function createPiece(type, x, y) {
  return { type, x, y, cells: SHAPES[type].map(([dx, dy]) => ({ x: x + dx, y: y + dy })) };
}

export function rotatePiece(piece, times = 1) {
  let current = piece;
  for (let i = 0; i < times; i++) {
    const rotated = {
      ...current,
      cells: current.cells.map(({ x, y }) => ({
        x: current.x + (y - current.y),
        y: current.y - (x - current.x),
      })),
    };
    // 简化版 wall kick：尝试 ±1 偏移
    if (!isValidPosition(rotated)) {
      const kicked = tryWallKick(rotated);
      if (kicked) current = kicked;
      else return piece; // 回退
    } else {
      current = rotated;
    }
  }
  return current;
}
```

跑 `npm test` → **Green**。

#### Code Review：自检

```
## Standards (per code-review-and-quality skill)
- [x] 函数单一职责
- [x] 无 magic number（旋转矩阵来自 SRS 标准）
- [x] 边界处理完整

## Spec
- [x] 旋转正确
- [x] 越界回退
- [x] wall kick 简化版
```

每个 ticket 走完都是这种节奏：Red → Green → Review → Commit。

### 阶段 4：frontend-ui-engineering — 让它看起来不像 1990

ticket 全绿后：

> "基础功能通了，但 UI 太丑。按 frontend-ui-engineering 的标准重做，CSS Variables + 现代极简风。"

agent 调 `frontend-ui-engineering`，做几件事：

1. **设计令牌**：颜色、字号、间距全走 CSS Variables
2. **响应式**：移动端可玩
3. **可访问性**：键盘 focus、aria-label
4. **动画**：消行闪烁、方块硬落的轨迹

产出节选：

```css
:root {
  --bg: #0f0f17;
  --grid-line: rgba(255, 255, 255, 0.04);
  --piece-I: #00f0f0;
  --piece-O: #f0f000;
  --piece-T: #a000f0;
  --piece-S: #00f000;
  --piece-Z: #f00000;
  --piece-L: #f0a000;
  --piece-J: #0000f0;
  --font-mono: 'JetBrains Mono', monospace;
}
```

### 阶段 5：browser-testing-with-devtools — 在真浏览器里跑

> "用 browser-testing-with-devtools 在 Chrome 里实际跑一下，截图、检查 console、确认交互正常。"

agent 通过 Chrome DevTools MCP 实际启动浏览器（不是 mock），做这些检查：

- 页面加载后 canvas 渲染正确
- 键盘事件触发，无 console error
- 7 种方块都能生成和旋转
- 满行消除动画播放
- localStorage 保存最高分
- 移动端 touch 事件正常

发现问题直接进阶段 6。

### 阶段 6：debugging-and-error-recovery — 修 bug

实测发现：长条 I 在边缘旋转时偶尔"消失一帧"。

> "I 方块在右边缘旋转偶尔消失。按 debugging-and-error-recovery 的流程查一下。"

agent 按 skill 模板走：

1. **Reproduce**：写最小复现（5 行代码触发）
2. **Isolate**：定位到 `rotatePiece` 的 wall kick 逻辑——I 占 4 格，偏移 ±1 不够
3. **Hypothesize**：I 需要 ±2 偏移
4. **Verify**：补测试用例，修复，跑全测

```javascript
// 修复
function tryWallKick(piece) {
  for (const dx of [1, -1, 2, -2]) {
    const kicked = { ...piece, x: piece.x + dx };
    if (isValidPosition(kicked)) return kicked;
  }
  return null;
}
```

回归测试通过。

### 阶段 7：code-review-and-quality — 最后一道闸

> "按 code-review-and-quality 的清单 review 一遍最终代码。"

agent 按 checklist 过一遍：

- [ ] 无 dead code（所有函数都有调用）
- [ ] 无过度抽象（没有"为了将来"的接口）
- [ ] 错误处理完整（边界、非法输入）
- [ ] 性能可接受（60fps 渲染）
- [ ] 测试覆盖核心逻辑（rotation、line clear、scoring）
- [ ] 文档齐全（README + 注释）

发现两处改进：
1. `spawnPiece` 里 `Math.random()` 直接调，测试难 mock——抽成参数注入
2. `render` 每次全量重绘，可以加 dirty flag 优化

修完。最终 commit。

---

## 五、完整代码（最终交付）

`index.html` 单文件，约 380 行：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tetris</title>
  <style>
    :root {
      --bg: #0f0f17;
      --panel: #1a1a24;
      --text: #e8e8f0;
      --grid-line: rgba(255, 255, 255, 0.05);
      --piece-I: #00f0f0; --piece-O: #f0f000; --piece-T: #a000f0;
      --piece-S: #00f000; --piece-Z: #f00000; --piece-L: #f0a000; --piece-J: #4040ff;
      --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-mono);
      background: var(--bg); color: var(--text);
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
    }
    .game { display: flex; gap: 24px; }
    canvas { background: var(--panel); border-radius: 8px; }
    .panel { display: flex; flex-direction: column; gap: 16px; min-width: 140px; }
    .stat { background: var(--panel); padding: 12px 16px; border-radius: 8px; }
    .stat label { font-size: 11px; text-transform: uppercase; opacity: 0.6; }
    .stat .value { font-size: 24px; font-weight: bold; }
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: none; align-items: center; justify-content: center;
      flex-direction: column; gap: 16px;
    }
    .overlay.show { display: flex; }
    canvas.next { width: 100px; height: 100px; background: var(--panel); border-radius: 8px; }
    .controls { font-size: 12px; opacity: 0.7; line-height: 1.8; }
    kbd { background: var(--panel); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="game">
    <canvas id="board" width="300" height="600"></canvas>
    <div class="panel">
      <div class="stat"><label>分数</label><div class="value" id="score">0</div></div>
      <div class="stat"><label>等级</label><div class="value" id="level">1</div></div>
      <div class="stat"><label>下一个</label><canvas id="next" width="100" height="100"></canvas></div>
      <div class="stat controls">
        <kbd>←</kbd><kbd>→</kbd> 移动<br>
        <kbd>↑</kbd> 旋转<br>
        <kbd>↓</kbd> 软落<br>
        <kbd>Space</kbd> 硬落<br>
        <kbd>P</kbd> 暂停
      </div>
    </div>
  </div>
  <div class="overlay" id="overlay">
    <h1>游戏结束</h1>
    <button onclick="location.reload()">再来一局</button>
  </div>

  <script>
    const COLS = 10, ROWS = 20, CELL = 30;
    const SHAPES = {
      I: [[0,0],[1,0],[2,0],[3,0]],
      O: [[0,0],[1,0],[0,1],[1,1]],
      T: [[1,0],[0,1],[1,1],[2,1]],
      S: [[1,0],[2,0],[0,1],[1,1]],
      Z: [[0,0],[1,0],[1,1],[2,1]],
      L: [[0,0],[0,1],[1,1],[2,1]],
      J: [[2,0],[0,1],[1,1],[2,1]],
    };
    const COLORS = {
      I:'--piece-I', O:'--piece-O', T:'--piece-T', S:'--piece-S',
      Z:'--piece-Z', L:'--piece-L', J:'--piece-J',
    };
    const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };
    const SPEEDS = [800, 650, 500, 400, 300, 200, 150, 100, 80, 50];

    const board = document.getElementById('board');
    const ctx = board.getContext('2d');
    const nextCanvas = document.getElementById('next');
    const nextCtx = nextCanvas.getContext('2d');

    let grid, piece, next, score, level, lines, dropTimer, dropInterval, paused, gameOver;
    let randomPiece = () => Object.keys(SHAPES)[Math.floor(Math.random() * 7)];

    function newPiece(type) {
      const t = type || randomPiece();
      const cells = SHAPES[t].map(([dx, dy]) => ({ x: 3 + dx, y: dy }));
      return { type: t, cells };
    }

    function collides(cells) {
      return cells.some(({ x, y }) =>
        x < 0 || x >= COLS || y >= ROWS ||
        (y >= 0 && grid[y][x])
      );
    }

    function merge(piece) {
      piece.cells.forEach(({ x, y }) => { if (y >= 0) grid[y][x] = piece.type; });
    }

    function clearLines() {
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (grid[y].every(c => c)) {
          grid.splice(y, 1);
          grid.unshift(Array(COLS).fill(null));
          cleared++;
          y++; // 重检
        }
      }
      if (cleared) {
        lines += cleared;
        score += (SCORE_TABLE[cleared] || 0) * level;
        level = Math.floor(lines / 10) + 1;
        dropInterval = SPEEDS[Math.min(level - 1, SPEEDS.length - 1)];
      }
    }

    function rotate(piece, times = 1) {
      let result = piece;
      for (let i = 0; i < times; i++) {
        const cx = result.cells.reduce((s, c) => s + c.x, 0) / result.cells.length;
        const cy = result.cells.reduce((s, c) => s + c.y, 0) / result.cells.length;
        const rotated = {
          ...result,
          cells: result.cells.map(({ x, y }) => ({
            x: Math.round(cx + (y - cy)),
            y: Math.round(cy - (x - cx)),
          })),
        };
        // 简化 wall kick：±1, ±2
        let ok = !collides(rotated.cells) ? rotated : null;
        if (!ok) {
          for (const dx of [1, -1, 2, -2]) {
            const kicked = { ...rotated, cells: rotated.cells.map(c => ({ x: c.x + dx, y: c.y })) };
            if (!collides(kicked.cells)) { ok = kicked; break; }
          }
        }
        result = ok || result; // 失败保持
      }
      return result;
    }

    function move(dx, dy = 0) {
      const moved = { ...piece, cells: piece.cells.map(c => ({ x: c.x + dx, y: c.y + dy })) };
      if (!collides(moved.cells)) piece = moved;
    }

    function softDrop() { move(0, 1); }
    function hardDrop() {
      while (!collides(piece.cells.map(c => ({ x: c.x, y: c.y + 1 })))) {
        piece.cells = piece.cells.map(c => ({ x: c.x, y: c.y + 1 }));
        score += 2;
      }
      lockPiece();
    }

    function lockPiece() {
      merge(piece);
      clearLines();
      piece = next;
      next = newPiece();
      if (collides(piece.cells)) gameOver = true;
    }

    function tick() {
      if (paused || gameOver) return;
      move(0, 1) || lockPiece();
      if (gameOver) document.getElementById('overlay').classList.add('show');
    }

    function drawCell(c, x, y, ctxRef = ctx) {
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(COLORS[c]).trim();
      ctxRef.fillStyle = color;
      ctxRef.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }

    function render() {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel');
      ctx.fillRect(0, 0, board.width, board.height);
      // 网格
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-line');
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke();
      }
      // 已锁定方块
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
          if (grid[y][x]) drawCell(grid[y][x], x, y);
      // 当前 piece
      piece.cells.forEach(({ x, y }) => drawCell(piece.type, x, y));
      // ghost
      const ghost = { cells: piece.cells.map(c => ({ ...c })) };
      while (!collides(ghost.cells.map(c => ({ ...c, y: c.y + 1 }))))
        ghost.cells = ghost.cells.map(c => ({ ...c, y: c.y + 1 }));
      ctx.globalAlpha = 0.2;
      ghost.cells.forEach(({ x, y }) => drawCell(piece.type, x, y));
      ctx.globalAlpha = 1;
      // 下一个
      nextCtx.clearRect(0, 0, 100, 100);
      SHAPES[next.type].forEach(([dx, dy]) => drawCell(next.type, dx + 1, dy + 1, nextCtx));

      document.getElementById('score').textContent = score;
      document.getElementById('level').textContent = level;
    }

    function init() {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      score = 0; level = 1; lines = 0;
      dropInterval = SPEEDS[0]; paused = false; gameOver = false;
      piece = newPiece();
      next = newPiece();
      document.getElementById('overlay').classList.remove('show');
    }

    document.addEventListener('keydown', e => {
      if (gameOver) return;
      if (e.key === 'p' || e.key === 'P') { paused = !paused; return; }
      if (paused) return;
      switch (e.key) {
        case 'ArrowLeft': move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowDown': move(0, 1); score++; break;
        case 'ArrowUp': piece = rotate(piece, 1); break;
        case ' ': hardDrop(); e.preventDefault(); break;
      }
    });

    init();
    setInterval(() => { tick(); render(); }, dropInterval);
  </script>
</body>
</html>
```

可以直接 `python3 -m http.server` 跑起来玩。

---

## 六、跟直接对话的差别

| 维度 | 直接对话 | opencode + agent-skills |
|------|---------|------------------------|
| 需求对齐 | "做个俄罗斯方块" | spec-driven-development：先 6 个 Q 对齐，规格写下来 |
| 任务拆分 | 一次性写完 | planning-and-task-breakdown：9 个 ticket + 依赖图 |
| 实现节奏 | 一把梭 | incremental-implementation：按拓扑序一个个 ticket 做 |
| 质量保证 | 靠运气 | TDD 红绿循环 + code review |
| 浏览器验证 | 不一定有 | DevTools 实际截图、检查 console |
| Bug 修复 | 头疼医头 | debugging-and-error-recovery：复现 → 隔离 → 假设 → 验证 |
| 知识沉淀 | 散在对话里 | spec + tickets + 测试，都是 git 里的资产 |

最后一个尤其重要。直接对话做完，AI 走了，所有"为什么这么设计"的决策也跟着走了。Skill 流程做完，每一步的决策都在文档里——下次有人接手或者新 session 续上，照着 spec 和 tickets 就能复现。

---

## 七、什么时候**不**用 Skill 流

Ponytail 一回：

- **临时改一行**：直接说"把这个变量名改了"，开 skill 是杀鸡用牛刀
- **一次性脚本**：用完就丢的代码，质量门控的成本高于价值
- **明确只是问个问题**："CSS Grid 和 Flex 怎么选"——不是任务，是请教

判断标准：**这个产出会不会进 git、会不会被未来的我（或别人）读到？** 会，就走 skill 流；不会，直接聊。

---

## 八、跟 Matt Pocock 那套的对比

| | Matt Pocock skills | addyosmani/agent-skills |
|---|---|---|
| 触发方式 | 斜杠命令 `/grill-with-docs` | 自然语言，AGENTS.md 引导自动调 |
| Skill 数量 | ~10 个 | 24 个 |
| 阶段划分 | 自定义（grill / spec / tickets / implement） | 6 阶段生命周期（Define / Plan / Build / Verify / Review / Ship） |
| 适用 agent | Matt Pocock 自己的 CLI | opencode + Claude Code + Cursor + 70+ agent |
| 风格 | 严格按阶段走 | 按意图匹配，自由组合 |
| 学习曲线 | 高（要记命令） | 低（说人话就行） |

两套都很好。如果你想严格按流程走、不让 AI 跑偏，选 Matt Pocock。如果你想轻量、让 agent 自由发挥但有 skill 兜底，选 addyosmani/agent-skills。

---

## 参考

- [agent-skills GitHub](https://github.com/addyosmani/agent-skills)
- [opencode 官网](https://opencode.ai/)
- [opencode GitHub](https://github.com/anomalyco/opencode)
- 上一篇文章：[用 Skill 系统开发 2048：完整的工程流程演示](/blog/skill-system-2048-full-demo/)
- 原理篇：[彻底搞懂 Agent Skills：从原理到实践](/blog/deep-dive-into-agent-skills/)