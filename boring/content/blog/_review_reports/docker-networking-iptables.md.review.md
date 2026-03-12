# 技术评审报告：docker-networking-iptables.md

- 发现问题：高 0 / 中 1 / 低 1
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L225-L253 | 技术准确性 | Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp6kn_i1ee.sh: line 16: syntax error near unexpected token `('<br>/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp6kn_i1ee.sh: line 16: `Chain PREROUTING (policy ACCEPT)' | 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。 | 中 |
| 2 | L2 | 可读性 | 中英文/数字混排缺少空格（风格不统一） | 中文与英文/数字之间加空格；标识符用反引号包裹。 | 低 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（中）
<!-- TODO(中): Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp6kn_i1ee.sh: line 16: syntax error near unexpected token `('
/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp6kn_i1ee.sh: line 16: `Chain PREROUTING (policy ACCEPT)' -->
> **Note:** 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。

### Issue 2（低）
<!-- TODO(低): 中英文/数字混排缺少空格（风格不统一） -->
> **Note:** 中文与英文/数字之间加空格；标识符用反引号包裹。
