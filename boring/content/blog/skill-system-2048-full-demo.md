---
title: "用 Skill 系统开发 2048：完整的工程流程演示"
date: 2026-08-07
description: "以开发一个网页版 2048 游戏为例，完整演示 Matt Pocock Skill 系统的工作流程：从 grill 对齐、spec 生成、ticket 拆分到 TDD 实现。"
tldr: "Skill 流程的核心价值是把质量门控前置——review 在 commit 前而不是上线后，决策在动手前而不是做完才发现错。"
taxonomies:
  tags: ["AI", "LLM", "Coding Agent", "TDD", "Engineering", "2048"]
---

用 AI 写代码，直接对话当然可以更快地拿到结果。但当项目需要跨 session 维护、需要多人交接、需要稳定质量时，直接对话的代价就开始累积。

本文用开发一个网页版 2048 游戏，完整演示 Skill 系统的工作流程。每一个阶段都给出真实产出，不是概念图。

---

## 起点：进目录，跑 setup

```bash
cd 2048-game
/setup-matt-pocock-skills
```

这一步问你三个问题：issue tracker 选哪个（GitHub / Linear / 本地文件）、triage 用哪些标签、文档放哪里。选本地文件即可，零配置。

---

## 阶段一：/grill-with-docs — 对齐想法

直接让 AI 写 2048，它大概率直接开干，做完你发现"UI 风格不是我想要的"或者"分数没有持久化"。

`/grill-with-docs` 的做法：先问清楚，再动手。

```
/grill-with-docs

❓ Q1 — 交付形式：单文件 HTML 还是分离成三个文件？
  ➡️ 推荐：单文件，开发最快

❓ Q2 — 移动方式：键盘方向键、触屏滑动、还是两者？
  ➡️ 推荐：先键盘，触屏作为 v2

❓ Q3 — 分数机制：仅当前分数，还是 + 最高分持久化到 localStorage？
  ➡️ 推荐：两者都要，刷新不丢最高分

❓ Q4 — Game Over 处理：模态框还是覆盖层 + 按钮？
  ➡️ 推荐：覆盖层，不需要打断

❓ Q5 — UI 风格：纯色、渐变、还是图标？
  ➡️ 推荐：2n 对应不同背景色，2048 金色，经典配色

❓ Q6 — 分数动画：+N 飘字还是静默更新？
  ➡️ 推荐：先静默，后续可加
```

每条问题都附推荐答案——这是**强迫 AI 自己先想清楚**的设计。Grilling 结束后，`CONTEXT.md` 写入项目：

```markdown
# 2048 Game — 项目术语表

## 核心概念
- **格子 (Cell)**：棋盘上 4×4 的 16 个固定位置
- **砖块 (Tile)**：带数字的移动方块，初始为 2 或 4
- **合并 (Merge)**：同数字碰撞后合并为 2n

## 技术约定
- 单文件交付：index.html，内嵌 CSS/JS
- 输入：键盘方向键；触屏 v2 再加
- 分数：当前 + 最高分，localStorage 持久化
- Game Over：覆盖层 + 按钮，无模态框
```

这个文件是后续所有 decision 的参照系，后续 session 里 AI 读它，用同样的术语跟你沟通。

---

## 阶段二：/to-spec — 生成规格文档

```
/to-spec
```

输出 `SPEC.md`，写入 `.scratch/` 目录：

```markdown
# 2048 游戏规格说明

## 功能范围 (v1)

### 核心机制
- 4×4 网格，初始随机 2 个砖块（2 或 4，各 50%）
- 方向键控制滑动
- 同数字合并为 2n，合并计分
- 有效移动后随机空格生成新砖块
- 四方向均无效时 Game Over

### 分数系统
- 当前分数：累加每次合并得分
- 最高分：localStorage 读写，跨 session 保持

### 游戏控制
- New Game 按钮：重置棋盘和当前分，最高分保持
- Game Over 覆盖层 + Try Again 按钮

## 验收标准
- [ ] 初始状态两个随机砖块
- [ ] 方向键正确触发滑动
- [ ] 同数字合并正确，分数正确累加
- [ ] 一次滑动中每砖块只合并一次
- [ ] 有效移动后才生成新砖块
- [ ] 最高分持久化，刷新保留
- [ ] 无法移动时显示 Game Over
- [ ] New Game 重置棋盘和当前分
```

---

## 阶段三：/to-tickets — 拆成可验证的 tickets

```
/to-tickets
```

把 spec 拆成 tracer-bullet tickets：

```
tickets/
  01-grid-structure.md     # blocking: none
  02-tile-rendering.md     # blocking: 01
  03-movement-logic.md     # blocking: 02
  04-merge-logic.md        # blocking: 03
  05-spawn-logic.md        # blocking: 03
  06-score-system.md       # blocking: 04
  07-game-over-detection.md # blocking: 05, 06
  08-ui-polish.md          # blocking: 07
```

每个 ticket 独立可验证，不是"写前端""写后端"这种大块

---

## 阶段四：/implement — TDD 红绿循环

以 **ticket 04：合并逻辑** 为例，看 TDD 循环怎么跑。

### Red：写 failing test

```javascript
// 合并两个相邻同值砖块
test("merge two adjacent same-value tiles", () => {
  const result = slideAndMerge([2, 2, null, null]);
  expect(result).toEqual([4, null, null, null]);
});

// 合并只发生一次，不能链式合并
test("merged tile does not merge again in same move", () => {
  const result = slideAndMerge([2, 2, 2, 2]);
  expect(result).toEqual([4, 4, null, null]); // 不是 [8, null, null, null]
});

// 合并计分正确
test("merge score equals merged value", () => {
  const { score } = slideAndMergeWithScore([4, 4, null, null]);
  expect(score).toBe(8);
});
```

跑测试 → **Red**。

### Green：写最小实现

```javascript
function slideAndMerge(row) {
  const tiles = row.filter(v => v !== null);
  const result = [];
  let score = 0;
  let i = 0;
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      result.push(merged);
      score += merged;
      i += 2;
    } else {
      result.push(tiles[i]);
      i++;
    }
  }
  while (result.length < 4) result.push(null);
  return result;
}
```

跑测试 → **Green**。最小实现，不过度设计

### Code Review：自检

```
## Standards
- [x] 变量命名清晰（tiles, merged, score）
- [ ] 4 是 magic number，应提取为 SIZE 常量

## Spec
- [x] 合并两个相邻同值砖块
- [x] 一次滑动中每砖块只合并一次
- [x] 计分正确
```

Commit。下一个 ticket。

---

## 最终交付：完整 2048 代码

按 ticket 顺序串起来，大约 280 行单文件 HTML：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2048</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Clear Sans", "Helvetica Neue", Arial, sans-serif;
      background: #faf8ef;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container { width: 500px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    h1 { font-size: 72px; font-weight: bold; color: #776e65; }
    .scores { display: flex; gap: 10px; }
    .score-box { background: #bbada0; color: #eee4da; padding: 8px 20px; border-radius: 6px; text-align: center; min-width: 80px; }
    .score-box label { font-size: 13px; text-transform: uppercase; }
    .score-box span { display: block; font-size: 24px; font-weight: bold; }
    button { background: #8f7a66; color: #f9f6f2; border: none; border-radius: 6px; padding: 10px 20px; font-size: 16px; cursor: pointer; }
    .board { background: #bbada0; border-radius: 6px; padding: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; position: relative; }
    .cell { aspect-ratio: 1; background: rgba(238, 228, 218, 0.35); border-radius: 4px; }
    .tiles { position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; pointer-events: none; }
    .tile { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: bold; border-radius: 4px; }
    .overlay { position: absolute; inset: 0; background: rgba(238, 228, 218, 0.73); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; display: none; }
    .overlay.show { display: flex; }
    .overlay h2 { font-size: 48px; color: #776e65; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>2048</h1>
      <div class="scores">
        <div class="score-box"><label>分数</label><span id="score">0</span></div>
        <div class="score-box"><label>最高</label><span id="best">0</span></div>
      </div>
    </header>
    <button id="new-game">新游戏</button>
    <div class="board" id="board">
      <!-- 背景格子 -->
      <div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div>
      <div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div>
      <div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div>
      <div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div>
      <!-- 砖块层 -->
      <div class="tiles" id="tiles"></div>
      <!-- Game Over 覆盖层 -->
      <div class="overlay" id="overlay">
        <h2>游戏结束</h2>
        <button id="retry">再来一局</button>
      </div>
    </div>
  </div>

  <script>
    const SIZE = 4;
    const COLORS = {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
    };
    let grid = [], score = 0;

    function init() {
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      score = 0;
      spawnTile(); spawnTile();
      updateScore(); render();
      document.getElementById('overlay').classList.remove('show');
    }

    function spawnTile() {
      const empty = [];
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (grid[r][c] === null) empty.push([r, c]);
      if (!empty.length) return;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }

    function slideRowLeft(row) {
      const tiles = row.filter(v => v !== null);
      const result = [], gained = 0;
      let i = 0;
      while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
          const merged = tiles[i] * 2;
          result.push(merged);
          gained += merged;
          i += 2;
        } else { result.push(tiles[i]); i++; }
      }
      while (result.length < SIZE) result.push(null);
      return { row: result, score: gained };
    }

    function rotate(g, times = 1) {
      let out = g.map(r => [...r]);
      for (let t = 0; t < times % 4; t++)
        out = out[0].map((_, i) => out.map(row => row[SIZE - 1 - i]));
      return out;
    }

    function move(dir) {
      const rot = { left: 0, up: 1, right: 2, down: 3 }[dir];
      let g = rotate(grid, rot), moved = false, gained = 0;
      const newGrid = g.map(row => {
        const { row: newRow, score: s } = slideRowLeft(row);
        gained += s;
        if (JSON.stringify(row) !== JSON.stringify(newRow)) moved = true;
        return newRow;
      });
      grid = rotate(newGrid, 4 - rot);
      if (!moved) return false;
      score += gained; updateScore(); spawnTile(); render();
      if (isGameOver()) document.getElementById('overlay').classList.add('show');
      return true;
    }

    function isGameOver() {
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          if (grid[r][c] === null) return false;
          if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return false;
          if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return false;
        }
      return true;
    }

    function updateScore() {
      document.getElementById('score').textContent = score;
      const best = parseInt(localStorage.getItem('2048-best') || '0');
      if (score > best) { localStorage.setItem('2048-best', score); document.getElementById('best').textContent = score; }
    }

    function render() {
      const tilesEl = document.getElementById('tiles');
      tilesEl.innerHTML = '';
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          const val = grid[r][c];
          if (!val) continue;
          const tile = document.createElement('div');
          tile.className = 'tile';
          tile.textContent = val;
          tile.style.background = COLORS[val] || '#3c3a32';
          tile.style.color = val > 4 ? '#f9f6f2' : '#776e65';
          if (val > 100) tile.style.fontSize = '36px';
          if (val > 1000) tile.style.fontSize = '28px';
          tilesEl.appendChild(tile);
        }
      document.getElementById('best').textContent = localStorage.getItem('2048-best') || '0';
    }

    document.addEventListener('keydown', e => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    });
    document.getElementById('new-game').onclick = init;
    document.getElementById('retry').onclick = init;
    init();
  </script>
</body>
</html>
```

---

## 对比：Skill 流程带来了什么

| 维度 | 直接对话 | Skill 流程 |
|------|---------|-----------|
| 交付形式 | AI 自己决定 | 提前对齐，单文件 |
| 配色方案 | 随机 | 查表确认，经典配色 |
| 分数持久化 | 可能漏 | 写入 spec，ticket 06 验收 |
| Game Over | AI 判断 | spec 明确，覆盖层方案 |
| 边界情况 | 靠 AI 自检 | 合并只一次等 case 写入测试 |
| 交付质量 | 看 AI 当下状态 | 每个 ticket 有 code review |

最后那个 280 行代码，用 Skill 流程做完，每个 commit 都是可验证的小步。Review 的时候不是看一段大代码对不对，而是看一个 ticket 的实现是否忠实于 spec。质量门控前置了，而不是留给上线后。