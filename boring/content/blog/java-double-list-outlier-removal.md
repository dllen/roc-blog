+++
title = "Java Double List 去除突刺点（异常值）的方法"
description = "系统梳理 Z-Score、IQR、滑动窗口、相邻点距离与多方法融合的异常值检测与去除，含完整 Java 代码与测试"
date = 2025-11-12
+++

本文面向需要在 Java 中对 `List<Double>` 数据做“去除突刺点（异常值）”的工程实践，给出 4 类常用方法（统计学、移动窗口、相邻点距离与多方法融合），并提供完整可运行的代码与 JUnit 测试示例，帮助你在不同业务场景下快速选择与落地。

注意：异常值并非总是“错误”。许多业务的“尖峰”有可能是合理的事件。本文更像一套工具箱，你需要结合业务知识合理使用与调参。

## 1. 基于统计学方法的异常值检测

### Z-Score 方法
- 思想：计算全局均值 `μ` 与标准差 `σ`，当某点 `x` 满足 `| (x-μ) / σ | > k`（常用阈值 `k=3`）时，判为异常。
- 适用：近似正态分布、峰值显著偏离整体均值的场景。

### IQR (四分位距) 方法
- 思想：计算 Q1、Q3 与 IQR=`Q3-Q1`，当点落在 `[Q1 - α·IQR, Q3 + α·IQR]` 之外（常用 `α=1.5` 或 `3.0`）判为异常。
- 适用：偏态分布或存在重尾时较稳健（受极端值影响较小）。

## 2. 基于移动窗口的异常值检测

### 滑动窗口 Z-Score
- 思想：用邻域窗口的均值与标准差代替全局统计，适合非平稳或趋势性数据。

### 移动平均法
- 思想：用窗口均值/中位数做局部“期望值”，当当前点偏离窗口均值超过一定阈值即判异常。
- 常见阈值：绝对差超过 `β·σ_window` 或超过固定常数 `δ`。

## 3. 基于相邻点距离的异常值检测
- 思想：突刺常表现为与相邻点差值显著增大。可用固定阈值或鲁棒阈值（如差值的 `MAD` 或四分位距）来判断。

## 4. 综合多种方法的异常值检测
- 思想：多模型投票或加权融合。只有当多个方法一致判定为异常时才去除，可降低误杀风险。

## 5. 完整代码：OutlierDetectors.java（可直接复制使用）

```java
import java.util.*;
import java.util.stream.*;

public final class OutlierDetectors {

    private OutlierDetectors() {}

    // ===================== 公共工具与预处理 =====================
    public static List<Double> dropNullAndNaN(List<Double> data) {
        if (data == null) return Collections.emptyList();
        List<Double> cleaned = new ArrayList<>(data.size());
        for (Double d : data) {
            if (d != null && !d.isNaN() && !d.isInfinite()) {
                cleaned.add(d);
            }
        }
        return cleaned;
    }

    public static double mean(List<Double> data) {
        if (data.isEmpty()) return 0.0;
        double s = 0.0;
        for (double v : data) s += v;
        return s / data.size();
    }

    // 样本标准差（n-1），窗口过小则回退为 0
    public static double sampleStd(List<Double> data) {
        int n = data.size();
        if (n <= 1) return 0.0;
        double mu = mean(data);
        double sumSq = 0.0;
        for (double v : data) {
            double d = v - mu;
            sumSq += d * d;
        }
        return Math.sqrt(sumSq / (n - 1));
    }

    public static double median(List<Double> data) {
        if (data.isEmpty()) return 0.0;
        List<Double> sorted = new ArrayList<>(data);
        Collections.sort(sorted);
        int n = sorted.size();
        if (n % 2 == 1) return sorted.get(n / 2);
        return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }

    public static double[] quartiles(List<Double> data) {
        // 简单实现，适用于一般场景；严谨场景可使用更精细的分位数算法
        List<Double> sorted = new ArrayList<>(data);
        Collections.sort(sorted);
        int n = sorted.size();
        if (n == 0) return new double[]{0, 0, 0};
        double q2 = median(sorted);
        List<Double> lower = sorted.subList(0, n / 2);
        List<Double> upper = sorted.subList((n % 2 == 0 ? n / 2 : n / 2 + 1), n);
        double q1 = median(lower);
        double q3 = median(upper);
        return new double[]{q1, q2, q3};
    }

    public static double mad(List<Double> data) {
        double med = median(data);
        List<Double> dev = data.stream().map(v -> Math.abs(v - med)).collect(Collectors.toList());
        return median(dev);
    }

    // 根据掩码移除异常值
    public static List<Double> removeByMask(List<Double> data, List<Boolean> isOutlier) {
        List<Double> out = new ArrayList<>(data.size());
        for (int i = 0; i < data.size(); i++) {
            if (!isOutlier.get(i)) out.add(data.get(i));
        }
        return out;
    }

    // ===================== 1) 统计学：Z-Score =====================
    public static List<Boolean> detectByZScore(List<Double> data, double k) {
        List<Double> cleaned = dropNullAndNaN(data);
        double mu = mean(cleaned);
        double std = sampleStd(cleaned);
        if (std == 0.0) {
            // 如果方差为 0，则所有值都相同；默认无异常
            return Collections.nCopies(data.size(), false);
        }
        List<Boolean> mask = new ArrayList<>(data.size());
        for (Double x : data) {
            boolean out = (x == null || x.isNaN() || x.isInfinite()) ? true : Math.abs((x - mu) / std) > k;
            mask.add(out);
        }
        return mask;
    }

    public static List<Double> removeByZScore(List<Double> data, double k) {
        return removeByMask(data, detectByZScore(data, k));
    }

    // ===================== 1) 统计学：IQR =====================
    public static List<Boolean> detectByIQR(List<Double> data, double alpha) {
        List<Double> cleaned = dropNullAndNaN(data);
        if (cleaned.isEmpty()) return Collections.nCopies(data.size(), false);
        double[] qs = quartiles(cleaned);
        double q1 = qs[0], q3 = qs[2];
        double iqr = q3 - q1;
        double lo = q1 - alpha * iqr;
        double hi = q3 + alpha * iqr;
        List<Boolean> mask = new ArrayList<>(data.size());
        for (Double x : data) {
            boolean out = (x == null || x.isNaN() || x.isInfinite()) ? true : (x < lo || x > hi);
            mask.add(out);
        }
        return mask;
    }

    public static List<Double> removeByIQR(List<Double> data, double alpha) {
        return removeByMask(data, detectByIQR(data, alpha));
    }

    // ===================== 2) 滑动窗口 Z-Score =====================
    public static List<Boolean> detectBySlidingZScore(List<Double> data, int window, double k) {
        int n = data.size();
        List<Boolean> mask = new ArrayList<>(Collections.nCopies(n, false));
        for (int i = 0; i < n; i++) {
            int start = Math.max(0, i - window);
            int end = Math.min(n, i + window + 1);
            List<Double> neigh = new ArrayList<>();
            for (int j = start; j < end; j++) {
                Double v = data.get(j);
                if (v != null && !v.isNaN() && !v.isInfinite()) neigh.add(v);
            }
            double mu = mean(neigh);
            double std = sampleStd(neigh);
            Double x = data.get(i);
            boolean out = (x == null || x.isNaN() || x.isInfinite()) ? true : (std == 0.0 ? false : Math.abs((x - mu) / std) > k);
            mask.set(i, out);
        }
        return mask;
    }

    public static List<Double> removeBySlidingZScore(List<Double> data, int window, double k) {
        return removeByMask(data, detectBySlidingZScore(data, window, k));
    }

    // ===================== 2) 移动平均法 =====================
    public static List<Boolean> detectByMovingAverage(List<Double> data, int window, double beta) {
        int n = data.size();
        List<Boolean> mask = new ArrayList<>(Collections.nCopies(n, false));
        for (int i = 0; i < n; i++) {
            int start = Math.max(0, i - window);
            int end = Math.min(n, i + window + 1);
            List<Double> neigh = new ArrayList<>();
            for (int j = start; j < end; j++) {
                Double v = data.get(j);
                if (v != null && !v.isNaN() && !v.isInfinite()) neigh.add(v);
            }
            double mu = mean(neigh);
            double std = sampleStd(neigh);
            Double x = data.get(i);
            boolean out = (x == null || x.isNaN() || x.isInfinite()) ? true : Math.abs(x - mu) > beta * (std == 0.0 ? 1.0 : std);
            mask.set(i, out);
        }
        return mask;
    }

    public static List<Double> removeByMovingAverage(List<Double> data, int window, double beta) {
        return removeByMask(data, detectByMovingAverage(data, window, beta));
    }

    // ===================== 3) 相邻点距离 =====================
    public static List<Boolean> detectByNeighborDistance(List<Double> data, double threshold, boolean robust) {
        int n = data.size();
        if (n == 0) return Collections.emptyList();
        List<Double> diffs = new ArrayList<>();
        for (int i = 1; i < n; i++) {
            Double a = data.get(i - 1), b = data.get(i);
            if (a == null || b == null || a.isNaN() || b.isNaN() || a.isInfinite() || b.isInfinite()) continue;
            diffs.add(Math.abs(b - a));
        }
        double base;
        if (robust) {
            double m = median(diffs);
            double mdev = mad(diffs);
            base = m + 3.0 * (mdev == 0.0 ? 1.0 : mdev);
        } else {
            base = diffs.isEmpty() ? threshold : mean(diffs) + 3.0 * sampleStd(diffs);
        }
        double th = Math.max(threshold, base); // 使用用户阈值与数据驱动阈值的较大者

        List<Boolean> mask = new ArrayList<>(Collections.nCopies(n, false));
        for (int i = 0; i < n; i++) {
            Double x = data.get(i);
            if (x == null || x.isNaN() || x.isInfinite()) { mask.set(i, true); continue; }
            double left = (i > 0 && data.get(i - 1) != null && !data.get(i - 1).isNaN() && !data.get(i - 1).isInfinite()) ? Math.abs(x - data.get(i - 1)) : 0.0;
            double right = (i < n - 1 && data.get(i + 1) != null && !data.get(i + 1).isNaN() && !data.get(i + 1).isInfinite()) ? Math.abs(x - data.get(i + 1)) : 0.0;
            boolean out = left > th && right > th; // 两侧距离都大更像“尖刺”
            mask.set(i, out);
        }
        return mask;
    }

    public static List<Double> removeByNeighborDistance(List<Double> data, double threshold, boolean robust) {
        return removeByMask(data, detectByNeighborDistance(data, threshold, robust));
    }

    // ===================== 4) 多方法融合（投票） =====================
    public static class CombinedParams {
        public double zK = 3.0;            // 全局 Z-Score 阈值
        public double iqrAlpha = 1.5;      // IQR 系数
        public int slideWindow = 5;        // 滑动窗口大小（左右各 window）
        public double slideK = 3.0;        // 滑动 Z-Score 阈值
        public double maBeta = 3.0;        // 移动均值偏差倍数
        public double neighborThreshold = 0.0; // 最小固定距离阈值
        public boolean neighborRobust = true;  // 使用鲁棒阈值
        public int votesRequired = 2;      // 至少多少方法判为异常
    }

    public static List<Boolean> detectByCombined(List<Double> data, CombinedParams p) {
        List<Boolean> m1 = detectByZScore(data, p.zK);
        List<Boolean> m2 = detectByIQR(data, p.iqrAlpha);
        List<Boolean> m3 = detectBySlidingZScore(data, p.slideWindow, p.slideK);
        List<Boolean> m4 = detectByMovingAverage(data, p.slideWindow, p.maBeta);
        List<Boolean> m5 = detectByNeighborDistance(data, p.neighborThreshold, p.neighborRobust);
        int n = data.size();
        List<Boolean> out = new ArrayList<>(Collections.nCopies(n, false));
        for (int i = 0; i < n; i++) {
            int votes = 0;
            if (m1.get(i)) votes++;
            if (m2.get(i)) votes++;
            if (m3.get(i)) votes++;
            if (m4.get(i)) votes++;
            if (m5.get(i)) votes++;
            out.set(i, votes >= p.votesRequired);
        }
        return out;
    }

    public static List<Double> removeByCombined(List<Double> data, CombinedParams p) {
        return removeByMask(data, detectByCombined(data, p));
    }

    // ===================== 5) 演示用主程序 =====================
    public static void main(String[] args) {
        List<Double> raw = Arrays.asList(
                10.0, 10.5, 10.2, 9.9, 10.1,
                45.0, // 突刺
                10.0, 9.8, 10.3, 10.2,
                -30.0, // 负向突刺
                10.1, 9.9, 10.0
        );

        System.out.println("原始数据:  " + raw);
        System.out.println("Z-Score 清洗: " + removeByZScore(raw, 3.0));
        System.out.println("IQR 清洗:     " + removeByIQR(raw, 1.5));
        System.out.println("滑动Z 清洗:   " + removeBySlidingZScore(raw, 3, 3.0));
        System.out.println("移动均值 清洗: " + removeByMovingAverage(raw, 3, 3.0));
        System.out.println("相邻距离 清洗: " + removeByNeighborDistance(raw, 0.0, true));

        CombinedParams p = new CombinedParams();
        p.votesRequired = 2; // 至少两种方法判为异常才移除
        System.out.println("融合清洗:     " + removeByCombined(raw, p));
    }
}
```

## 6. 测试用例（JUnit 5）

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;

public class OutlierDetectorsTest {

    @Test
    void zscore_removes_spikes() {
        List<Double> data = Arrays.asList(10.0, 10.2, 10.1, 50.0, 9.9, 10.0);
        List<Double> cleaned = OutlierDetectors.removeByZScore(data, 3.0);
        assertFalse(cleaned.contains(50.0));
        assertTrue(cleaned.size() >= 4);
    }

    @Test
    void iqr_handles_skewed() {
        List<Double> data = Arrays.asList(1.0, 1.1, 1.2, 5.0, 1.0, 0.9);
        List<Double> cleaned = OutlierDetectors.removeByIQR(data, 1.5);
        assertFalse(cleaned.contains(5.0));
    }

    @Test
    void sliding_zscore_detects_local_spike() {
        List<Double> data = Arrays.asList(10.0, 10.1, 30.0, 10.2, 10.1);
        List<Double> cleaned = OutlierDetectors.removeBySlidingZScore(data, 2, 2.5);
        assertFalse(cleaned.contains(30.0));
    }

    @Test
    void moving_average_removes_outliers() {
        List<Double> data = Arrays.asList(100.0, 100.1, 99.9, 400.0, 100.0);
        List<Double> cleaned = OutlierDetectors.removeByMovingAverage(data, 2, 3.0);
        assertFalse(cleaned.contains(400.0));
    }

    @Test
    void neighbor_distance_catches_spike_between_flat_values() {
        List<Double> data = Arrays.asList(10.0, 10.0, 50.0, 10.0, 10.0);
        List<Double> cleaned = OutlierDetectors.removeByNeighborDistance(data, 0.0, true);
        assertFalse(cleaned.contains(50.0));
    }

    @Test
    void combined_voting_is_conservative() {
        List<Double> data = Arrays.asList(10.0, 10.1, 11.0, 10.2, 10.0);
        OutlierDetectors.CombinedParams p = new OutlierDetectors.CombinedParams();
        p.votesRequired = 2;
        List<Double> cleaned = OutlierDetectors.removeByCombined(data, p);
        // 11.0 不一定被去除（取决于窗口与阈值），这里检查不发生误杀（示例）
        assertTrue(cleaned.contains(11.0));
    }
}
```

## 7. 实际应用示例

例如 IoT 设备的温度读数，每分钟一个点，偶尔出现硬件抖动导致的尖峰。建议：
- 先用“滑动窗口 Z-Score（window=5，k=3）”检测局部异常。
- 再用“相邻点距离（robust=true）”做二次确认。
- 两者都判异常才移除（`votesRequired=2`）。

这样可以兼顾对局部突变的敏感性与稳健性，降低误杀风险。

## 8. 性能优化建议
- 预计算滚动均值/方差（O(n)），避免重复遍历。
- 大数据量时优先选用 IQR/MAD 等一次扫描算法。
- 使用并行流或分块处理提升吞吐（注意线程安全）。
- 对近似实时流，优先滑窗方法，避免全量重算。
- 对多次查询的静态数据，缓存中间统计结果。

## 9. 注意事项（强烈推荐实践）
- 数据预处理：在检测异常值之前，先过滤掉 NULL 值和 NaN 值。
- 参数选择：根据具体业务场景调整阈值（如 Z-Score 的 k、IQR 的 α、滑窗大小、β 等）。
- 数据分布：考虑数据分布特性，正态更适合 Z-Score，偏态/重尾用 IQR/MAD 更稳健。
- 性能考虑：大数据量时使用近似方法或并行处理；滚动统计更高效。
- 业务逻辑：结合业务知识判断哪些“异常值”实际上是合理的事件，不要轻易删除。

## 10. 代码运行说明（可选）
- 复制 `OutlierDetectors.java` 与测试到你的工程。
- 使用 Maven/Gradle 引入 JUnit 5 后运行测试。
- 或直接 `javac OutlierDetectors.java` 后运行 `java OutlierDetectors` 查看演示输出。

以上方法可根据你的具体需求进行选择和调整，以有效去除 Double 列表中的突刺点。
