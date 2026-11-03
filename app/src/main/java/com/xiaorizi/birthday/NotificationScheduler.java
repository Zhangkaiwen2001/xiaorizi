package com.xiaorizi.birthday;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 本地提醒：把网页算好的计划存进 SharedPreferences，
 * 再用 AlarmManager 逐个安排通知。
 */
public final class NotificationScheduler {

    public static final String PREFS = "xiaorizi_prefs";
    public static final String KEY_PLAN = "notify_plan";
    public static final String KEY_LAST_IDS = "scheduled_ids";
    public static final String CHANNEL_ID = "reminders";

    private NotificationScheduler() {
    }

    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
        if (ch == null) {
            ch = new NotificationChannel(CHANNEL_ID, "生日与纪念日提醒", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("生日、在一起纪念日的当天提醒");
            ch.enableVibration(true);
            ch.setShowBadge(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ch.setAllowBubbles(false);
            }
            nm.createNotificationChannel(ch);
        }
    }

    public static boolean areNotificationsOn(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                return nm.areNotificationsEnabled();
            }
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    /** 读取网页保存的计划并重新安排所有闹钟 */
    public static void reschedule(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        ensureChannels(ctx);
        cancelAll(ctx, prefs);

        String raw = prefs.getString(KEY_PLAN, "[]");
        List<Integer> ids = new ArrayList<>();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                int id = o.optInt("id", 0);
                long at = o.optLong("at", 0L);
                String title = o.optString("title", "小日子提醒");
                String body = o.optString("body", "");
                if (id == 0 || at <= now) continue;

                Intent intent = new Intent(ctx, NotifyReceiver.class);
                intent.setAction("com.xiaorizi.birthday.NOTIFY");
                intent.putExtra("id", id);
                intent.putExtra("title", title);
                intent.putExtra("body", body);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(ctx, id, intent, flags);

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                    } else {
                        am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                    }
                    ids.add(id);
                } catch (SecurityException se) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                    ids.add(id);
                }
            }
        } catch (Exception ignored) {
        }

        JSONArray keep = new JSONArray();
        for (int id : ids) keep.put(id);
        prefs.edit().putString(KEY_LAST_IDS, keep.toString()).apply();
    }

    private static void cancelAll(Context ctx, SharedPreferences prefs) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            JSONArray old = new JSONArray(prefs.getString(KEY_LAST_IDS, "[]"));
            for (int i = 0; i < old.length(); i++) {
                int id = old.optInt(i, 0);
                if (id == 0) continue;
                Intent intent = new Intent(ctx, NotifyReceiver.class);
                intent.setAction("com.xiaorizi.birthday.NOTIFY");
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(ctx, id, intent, flags);
                am.cancel(pi);
                pi.cancel();
            }
        } catch (Exception ignored) {
        }
        prefs.edit().putString(KEY_LAST_IDS, "[]").apply();
    }

    /** 真正弹出通知 */
    public static void show(Context ctx, int id, String title, String body) {
        ensureChannels(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, flags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(ctx, CHANNEL_ID);
        } else {
            b = new Notification.Builder(ctx);
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setContentIntent(pi);

        try {
            nm.notify(id, b.build());
        } catch (Exception ignored) {
        }
    }
}
