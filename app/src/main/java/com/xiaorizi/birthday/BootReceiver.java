package com.xiaorizi.birthday;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机或升级后，AlarmManager 的排程会丢失，这里重新排一次 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            NotificationScheduler.ensureChannels(context);
            NotificationScheduler.reschedule(context);
        }
    }
}
