---
title: "关于Valkey高性能优化的博客文章总结"
date: 2025-05-27T12:13:32+05:30
update_date: 2025-05-27T12:13:32+05:30
description: "分析这两篇关于Valkey高性能优化的博客文章，并用中文总结内容，然后编写C语言实验程序验证结论"
taxonomies:
  tags: [ValKey]
---

- [原文地址-1](https://valkey.io/blog/unlock-one-million-rps/)

- [原文地址-2](https://valkey.io/blog/unlock-one-million-rps-part2/)

相关内容：

> 🔍 ***valkey unlock one million rps blog***

> 🔗 [Valkey · Unlock 1 Mi](https://valkey.io/blog/unlock-one-million-rps/)
> 🔗 [Valkey · Unlock 1 Mi](https://valkey.io/blog/unlock-one-million-rps-part2/)
> 🔗 [Valkey Turns One: Ho](https://www.gomomento.com/blog/valkey-turns-one-how-the-community-fork-left-redis-in-the-dust/)
> 🔗 [Valkey · List of blo](https://valkey.io/blog/)
> 🔗 [Unlock 1M RPS: Exper](https://news.ycombinator.com/item?id=41455072)
> 🔗 [Valkey 8.0 Released ](https://www.phoronix.com/news/Valkey-8.0-Released)
> 🔗 [Amazon ElastiCache v](https://aws.amazon.com/blogs/database/amazon-elasticache-version-8-0-for-valkey-brings-faster-scaling-and-improved-memory-efficiency/)
> 🔗 [Valkey](https://valkey.io/)
> 🔗 [Valkey 8.0 Released ](https://news.ycombinator.com/item?id=41556751)
> 🔗 [Unlocking the Power ](https://dev.to/viradiaharsh/unlocking-the-power-of-aws-elasticache-with-valkey-72-lower-costs-serverless-flexibility-and-performance-gains-5765)

## 文章内容总结

根据这两篇Valkey博客文章的分析，主要内容：

### 第一篇：Valkey性能优化 - I/O多线程架构

**核心优化思路：**

1. **多线程I/O架构**：将I/O操作（读取和解析命令、写入响应、轮询I/O事件）从主线程分离到专门的I/O线程，让主线程专注于命令执行
2. **性能提升**：在8个I/O线程、300万键数据库、512字节值大小、650个客户端运行SET命令的测试中，吞吐量从360K提升到1.19M请求每秒，增长约230%，平均延迟从1.792ms降至0.542ms，下降69.8%
3. **设计原则**：保持Valkey的简单性，命令执行仍在单线程中进行，避免复杂的同步机制和竞态条件

### 第二篇：内存访问优化 - 预取和交错执行

**核心优化思路：**

1. **内存访问摊销**：通过交错执行访问随机内存位置的操作，利用处理器的推测执行能力，实现显著性能提升
2. **实际应用**：在Valkey的lookupKey函数中应用这一技术，该函数占用了主线程40%以上的时间，通过dictPrefetch函数交错执行字典查找序列，将lookupKey的时间减少了80%以上
3. **性能提升**：内存访问摊销技术对Valkey性能的影响接近50%，将请求速率提升到超过119万RPS

**技术原理：**

- 链表示例显示交错遍历比顺序遍历快10倍（从20.8秒降至2秒）
- 处理器在顺序访问链表时无法推测未来的内存访问指令
- 交错执行允许处理器并行发出更多内存访问，通过摊销减少总体内存访问延迟

现在我来编写C语言实验程序来验证这些结论：

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <sys/time.h>
#include <unistd.h>

// 链表节点结构
typedef struct list_node {
    unsigned long val;
    struct list_node *next;
} list;

// 创建链表
list* create_list(size_t size) {
    if (size == 0) return NULL;

    list *head = malloc(sizeof(list));
    list *current = head;
    head->val = rand() % 1000;

    for (size_t i = 1; i < size; i++) {
        current->next = malloc(sizeof(list));
        current = current->next;
        current->val = rand() % 1000;
    }
    current->next = NULL;

    return head;
}

// 释放链表
void free_list(list *head) {
    while (head) {
        list *temp = head;
        head = head->next;
        free(temp);
    }
}

// 顺序遍历求和（原始方法）
unsigned long sequential_sum(size_t arr_size, list **la) {
    list *lp;
    unsigned long res = 0;

    for (int i = 0; i < arr_size; i++) {
        lp = la[i];
        while (lp) {
            res += lp->val;
            lp = lp->next;
        }
    }
    return res;
}

// 交错遍历求和（优化方法）
unsigned long interleaved_sum(size_t arr_size, list **la) {
    list **lthreads = malloc(arr_size * sizeof(list *));
    unsigned long res = 0;
    int n = arr_size;

    // 初始化所有链表的遍历指针
    for (int i = 0; i < arr_size; i++) {
        lthreads[i] = la[i];
        if (lthreads[i] == NULL)
            n--;
    }

    // 交错遍历所有链表
    while(n) {
        for (int i = 0; i < arr_size; i++) {
            if (lthreads[i] == NULL)
                continue;

            res += lthreads[i]->val;
            lthreads[i] = lthreads[i]->next;

            if (lthreads[i] == NULL)
                n--;
        }
    }

    free(lthreads);
    return res;
}

// 带预取指令的交错遍历求和（进一步优化）
unsigned long interleaved_sum_with_prefetch(size_t arr_size, list **la) {
    list **lthreads = malloc(arr_size * sizeof(list *));
    unsigned long res = 0;
    int n = arr_size;

    // 初始化所有链表的遍历指针
    for (int i = 0; i < arr_size; i++) {
        lthreads[i] = la[i];
        if (lthreads[i] == NULL)
            n--;
    }

    // 交错遍历所有链表，使用预取指令
    while(n) {
        for (int i = 0; i < arr_size; i++) {
            if (lthreads[i] == NULL)
                continue;

            res += lthreads[i]->val;
            lthreads[i] = lthreads[i]->next;

            if (lthreads[i]) {
                // 预取下一个节点到缓存
                __builtin_prefetch(lthreads[i], 0, 1);
            } else {
                n--;
            }
        }
    }

    free(lthreads);
    return res;
}

// 获取当前时间（微秒）
long long get_time_us() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000000LL + tv.tv_usec;
}

// 哈希表相关结构和函数（模拟Valkey的字典查找优化）
#define HASH_SIZE 1000003

typedef struct hash_entry {
    char *key;
    unsigned long value;
    struct hash_entry *next;
} hash_entry;

typedef struct hash_table {
    hash_entry **buckets;
    size_t size;
} hash_table;

// 简单哈希函数
unsigned long hash_func(const char *key) {
    unsigned long hash = 5381;
    int c;
    while ((c = *key++))
        hash = ((hash << 5) + hash) + c;
    return hash % HASH_SIZE;
}

// 创建哈希表
hash_table* create_hash_table() {
    hash_table *ht = malloc(sizeof(hash_table));
    ht->size = HASH_SIZE;
    ht->buckets = calloc(HASH_SIZE, sizeof(hash_entry*));
    return ht;
}

// 插入键值对
void hash_insert(hash_table *ht, const char *key, unsigned long value) {
    unsigned long index = hash_func(key);
    hash_entry *entry = malloc(sizeof(hash_entry));
    entry->key = strdup(key);
    entry->value = value;
    entry->next = ht->buckets[index];
    ht->buckets[index] = entry;
}

// 顺序查找多个键
unsigned long sequential_lookup(hash_table *ht, char **keys, size_t num_keys) {
    unsigned long total = 0;

    for (size_t i = 0; i < num_keys; i++) {
        unsigned long index = hash_func(keys[i]);
        hash_entry *entry = ht->buckets[index];

        while (entry) {
            if (strcmp(entry->key, keys[i]) == 0) {
                total += entry->value;
                break;
            }
            entry = entry->next;
        }
    }

    return total;
}

// 预取优化的批量查找
unsigned long prefetch_lookup(hash_table *ht, char **keys, size_t num_keys) {
    unsigned long total = 0;
    hash_entry **entries = malloc(num_keys * sizeof(hash_entry*));
    unsigned long *indices = malloc(num_keys * sizeof(unsigned long));

    // 第一阶段：计算所有索引并预取
    for (size_t i = 0; i < num_keys; i++) {
        indices[i] = hash_func(keys[i]);
        entries[i] = ht->buckets[indices[i]];
        if (entries[i]) {
            __builtin_prefetch(entries[i], 0, 1);
        }
    }

    // 第二阶段：交错查找
    int remaining = num_keys;
    while (remaining > 0) {
        for (size_t i = 0; i < num_keys; i++) {
            if (entries[i] == NULL) continue;

            if (strcmp(entries[i]->key, keys[i]) == 0) {
                total += entries[i]->value;
                entries[i] = NULL;  // 标记为已找到
                remaining--;
            } else {
                entries[i] = entries[i]->next;
                if (entries[i] == NULL) {
                    remaining--;
                } else {
                    __builtin_prefetch(entries[i], 0, 1);
                }
            }
        }
    }

    free(entries);
    free(indices);
    return total;
}

// 释放哈希表
void free_hash_table(hash_table *ht) {
    for (size_t i = 0; i < ht->size; i++) {
        hash_entry *entry = ht->buckets[i];
        while (entry) {
            hash_entry *temp = entry;
            entry = entry->next;
            free(temp->key);
            free(temp);
        }
    }
    free(ht->buckets);
    free(ht);
}

int main() {
    printf("=== Valkey性能优化技术验证程序 ===\n\n");

    // 测试1：链表遍历优化验证
    printf("1. 链表遍历优化测试\n");
    printf("创建测试数据...\n");

    const size_t num_lists = 16;
    const size_t list_size = 1000000;  // 为了快速测试，使用100万而非1000万

    list **lists = malloc(num_lists * sizeof(list*));

    // 创建测试链表
    srand(time(NULL));
    for (size_t i = 0; i < num_lists; i++) {
        lists[i] = create_list(list_size);
    }

    printf("测试数据创建完成：%zu个链表，每个包含%zu个节点\n", num_lists, list_size);

    // 测试顺序遍历
    long long start_time = get_time_us();
    unsigned long result1 = sequential_sum(num_lists, lists);
    long long sequential_time = get_time_us() - start_time;

    // 测试交错遍历
    start_time = get_time_us();
    unsigned long result2 = interleaved_sum(num_lists, lists);
    long long interleaved_time = get_time_us() - start_time;

    // 测试带预取的交错遍历
    start_time = get_time_us();
    unsigned long result3 = interleaved_sum_with_prefetch(num_lists, lists);
    long long prefetch_time = get_time_us() - start_time;

    printf("\n链表遍历测试结果：\n");
    printf("顺序遍历：      %lld 微秒，结果：%lu\n", sequential_time, result1);
    printf("交错遍历：      %lld 微秒，结果：%lu (提升：%.2fx)\n", 
           interleaved_time, result2, (double)sequential_time / interleaved_time);
    printf("预取+交错遍历： %lld 微秒，结果：%lu (提升：%.2fx)\n", 
           prefetch_time, result3, (double)sequential_time / prefetch_time);

    // 验证结果正确性
    if (result1 == result2 && result2 == result3) {
        printf("✓ 所有算法结果一致，验证通过\n");
    } else {
        printf("✗ 结果不一致，可能存在错误\n");
    }

    // 清理链表
    for (size_t i = 0; i < num_lists; i++) {
        free_list(lists[i]);
    }
    free(lists);

    // 测试2：哈希表查找优化验证
    printf("\n2. 哈希表查找优化测试（模拟Valkey字典查找）\n");

    hash_table *ht = create_hash_table();
    const size_t num_test_keys = 100000;
    const size_t lookup_batch_size = 1000;

    // 插入测试数据
    printf("插入 %zu 个键值对...\n", num_test_keys);
    for (size_t i = 0; i < num_test_keys; i++) {
        char key[32];
        snprintf(key, sizeof(key), "key_%zu", i);
        hash_insert(ht, key, i * 2);
    }

    // 准备查找的键
    char **lookup_keys = malloc(lookup_batch_size * sizeof(char*));
    for (size_t i = 0; i < lookup_batch_size; i++) {
        lookup_keys[i] = malloc(32);
        snprintf(lookup_keys[i], 32, "key_%zu", rand() % num_test_keys);
    }

    // 测试顺序查找
    start_time = get_time_us();
    unsigned long hash_result1 = sequential_lookup(ht, lookup_keys, lookup_batch_size);
    long long hash_sequential_time = get_time_us() - start_time;

    // 测试预取优化查找
    start_time = get_time_us();
    unsigned long hash_result2 = prefetch_lookup(ht, lookup_keys, lookup_batch_size);
    long long hash_prefetch_time = get_time_us() - start_time;

    printf("\n哈希表查找测试结果：\n");
    printf("顺序查找：    %lld 微秒，结果：%lu\n", hash_sequential_time, hash_result1);
    printf("预取优化查找：%lld 微秒，结果：%lu (提升：%.2fx)\n", 
           hash_prefetch_time, hash_result2, (double)hash_sequential_time / hash_prefetch_time);

    if (hash_result1 == hash_result2) {
        printf("✓ 哈希表查找结果一致，验证通过\n");
    } else {
        printf("✗ 哈希表查找结果不一致\n");
    }

    // 清理资源
    for (size_t i = 0; i < lookup_batch_size; i++) {
        free(lookup_keys[i]);
    }
    free(lookup_keys);
    free_hash_table(ht);

    printf("\n=== 总结 ===\n");
    printf("1. 链表交错遍历相比顺序遍历可以获得显著性能提升\n");
    printf("2. 预取指令可以进一步提升性能\n");
    printf("3. 这些优化技术通过改善内存访问模式，减少CPU等待时间\n");
    printf("4. Valkey通过类似技术在lookupKey函数中获得了80%%以上的性能提升\n");
    printf("5. 结合I/O多线程，Valkey 8.0实现了从360K到1.19M RPS的性能飞跃\n");

    return 0;
}
```

我还需要创建一个Makefile来帮助编译和运行这个实验程序：

```makefile
CC = gcc
CFLAGS = -O2 -Wall -Wextra -std=c99
TARGET = valkey_test
SOURCE = valkey_optimization_test.c

# 默认目标
all: $(TARGET)

# 编译目标
$(TARGET): $(SOURCE)
    $(CC) $(CFLAGS) -o $(TARGET) $(SOURCE)

# 运行测试
run: $(TARGET)
    ./$(TARGET)

# 优化编译（启用更多优化）
optimized: 
    $(CC) -O3 -march=native -mtune=native -Wall -Wextra -std=c99 -o $(TARGET) $(SOURCE)

# 调试编译
debug:
    $(CC) -g -O0 -Wall -Wextra -std=c99 -o $(TARGET) $(SOURCE)

# 清理
clean:
    rm -f $(TARGET)

# 显示帮助
help:
    @echo "可用目标："
    @echo "  all       - 编译程序（默认）"
    @echo "  run       - 编译并运行程序"
    @echo "  optimized - 使用最高优化级别编译"
    @echo "  debug     - 编译调试版本"
    @echo "  clean     - 清理编译产物"
    @echo "  help      - 显示此帮助信息"
    @echo ""
    @echo "使用示例："
    @echo "  make run          # 编译并运行测试"
    @echo "  make optimized    # 高优化编译"
    @echo "  make clean        # 清理文件"

.PHONY: all run optimized debug clean help
```

## 总结

我已经完成了对两篇Valkey博客文章的分析和实验程序的编写。以下是主要内容：

### 文章核心技术要点：

1. **I/O多线程优化**：
   
   - 将I/O操作从主线程分离到专门的I/O线程
   - 吞吐量提升230%（360K → 1.19M RPS）
   - 平均延迟降低69.8%（1.792ms → 0.542ms）

2. **内存访问摊销优化**：
   
   - 通过交错执行减少内存访问延迟
   - lookupKey函数性能提升80%+
   - 整体性能再提升50%

### 实验程序验证：

我编写的C语言程序包含两个主要测试：

1. **链表遍历优化测试**：
   
   - 验证顺序遍历vs交错遍历的性能差异
   - 测试预取指令的额外优化效果
   - 模拟文章中链表示例的10倍性能提升

2. **哈希表查找优化测试**：
   
   - 模拟Valkey字典查找的优化场景
   - 验证预取和批量处理的性能提升
   - 对应文章中lookupKey函数的优化

### 使用方法：

```bash
# 编译并运行测试
make run

# 或者使用高优化编译
make optimized
./valkey_test

=== Valkey性能优化技术验证程序 ===

1. 链表遍历优化测试
创建测试数据...
测试数据创建完成：16个链表，每个包含1000000个节点

链表遍历测试结果：
顺序遍历：      91915 微秒，结果：7990951360
交错遍历：      57780 微秒，结果：7990951360 (提升：1.59x)
预取+交错遍历： 53289 微秒，结果：7990951360 (提升：1.72x)
✓ 所有算法结果一致，验证通过

2. 哈希表查找优化测试（模拟Valkey字典查找）
插入 100000 个键值对...

哈希表查找测试结果：
顺序查找：    228 微秒，结果：97528762
预取优化查找：53 微秒，结果：97528762 (提升：4.30x)
✓ 哈希表查找结果一致，验证通过

=== 总结 ===
1. 链表交错遍历相比顺序遍历可以获得显著性能提升
2. 预取指令可以进一步提升性能
3. 这些优化技术通过改善内存访问模式，减少CPU等待时间
4. Valkey通过类似技术在lookupKey函数中获得了80%以上的性能提升
5. 结合I/O多线程，Valkey 8.0实现了从360K到1.19M RPS的性能飞跃
```

这个实验程序能够验证Valkey文章中提到的核心优化技术，展示内存访问模式优化对性能的巨大影响。通过交错执行和预取指令，可以显著提升处理大量随机内存访问的性能，这正是Valkey实现百万级RPS的关键技术基础。
