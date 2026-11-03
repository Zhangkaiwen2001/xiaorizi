package com.xiaorizi.birthday;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * 桌面小组件。
 *
 * 设计要点：网页只推「基准日期 + 计算方式」，天数由这里用“今天”重新计算，
 * 并在每天 0:05 与打开 App 时刷新，避免跨天后卡片还停在昨天的数字。
 */
public class DayWidgetProvider extends AppWidgetProvider {

    public static final String KEY_WIDGET = "widget_items";
    public static final String KEY_WIDGET_THEME = "widget_theme";
    public static final String KEY_WIDGET_ACCENT = "widget_accent";
    public static final String KEY_WIDGET_COVER = "widget_cover";
    private static final String ACTION_REFRESH = "com.xiaorizi.birthday.WIDGET_REFRESH";
    private static final String ACTION_TICK = "com.xiaorizi.birthday.WIDGET_TICK";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, manager, id);
        scheduleDailyTick(context);
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        scheduleDailyTick(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) return;
        String action = intent.getAction();
        boolean dateChanged = Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_USER_PRESENT.equals(action);
        if (ACTION_REFRESH.equals(action)
                || ACTION_TICK.equals(action)
                || dateChanged
                || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            refreshAll(context);
            if (ACTION_TICK.equals(action) || dateChanged) scheduleDailyTick(context);
        }
    }

    /** 供 MainActivity / 网页调用 */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        ComponentName cn = new ComponentName(context, DayWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(cn);
        for (int id : ids) updateOne(context, manager, id);
    }

    /** 供 MainActivity 调用：确保每日刷新已排程 */
    public static void scheduleDailyTickPublic(Context context) {
        scheduleDailyTick(context);
    }

    /** 每天 0:05 触发刷新，保证跨零点后天数自动变化 */
    private static void scheduleDailyTick(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(context, DayWidgetProvider.class);
            i.setAction(ACTION_TICK);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, 99001, i, flags);

            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_YEAR, 1);
            c.set(Calendar.HOUR_OF_DAY, 0);
            c.set(Calendar.MINUTE, 5);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
            }
        } catch (Exception ignored) {
        }
    }

    /* ---------------- 天数计算（见 WidgetCalc，已单测） ---------------- */

    private static String recalcBig(JSONObject o) {
        long n = WidgetCalc.bigNumber(
                o.optString("direction", "since"),
                !"none".equals(o.optString("repeat", "none")),
                o.optBoolean("paused", false),
                o.optInt("pausedDays", 0),
                o.optString("baseYmd", ""),
                o.optString("nextYmd", ""),
                WidgetCalc.todayNumber());
        return String.valueOf(n);
    }

    private static String recalcText(JSONObject o) {
        long n = Long.parseLong(recalcBig(o));
        return WidgetCalc.bigText(o.optString("direction", "since"), o.optBoolean("paused", false), n);
    }

    /** 小组件次要行的紧凑写法：⭐ 标题 · 8天 */
    private static String shortLine(JSONObject o) {
        String emoji = o.optString("emoji", "");
        String title = o.optString("title", "");
        if (title.length() > 6) title = title.substring(0, 6);
        String text = recalcText(o);
        String shortText;
        if (text.startsWith("第 ")) shortText = text.substring(2).replace(" ", "");
        else if (text.startsWith("还有 ")) shortText = text.substring(3).replace(" ", "");
        else if ("就是今天".equals(text)) shortText = "今天";
        else shortText = text;
        return emoji + " " + title + " · " + shortText;
    }

    /** 副标题：倒数显示目标日期，正数显示起始日 */
    private static String subLineOf(JSONObject o) {
        String s = WidgetCalc.subText(o.optString("direction", "since"),
                o.optString("baseYmd", ""), o.optString("nextYmd", ""));
        return s.length() > 0 ? s : o.optString("sub", "");
    }

    private static void updateOne(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_day);
        SharedPreferences prefs = context.getSharedPreferences(NotificationScheduler.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_WIDGET, "[]");
        String theme = prefs.getString(KEY_WIDGET_THEME, "light");

        boolean dark = "dark".equals(theme);
        String accentHex = prefs.getString(KEY_WIDGET_ACCENT, "#FF6F61");
        int accent = 0xFFFF6F61;
        try { accent = Color.parseColor(accentHex); } catch (Exception ignored) {}
        String coverPath = prefs.getString(KEY_WIDGET_COVER, null);

        // 背景用绘制的位图（封面照片或主题色渐变），文字统一白色，深浅色都清晰
        try {
            int w = 320, h = 240;
            try {
                android.os.Bundle opt = manager.getAppWidgetOptions(widgetId);
                if (opt != null) {
                    int minW = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                    int minH = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
                    if (minW > 0 && minH > 0) {
                        float density = context.getResources().getDisplayMetrics().density;
                        w = Math.max(120, (int) (minW * density));
                        h = Math.max(100, (int) (minH * density));
                    }
                }
            } catch (Exception ignored) {}
            android.graphics.Bitmap bg = WidgetArt.buildBackground(context, coverPath, accent, dark, w, h);
            if (bg != null) {
                views.setImageViewBitmap(R.id.w_bg, bg);
            }
            views.setTextColor(R.id.w_title, 0xFFFFFFFF);
            views.setTextColor(R.id.w_sub, 0xD9FFFFFF);
            views.setTextColor(R.id.w_unit, 0xD9FFFFFF);
            views.setTextColor(R.id.w_row1, 0xE6FFFFFF);
            views.setTextColor(R.id.w_row2, 0xE6FFFFFF);
            views.setTextColor(R.id.w_main, 0xFFFFFFFF);
        } catch (Exception ignored) {
        }

        try {
            JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
            if (arr.length() == 0) {
                views.setTextViewText(R.id.w_title, "小日子");
                views.setTextViewText(R.id.w_emoji, "✨");
                views.setTextViewText(R.id.w_main, "—");
                views.setTextViewText(R.id.w_unit, "");
                views.setTextViewText(R.id.w_sub, "打开 App 添加第一个日子");
                views.setViewVisibility(R.id.w_row1, android.view.View.GONE);
                views.setViewVisibility(R.id.w_row2, android.view.View.GONE);
            } else {
                JSONObject first = arr.getJSONObject(0);
                views.setTextViewText(R.id.w_title, first.optString("title", "小日子"));
                views.setTextViewText(R.id.w_emoji, first.optString("emoji", "⭐"));

                String text = recalcText(first);
                boolean paused = first.optBoolean("paused", false);
                String big, unit;
                if (paused) {
                    big = recalcBig(first);
                    unit = "天·已暂停";
                } else if (text.startsWith("第 ")) {
                    int dayIdx = text.indexOf(" 天");
                    big = dayIdx > 2 ? text.substring(2, dayIdx) : text;
                    unit = "天";
                } else if (text.startsWith("还有 ")) {
                    int dayIdx = text.indexOf(" 天");
                    big = dayIdx > 3 ? text.substring(3, dayIdx) : text;
                    unit = "天后";
                } else if ("就是今天".equals(text)) {
                    big = "今天";
                    unit = "";
                } else {
                    big = text;
                    unit = "";
                }
                views.setTextViewText(R.id.w_main, big.trim());
                views.setTextViewText(R.id.w_unit, unit);

                views.setTextColor(R.id.w_main, 0xFFFFFFFF);

                views.setTextViewText(R.id.w_sub, subLineOf(first));

                if (arr.length() > 1) {
                    views.setTextViewText(R.id.w_row1, shortLine(arr.getJSONObject(1)));
                    views.setViewVisibility(R.id.w_row1, android.view.View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.w_row1, android.view.View.GONE);
                }

                if (arr.length() > 2) {
                    views.setTextViewText(R.id.w_row2, shortLine(arr.getJSONObject(2)));
                    views.setViewVisibility(R.id.w_row2, android.view.View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.w_row2, android.view.View.GONE);
                }
            }
        } catch (Exception e) {
            views.setTextViewText(R.id.w_title, "小日子");
            views.setTextViewText(R.id.w_main, "—");
            views.setTextViewText(R.id.w_sub, "打开 App 看看");
        }

        Intent open = new Intent(context, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(context, 0, open, flags);
        views.setOnClickPendingIntent(R.id.w_root, pi);
        views.setOnClickPendingIntent(R.id.w_main, pi);

        views.setTextViewText(R.id.w_date,
                new SimpleDateFormat("M月d日 EEEE", Locale.CHINA).format(new Date()));

        try {
            manager.updateAppWidget(widgetId, views);
        } catch (Exception ignored) {
        }
    }
}
