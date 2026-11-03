package com.xiaorizi.birthday;

import java.util.Calendar;

/**
 * 小组件的纯日期计算（不依赖 Android / JSON，方便单独测试）。
 * 所有天数都以“今天”为基准重算，因此跨天后自然变化。
 */
public final class WidgetCalc {

    private WidgetCalc() {
    }

    /** yyyy-MM-dd → 天序号（以 1970-01-01 为 0），失败返回 Long.MIN_VALUE */
    public static long dayNumber(String ymd) {
        if (ymd == null) return Long.MIN_VALUE;
        String s = ymd.trim();
        if (s.length() < 8) return Long.MIN_VALUE;
        try {
            String[] p = s.split("-");
            if (p.length < 3) return Long.MIN_VALUE;
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            return c.getTimeInMillis() / 86400000L;
        } catch (Exception e) {
            return Long.MIN_VALUE;
        }
    }

    /** 今天的天序号 */
    public static long todayNumber() {
        Calendar now = Calendar.getInstance();
        now.set(Calendar.HOUR_OF_DAY, 0);
        now.set(Calendar.MINUTE, 0);
        now.set(Calendar.SECOND, 0);
        now.set(Calendar.MILLISECOND, 0);
        return now.getTimeInMillis() / 86400000L;
    }

    /**
     * 计算大数字
     * @param direction "until"（倒数）或 "since"（正数）
     * @param repeat    是否重复（until 且目标日已过时按年滚动）
     */
    public static long bigNumber(String direction, boolean repeat, boolean paused,
                                 long pausedDays, String baseYmd, String nextYmd, long todayN) {
        if (paused) return Math.max(0, pausedDays);
        long baseN = dayNumber(baseYmd);
        if (baseN == Long.MIN_VALUE) return 0;

        if ("until".equals(direction)) {
            long nextN = dayNumber(nextYmd);
            long target = nextN != Long.MIN_VALUE ? nextN : baseN;
            if (repeat && target < todayN) {
                Calendar t = Calendar.getInstance();
                t.setTimeInMillis(target * 86400000L);
                int guard = 0;
                while (t.getTimeInMillis() / 86400000L < todayN && guard++ < 200) {
                    t.add(Calendar.YEAR, 1);
                }
                target = t.getTimeInMillis() / 86400000L;
            }
            return Math.max(0, target - todayN);
        }
        return Math.max(1, todayN - baseN + 1);
    }

    /** 完整文案：第 N 天 / 还有 N 天 / 就是今天 */
    public static String bigText(String direction, boolean paused, long n) {
        if (paused) return String.valueOf(n);
        if ("until".equals(direction)) return n == 0 ? "就是今天" : "还有 " + n + " 天";
        return "第 " + n + " 天";
    }

    /** 副标题：2月18日（正数补“起”） */
    public static String subText(String direction, String baseYmd, String nextYmd) {
        String show = "until".equals(direction) && nextYmd != null && nextYmd.length() > 0
                ? nextYmd : baseYmd;
        if (show == null) return "";
        String[] p = show.split("-");
        if (p.length < 3) return "";
        try {
            String label = Integer.parseInt(p[1]) + "月" + Integer.parseInt(p[2]) + "日";
            return "until".equals(direction) ? label : label + " 起";
        } catch (Exception e) {
            return "";
        }
    }
}
