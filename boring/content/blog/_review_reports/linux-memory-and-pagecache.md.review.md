# 技术评审报告：linux-memory-and-pagecache.md

- 发现问题：高 0 / 中 4 / 低 1
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L218-L221 | 技术准确性 | Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpd1wzcbjr.sh: line 2: syntax error near unexpected token `newline'<br>/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpd1wzcbjr.sh: line 2: `numactl --cpunodebind=0 --membind=0 <command>' | 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。 | 中 |
| 2 | L298 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 3 | L305 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 4 | L370 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 5 | L472 | 可读性 | 中英文/数字混排缺少空格（风格不统一） | 中文与英文/数字之间加空格；标识符用反引号包裹。 | 低 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（中）
<!-- TODO(中): Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpd1wzcbjr.sh: line 2: syntax error near unexpected token `newline'
/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpd1wzcbjr.sh: line 2: `numactl --cpunodebind=0 --membind=0 <command>' -->
> **Note:** 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。

### Issue 2（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

### Issue 3（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

### Issue 4（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

### Issue 5（低）
<!-- TODO(低): 中英文/数字混排缺少空格（风格不统一） -->
> **Note:** 中文与英文/数字之间加空格；标识符用反引号包裹。
