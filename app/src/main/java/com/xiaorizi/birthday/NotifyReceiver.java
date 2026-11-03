package com.xiaorizi.birthday;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotifyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        NotificationScheduler.show(context, id == 0 ? 1000 : id,
                title == null ? "小日子提醒" : title,
                body == null ? "" : body);
    }
}
