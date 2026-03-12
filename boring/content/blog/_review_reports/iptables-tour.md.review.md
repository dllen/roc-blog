# 技术评审报告：iptables-tour.md

- 发现问题：高 0 / 中 1 / 低 2
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L173-L375 | 技术准确性 | Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp2c4xsr7w.sh: line 79: syntax error near unexpected token `20、21、20450-20480'<br>/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp2c4xsr7w.sh: line 79: `15.只开放本机的web服务（80）、FTP(20、21、20450-20480)，放行外部主机发住服务器其它端口的应答数据包，将其他入站数据包均予以丢弃处理。' | 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。 | 中 |
| 2 | L2 | 可读性 | 中英文/数字混排缺少空格（风格不统一） | 中文与英文/数字之间加空格；标识符用反引号包裹。 | 低 |
| 3 | L15 | 可读性 | 段落行过长（>160） | 适当换行或拆分段落，提升可读性与 diff 友好度。 | 低 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（中）
<!-- TODO(中): Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp2c4xsr7w.sh: line 79: syntax error near unexpected token `20、21、20450-20480'
/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmp2c4xsr7w.sh: line 79: `15.只开放本机的web服务（80）、FTP(20、21、20450-20480)，放行外部主机发住服务器其它端口的应答数据包，将其他入站数据包均予以丢弃处理。' -->
> **Note:** 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。

### Issue 2（低）
<!-- TODO(低): 中英文/数字混排缺少空格（风格不统一） -->
> **Note:** 中文与英文/数字之间加空格；标识符用反引号包裹。

### Issue 3（低）
<!-- TODO(低): 段落行过长（>160） -->
> **Note:** 适当换行或拆分段落，提升可读性与 diff 友好度。
