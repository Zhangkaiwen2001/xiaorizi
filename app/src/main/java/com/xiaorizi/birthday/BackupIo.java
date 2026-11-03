package com.xiaorizi.birthday;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** 备份文件的读写与分享，不依赖 WebView 的文件选择器，兼容性更好 */
public final class BackupIo {

    private BackupIo() {
    }

    /** 把文本写回用户选定的文件（SAF），成功返回 true */
    public static boolean writeText(Context ctx, Uri uri, String text) {
        try {
            ContentResolver cr = ctx.getContentResolver();
            OutputStream os = cr.openOutputStream(uri, "wt");
            if (os == null) return false;
            os.write(text.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 读取用户选择文件的内容，失败返回 null */
    public static String readText(Context ctx, Uri uri) {
        try {
            ContentResolver cr = ctx.getContentResolver();
            InputStream is = cr.openInputStream(uri);
            if (is == null) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            is.close();
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }
}
