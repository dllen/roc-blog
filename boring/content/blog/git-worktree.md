---
title: "Git Worktree 实践指南"
date: 2026-08-08T19:30:00+08:00
update_date: 2026-08-08T19:30:00+08:00
description: "用 Git Worktree 同时维护多个工作目录，告别 stash 与反复切换分支的低效循环。"
taxonomies:
  tags: [Git, 开发工具, 工作流]
---

在维护一个稍具规模的仓库时，我最常遇到的烦躁时刻不是代码冲突，而是“分支切换”：

- 功能分支写到一半，产品经理过来说“先帮我看一眼线上这个 bug”；
- 刚切到 `main` 准备 review 同事的 PR，IDE 立刻因为依赖版本不同而重新索引；
- 想跑一个耗时 10 分钟的基准测试，却舍不得放下当前未提交的改动；
- 只好 `git stash push -m "wip"`，处理完再 `git stash pop`，然后发现 stash 堆成了小山。

Git Worktree 就是为这种场景设计的。它允许同一个仓库拥有多个独立的工作目录，每个目录可以关联不同的分支，却共享同一个 `.git` 对象库。这篇文章会覆盖它的核心概念、常用命令、实战场景以及我踩过的坑。

## 1. 核心概念：一个仓库，多个工作目录

在普通 Git 仓库里，工作目录（working tree）和 `.git` 目录是一一对应的。`git worktree` 打破了这个限制：

- 一个仓库可以有一个 **main worktree**（你最初 `git clone` 出来的那个目录）和多个 **linked worktree**；
- 所有 worktree 共享同一个对象库，因此不重复占用磁盘空间；
- 每个 linked worktree 内部有一个 `.git` 文件，里面只保存 `gitdir` 指针，指向主仓库的 `.git/worktrees/<id>`；
- 不同 worktree 不能同时检出同一个分支（Git 会拒绝，避免工作树状态互相覆盖），但可以用同一个分支的不同 commit（detached HEAD）。

简单理解：Worktree 是“分支级别的多窗口”，而不是“重新 clone 一份代码”。

## 2. 命令速查

最常用的命令就这几条，记不住时可以回来查：

```bash
# 创建新的 worktree，默认以当前分支名作为目录名
git worktree add ../my-feature

# 指定目录和分支（分支不存在则自动创建）
git worktree add -b hotfix/123 ../hotfix origin/main

# 查看所有 worktree
git worktree list

# 删除 worktree（不会删除分支，仅移除目录和登记信息）
git worktree remove ../my-feature

# 移动 worktree 目录
git worktree move ../my-feature ../my-feature-v2

# 清理已经不存在目录的登记记录
git worktree prune

# 锁定 worktree，防止被误删除或清理
git worktree lock ../my-feature
git worktree unlock ../my-feature
```

## 3. 典型使用场景

### 3.1 代码审查不中断当前工作

我正在 `feature/ai-summary` 上写代码，同事让我 review 他的 `feature/new-auth`。

```bash
git worktree add ../roc-blog-review feature/new-auth
cd ../roc-blog-review
# 查看代码、运行测试、留下 review 意见
cd -
git worktree remove ../roc-blog-review
```

主工作目录完全不动，review 结束后整个世界还是原来的样子。

### 3.2 紧急热修复

线上告警，需要基于 `main` 修一个 hotfix。常规做法是 `git stash` 然后切分支，但 Worktree 更干脆：

```bash
git worktree add -b hotfix/2026-08-08 ../hotfix origin/main
cd ../hotfix
# 修改 -> 提交 -> push -> 发 PR
git push origin hotfix/2026-08-08
cd ..
git worktree remove ../hotfix
```

### 3.3 长时间任务与后台构建

某些仓库构建一次需要十几分钟，我不想占用当前窗口等待：

```bash
git worktree add ../roc-blog-build release/v2.3
cd ../roc-blog-build
nohup zola build -o ../build-output > build.log 2>&1 &
```

我可以在原目录继续写代码，另一个目录在后台慢慢构建。

### 3.4 探索性实验与原型

想验证一个大胆的重构，但不确定能不能成功：

```bash
git worktree add -b experiment/refactor-cache ../experiment
cd ../experiment
# 开始拆东墙补西墙
```

即使改烂了，直接删除目录即可，主工作目录毫发无伤。

## 4. 实战：从创建到清理

假设仓库路径是 `~/Work/roc-blog`，我们新建一个并排的 worktree：

```bash
$ cd ~/Work/roc-blog
$ git worktree add ../roc-blog-draft -b draft/git-worktree
Preparing worktree (new branch 'draft/git-worktree')
HEAD is now at a1b2c3d 上次提交

$ git worktree list
/Users/shichaopeng/Work/roc-blog      a1b2c3d [main]
/Users/shichaopeng/Work/roc-blog-draft a1b2c3d [draft/git-worktree]
```

此时 `~/Work/roc-blog-draft` 是一个完整的工作目录，可以独立编辑、推送。完成后清理：

```bash
$ cd ~/Work/roc-blog
$ git worktree remove ../roc-blog-draft
$ git branch -D draft/git-worktree        # 如果不再需要该分支
```

注意：`git worktree remove` 会删除目录本身，但不会删除分支。如果分支还想保留，可以只执行 remove。

## 5. 进阶技巧

### 5.1 用 bare 仓库作为“大本营”

对于经常需要多个 worktree 的项目，可以先 clone 一个 bare 仓库：

```bash
git clone --bare git@github.com:dllen/roc-blog.git roc-blog.git
cd roc-blog.git
git worktree add ../roc-blog-main main
git worktree add -b feature/xyz ../roc-blog-feature
```

这样中央目录只保存 `.git` 数据，没有工作树，管理起来更清爽。

### 5.2 锁定与修复

如果 worktree 目录位于外部磁盘或网络存储，Git 在清理时可能误判它“已消失”。可以手动锁定：

```bash
git worktree lock ../roc-blog-feature
git worktree unlock ../roc-blog-feature
```

如果目录被手动删除，Git 记录还在，用 `prune` 或 `remove --force` 清理：

```bash
git worktree prune            # 安全清理已不存在的目录
git worktree remove --force ../roc-blog-feature
```

### 5.3 与 IDE 和 Git hooks 的兼容

- 大多数现代 IDE（VS Code、IntelliJ、Cursor）都能识别 worktree 目录作为独立项目打开；
- `.git` 在主仓库，linked worktree 里的 `.git` 是文件不是目录，依赖 `git rev-parse --git-dir` 的脚本通常无感；
- 但 **Git hooks** 是按 `core.hooksPath` 或 `.git/hooks` 生效的，linked worktree 共享同一套 hooks，如果 hooks 里硬编码了仓库路径，需要改成相对路径或 Git 变量；
- 子模块（submodule）在 worktree 中行为较复杂，子模块默认不会自动初始化，需要手动处理。

### 5.4 避免“同一个分支被多个 worktree 检出”

Git 会阻止两个 worktree 同时关联同一个分支，因为那样会导致 HEAD 指针冲突。解决方式：

- 用不同的分支；
- 或者使用 detached HEAD：`git worktree add ../foo <commit-sha>`。

## 6. Worktree vs 其他方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| `git stash` | 零额外空间 | 容易堆积，状态恢复易出错，无法并行 |
| 重新 `git clone` | 完全隔离 | 重复下载历史，占用双倍磁盘，跨仓库操作麻烦 |
| 直接切换分支 | 最简单 | 中断当前上下文，依赖/索引需要重建 |
| `git worktree` | 共享对象库、独立目录、并行工作 | 需要管理多个目录，不能同分支双检出 |

对“需要并行处理两个以上分支”的场景，Worktree 通常是最平衡的解法。

## 7. checklist：何时该用 Worktree？

- [ ] 需要 review 别人代码，但不想 stash 自己未完成的改动；
- [ ] 线上突发 bug，需要立刻基于 main 修一个 hotfix；
- [ ] 运行长时间构建/测试，想不阻塞当前编辑窗口；
- [ ] 想做一个破坏性实验，失败后能一键删除；
- [ ] 同一个仓库需要维护多个长期发布分支，频繁切换成本太高。

## 8. 结语

Git Worktree 不是银弹，但它把“分支切换”从一种中断变成了一种并行的选择。当你开始把 `git worktree add` 当作开新标签页而不是换房间时，工作的流畅度会明显提升。下次再想 `git stash` 的时候，不妨试试先 `git worktree add`。

---

参考命令：`git worktree --help`，`git help worktree`
