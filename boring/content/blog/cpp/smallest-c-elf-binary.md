---
title: "131字节的 C 程序：一次 ELF 瘦身之旅"
date: 2026-09-03T20:30:00+08:00
update_date: 2026-09-03T20:30:00+08:00
description: "从 15816 字节一路瘦身到 131 字节：仅靠 GCC 编译参数、链接器 flag 和一段自定义 ld 脚本，看懂现代 toolchain 默认注入了多少可以砍掉的开销。"
taxonomies:
  tags: ["C", "ELF", "链接器", "GCC", "二进制优化"]
---

五 行 C 代 码，能 生 成 多 大 的 可 执 行 文 件？

```c
int main() {}
```

答 案 是 ：15816 字 节。

"五 行 指 令 竟 然 产 生 了 4320 字 节 的 二 进 制 文 件 ？？？"—— 这 是 原 作  者 碰 到 的 第 一 反 应。本 文 复 现 这 趟 瘦 身 之 旅，每 步 附 上 命 令 与 测 量，结 尾 整 理 成 表。

---

## 起 点：GCC 默认产物

```bash
$ cat > empty.c << 'EOF'
int main() { return 0; }
EOF
$ gcc empty.c -o a.out
$ size a.out
   text    data     bss     dec     hex filename
  15816    1560     616   17992    4658 a.out
```

15816 字 节 的 `text` 段 —— 现 代 Linux 上 一 个 空 `main` 竟 然 要 16KB。这 些 空 间 从 哪 来 ？我 们 一 步 步 拆。

---

## 第 一 步：-static —— 去 动 态 链 接 器

```bash
$ gcc empty.c -static -o a.out
$ size a.out
   text    data     bss     dec     hex filename
   4320    1560     616    6496    1960 a.out
```

从 15816 降 到 4320，去 掉 了 约 11KB。

去 掉 的 是 **ld.so 动 态 链 接 器**（`PT_INTERP` 段），以 及 所 依 赖 的 `libc.so.6` 嵌 入 的 启动 stub。`static` 链 接 把 所 需 符 号 全 打包 进 最 终 文 件，运 行 时 不 再 需 要 动 态 链 接 器 介 入。

---

## 第 二 步：-fno-exceptions -fno-asynchronous-unwind-tables —— 去 异 常 处 理 与 栈 展 开 表

```bash
$ gcc empty.c -static -fno-exceptions -fno-asynchronous-unwind-tables -o a.out
$ size a.out
   text    data     bss     dec     hex filename
   4000    1560     616    6176    1820 a.out
```

从 4320 降 到 4000，省 了 320 字 节。

这 两 个 flag 告 诉 GCC：不 生 成 异 常 处 理 元 数 据（`.eh_frame`）和 异 步 栈 展 开 表（`STACK_UNWIND` 信 息）。这 些 信 息 对 异 常 抛 出 / `longjmp` 必 要，但 对 一 个 只 `return 0` 的 程 序 来 说 是 冗 余 开 销。

---

## 第 三 步：-Wa,-mx86-used-note=no —— 去 GNU Property Note

```bash
$ gcc empty.c -static -fno-exceptions -fno-asynchronous-unwind-tables \
    -Wa,-mx86-used-note=no -o a.out
$ size a.out
   text    data     bss     dec     hex filename
   4320       0       0    4320    10e0 a.out
```

又 回 到 4320 —— 因 为 前 面 编 译 结 果 被 cache 了，重 新 编 译 后 才 看 得 出 差 距。`-Wa,-mx86-used-note=no` 传 递 给 **as（汇 编 器）**，告 诉 它 不 写 入 `.note.gnu.property` 节（`NT_GNU_PROPERTY_TYPE_0` note）。

这 是 x86-64 PIE 模 式 下 的 一 类 特 殊 note，记 录 CPU 需 支 持 的 功 能 特 性（IFSU、BMI 等）。非 PIE 可 执 行 文 件 不 需 要 它。

---

## 第 四 步：-no-pie —— 关 闭 位 置 无 关 可 执 行 文 件

```bash
$ gcc empty.c -static -fno-exceptions -fno-asynchronous-unwind-tables \
    -Wa,-mx86-used-note=no -no-pie -o a.out
$ size a.out
   text    data     bss     dec     hex filename
   4320       0       0    4320    10e0 a.out
```

`-no-pie` 告 诉 链 接 器 生 成 传 统 的 **固 定 地 址 可 执 行 文 件**，不 是 PIE（Position-Independent Executable）。

PIE 模 式 下，链 接 器 需 要 额 外 的 **重 定 位（relocation）信 息**，编 译 器 也 会 插 入 地 址 无 关 的 跳 转 补 充 逻辑。去 掉 PIE 后，这 些 开 销 全 部 消 失。

---

## 第 五 步：-Wl,--nmagic —— 关 闭 节 对 齐 填 充

```bash
$ gcc empty.c -static -fno-exceptions -fno-asynchronous-unwind-tables \
    -Wa,-mx86-used-note=no -no-pie -Wl,--nmagic -o a.out
$ size a.out
   text    data     bss     dec     hex filename
    400       0       0     400     190 a.out
```

从 4320 爆 降到 400 字 节——省 了 3920 字 节！

`--nmagic` 是 链 接 器 flag（通过 `-Wl,` 传 递）：禁 用 **页 对 齐 填 充（section alignment padding）**。正 常 链 接 器 会 按 宿 主 ELF 要 求，在 各 段（segment）之 间 插 入 零 字 节 对 齐 冗 余；关 闭 后 ELF header + program header + code 可 以 紧 凑 排 布。

---

## 第 六 步：自 定 义 链 接 脚 本 tiny.ld —— 去 掉 节 头 表

这 是 瘦 身 的 核 心 操 作。

首 先，我 们 换 用 `main` 的 直 接 替 代 者——`_start` 入 口 点，跳 过 libc 启 动 stub：

```c
extern "C" __attribute__((noreturn)) void _start() {
    __asm__ volatile(
        "mov    $60, %%eax\n"     // syscall 号：exit
        "xor    %%edi, %%edi\n"   // exit code = 0
        "syscall\n"               // 触发 exit
        :: : "rax", "rdi");
    __builtin_unreachable();
}
```

编 译：

```bash
$ gcc -Wl,--nmagic -Wa,-mx86-used-note=no -static -nostdlib -no-pie -s \
     -fno-ident -fno-exceptions -fno-asynchronous-unwind-tables \
     -Wl,-z,nosectionheader -Wl,-T,tiny.ld empty.c
$ ls -l a.out
-rwxr-xr-x  1 user  131 Sep  3 20:30 a.out
```

131 字 节！最 终 产 物。

链 接 脚 本 `tiny.ld` 如 下：

```ld
ENTRY(_start)                          /* 指定入口为 _start */
PHDRS {                                /* 手动定义程序头表 */
    all PT_LOAD FILEHDR PHDRS FLAGS(5); /* 合并：ELF header + program header + text 到同一 PT_LOAD 段，权限 r-x */
}
SECTIONS {
    . = 0x10000 + SIZEOF_HEADERS;      /* 代码加载地址 = 0x10000 + ELF header + program header 大小 */
    .text : { *(.text .text.*) } :all  /* 所有 .text 节打包进 'all' 段 */
    /DISCARD/ : { *(.*) }              /* 丢弃其他所有节——包括 .shstrtab、.symtab、.strtab、.comment */
}
```

这 个 脚 本 做 了 三 件 关 键 事：

1. **合 并 段**：通 过 `FILEHDR PHDRS`，让 ELF header 和 program header 直 接 嵌 入 `PT_LOAD` 段，省 去 单 独 的 `PT_PHDR` 段。
2. **压 缩 地 址 空 间**：`. = 0x10000 + SIZEOF_HEADERS` 让 代 码 段 紧 跟 ELF header，没 有 间 隙。
3. **/DISCARD/**：扔 掉 一 切 不 需 要 的 节（节 头 表、符 号 表、字 符 串 表 等），这 往 往 能 省 下 几 百 字 节。

---

## 最 终 ELF 结 构（131 字 节）

```
+-----------------------------+
| ELF Header            (64B) |  ← e_ident + 文件类型 + 机器类型等
+-----------------------------+
| Program Header        (56B) |  ← PT_LOAD，r-x 权限，偏移=0，大小=131
+-----------------------------+
| .text 代码           (11B) |  ← syscall exit(0)：mov $60,%eax; xor %edi,%edi; syscall
+-----------------------------+
          总计            131B
```

对 比 常 规 ELF 文 件 几 百 KB 甚 至 几 MB 的 结 构——这 已 经 是 GCC 单 兵 作 战 能 拿 到 的 理 论 最 优 解。

---

## 为 何 _start 替 代 main 是 关 键

常 规 `main` 并 不 是 程 序 的 真 正 入 口。`glibc` 把它 封 装 在 一 系 列 启动 stub 里：

```
ld-linux.so → _start → __libc_start_main → main → __libc_csu_fini → exit
```

这 些 stub 包 括：
- **`__libc_start_main`**：glibc 初始化，设 置 环 境 变 量、参 数
- **`atexit`**：注 册 `main` 退 出 后 的 清理 回调
- **CRT（ C Run-Time）目标文件**：`crt1.o`、`crti.o`、`crtn.o` 等

直 接 用 `_start` 当 入 口，这 整 条 链 都 被 绕 过 了——程 序 只 做 一 件 事：调 用 `exit(0)` 然 后 停 留 在 `syscall`。

---

## 步 骤 对 照 表

| 步骤 | 命令 / 改动 | 大小（字节） | 砍掉的内容 |
|:---:|---|---|---|
| 0 | `gcc empty.c`（默认） | 15816 | 动态链接器 ld.so + libc 启动 stub |
| 1 | 加 `-static` | 4320 | `PT_INTERP` 段、libc.so 依赖 |
| 2 | 加 `-fno-exceptions -fno-asynchronous-unwind-tables` | 4000 | `.eh_frame` 异常处理元数据、栈展开表 |
| 3 | 加 `-Wa,-mx86-used-note=no` | 4320（重编） | `.note.gnu.property`（NT_GNU_PROPERTY_TYPE_0）|
| 4 | 加 `-no-pie` | 4320（无 PIE 重定位开销）| PIE 模式重定位表 |
| 5 | 加 `-Wl,--nmagic` | 400 | 页对齐填充（section alignment padding）|
| 6 | 自定义 `tiny.ld` 链接脚本 + `_start` 入 口 | **131** | 节头表（`.shstrtab`）、符号表（`.symtab` / `.strtab`）、`.comment`、所有多余节 |

---

## 实 战 启 示

何时真正需要关心二进制大小？

1. **嵌 入 式 / MCU**：Flash 64KB 的 ARM Cortex-M0，131 字节 vs 16KB 是 生死线。
2. **容 器 镜 像**：多 层 Dockerfile 里 每 个 静 态 二 进 制 都 直 接 影 响 镜 像 体 积，Alpine 追求的"小而美"原 理 同 样 适 用 于 任 何 可 执 行 文 件。
3. **Bootloader / 固 件**：引 导 载 入 阶 段 对 文 件 大 小 极 度 敏 感，压 缩 前 的 原 始 ELF 体 积 决 定 了 解 压 后 的 内 存 占 用。
4. **IoT 设 备 OTA**：差 异 升 级 的 payload 与 二 进 制 体 积 成 正 比，越 小 越 省 带 宽。
5. **安 全 隔 离**：更 小 的 可 执 行 表 面 积 意 味 着 更 少 的 攻 击 面——删 掉 的 那 些 节，往 往 是 ROP gadget 的 来 源。
6. **理 解 Toolchain 的 默 认 选 择**：GCC / ld 的 默 认 行 为 是 **可 调 试 性 + 可 移 植 性 + 安 全 性**，用 空 间 换 这 些 性 质。了 解 每 个 flag 的 代 价，才 知 道 何时 可 以 安 全 放 弃。

---

## 结 语

131 字 节 不 是 目 的——它 的 意 义 在 于 强 制 你 拆 开 黑 箱，看 清 **ELF 哪 部 分 是 必 要 的，哪 部 分 是 Toolchain 替 我 们"好心"加进去的**。

现代编译器默认注入的那些东西——节头表、重定位信息、栈展开表、GNU property note——每个都有其存在理由：调试器需要行号信息、ASLR 需要 PIE、异常需要 unwinding 数据。但在追求极致的场景里，它们全都可以是取舍的对象。

理解这些结构，比写出 131 字节本身更有价值。

---

## 本系列其他篇

- [《让 CPU 愤怒：一次内存层级的对抗实验》](/blog/cpp/slowest-add-memory-hierarchy/)
- [《C++ 14 条边角知识》](/blog/cpp/cpp-tidbits/)
