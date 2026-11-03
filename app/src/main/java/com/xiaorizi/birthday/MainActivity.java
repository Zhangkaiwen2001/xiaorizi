package com.xiaorizi.birthday;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final int REQ_NOTIFY = 1001;
    private static final int REQ_IMPORT = 1003;
    private static final int REQ_EXPORT = 1004;
    private static final int REQ_PICK_IMAGE = 1005;

    private WebView web;
    private SharedPreferences prefs;
    private String pendingExportText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences(NotificationScheduler.PREFS, MODE_PRIVATE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window w = getWindow();
            w.setStatusBarColor(Color.parseColor("#FFF8F3"));
            w.setNavigationBarColor(Color.parseColor("#FFF8F3"));
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            w.getDecorView().setSystemUiVisibility(flags);
        }

        web = findViewById(R.id.webview);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            s.setMediaPlaybackRequiresUserGesture(true);
        }
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        web.setBackgroundColor(Color.parseColor("#FFF8F3"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            web.setPadding(0, getStatusBarHeight(), 0, 0);
            web.setClipToPadding(false);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                showJsDialog(message, false, null, result);
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                showJsDialog(message, true, null, result);
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, final JsPromptResult result) {
                showJsDialog(message, true, defaultValue, result);
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "Android");

        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.evaluateJavascript("window.xrzRender && window.xrzRender();", null);
        }
        try {
            DayWidgetProvider.refreshAll(this);
            DayWidgetProvider.scheduleDailyTickPublic(this);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.xrzBack && window.xrzBack()) ? '1' : '0'",
                value -> {
                    if (value == null || !value.contains("1")) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_EXPORT) {
            final String text = pendingExportText;
            pendingExportText = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && text != null) {
                new Thread(() -> {
                    boolean ok = BackupIo.writeText(this, data.getData(), text);
                    runOnUiThread(() -> Toast.makeText(this,
                            ok ? "备份已保存" : "保存失败，请换个位置再试",
                            Toast.LENGTH_SHORT).show());
                }).start();
            }
            return;
        }
        if (requestCode == REQ_PICK_IMAGE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                final android.net.Uri uri = data.getData();
                new Thread(() -> {
                    String dataUrl = readImageAsDataUrl(uri);
                    runOnUiThread(() -> {
                        if (web == null) return;
                        if (dataUrl == null) {
                            Toast.makeText(this, "读取图片失败", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        web.evaluateJavascript("window.xrzOnImagePicked(" +
                                JSONObject.quote(dataUrl) + ");", null);
                    });
                }).start();
            }
            return;
        }

        if (requestCode == REQ_IMPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                handleImport(data.getData());
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 读取备份文件并交给网页；先存本地再交给 JS，避免只读 URI 被重复读取 */
    private void handleImport(final Uri uri) {
        new Thread(() -> {
            String text = BackupIo.readText(this, uri);
            final String safe = text == null ? "" : text;
            try {
                File dir = getCacheDir();
                File f = new File(dir, "import.json");
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(safe.getBytes(StandardCharsets.UTF_8));
                fos.close();
            } catch (Exception ignored) {
            }
            runOnUiThread(() -> {
                if (web == null) return;
                web.evaluateJavascript("window.xrzImportFromString(" +
                        JSONObject.quote(safe) + ");", null);
            });
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_NOTIFY) {
            runOnUiThread(() -> {
                boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
                Toast.makeText(this, ok ? "通知权限已开启" : "通知权限未开启，可在系统设置中开启", Toast.LENGTH_SHORT).show();
                if (web != null) {
                    web.evaluateJavascript("window.xrzSyncNotifications && window.xrzSyncNotifications();", null);
                }
            });
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    /** 读取相册图片，缩放到最长边 1280 并压缩为 JPEG dataURL（控制内存与 webview 体积） */
    private String readImageAsDataUrl(android.net.Uri uri) {
        java.io.InputStream is = null;
        try {
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            is = getContentResolver().openInputStream(uri);
            android.graphics.BitmapFactory.decodeStream(is, null, opts);
            if (is != null) { is.close(); is = null; }

            int sample = 1;
            int maxSide = Math.max(opts.outWidth, opts.outHeight);
            while (maxSide / sample > 1600) sample *= 2;

            android.graphics.BitmapFactory.Options opts2 = new android.graphics.BitmapFactory.Options();
            opts2.inSampleSize = sample;
            is = getContentResolver().openInputStream(uri);
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(is, null, opts2);
            if (is != null) is.close();
            if (bmp == null) return null;

            // 再按最长边 1280 精确缩放
            int w = bmp.getWidth(), h = bmp.getHeight();
            int longSide = Math.max(w, h);
            if (longSide > 1280) {
                float ratio = 1280f / longSide;
                android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(
                        bmp, Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)), true);
                if (scaled != bmp) bmp.recycle();
                bmp = scaled;
            }

            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, bos);
            bmp.recycle();
            String b64 = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP);
            return "data:image/jpeg;base64," + b64;
        } catch (Exception e) {
            return null;
        } catch (OutOfMemoryError e) {
            return null;
        } finally {
            try { if (is != null) is.close(); } catch (Exception ignored) {}
        }
    }

    /** 把 canvas 生成的 dataURL 写入相册 Pictures/小日子 */
    private void saveImageToGallery(String dataUrl, String fileName) {
        try {
            if (dataUrl == null || dataUrl.indexOf(",") < 0) {
                Toast.makeText(this, "图片数据无效", Toast.LENGTH_SHORT).show();
                return;
            }
            String base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
            byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);

            String name = (fileName == null || fileName.trim().isEmpty())
                    ? "xiaorizi-" + System.currentTimeMillis() + ".png" : fileName;
            if (!name.toLowerCase().endsWith(".png")) name = name + ".png";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png");
                values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/小日子");
                android.net.Uri uri = getContentResolver()
                        .insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("无法创建图片");
                java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) throw new Exception("无法写入图片");
                os.write(bytes);
                os.close();
            } else {
                java.io.File dir = new java.io.File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "小日子");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建目录");
                java.io.File out = new java.io.File(dir, name);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
                fos.write(bytes);
                fos.close();
                android.media.MediaScannerConnection.scanFile(this,
                        new String[]{out.getAbsolutePath()}, new String[]{"image/png"}, null);
            }
            Toast.makeText(this, "已保存到相册「小日子」", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "保存失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void showJsDialog(String message, boolean withCancel,
                              String defaultValue, final Object result) {
        try {
            boolean isPrompt = result instanceof JsPromptResult;
            AlertDialog.Builder b = new AlertDialog.Builder(this);
            b.setTitle("小日子");
            if (message != null && message.length() > 0) b.setMessage(message);
            if (isPrompt) {
                final EditText input = new EditText(this);
                if (defaultValue != null) {
                    input.setText(defaultValue);
                    input.setSelection(defaultValue.length());
                }
                b.setView(input);
                b.setPositiveButton("确定", (d, w) -> ((JsPromptResult) result).confirm(input.getText().toString()));
            } else {
                b.setPositiveButton("确定", (d, w) -> ((JsResult) result).confirm());
            }
            if (withCancel) {
                b.setNegativeButton("取消", (d, w) -> {
                    if (isPrompt) ((JsPromptResult) result).cancel();
                    else ((JsResult) result).cancel();
                });
            }
            b.setOnCancelListener(d -> {
                if (isPrompt) ((JsPromptResult) result).cancel();
                else ((JsResult) result).cancel();
            });
            b.show();
        } catch (Exception e) {
            if (result instanceof JsPromptResult) ((JsPromptResult) result).cancel();
            else if (result instanceof JsResult) ((JsResult) result).cancel();
        }
    }

    private int getStatusBarHeight() {
        int result = 0;
        int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resId > 0) result = getResources().getDimensionPixelSize(resId);
        return result;
    }

    /* ---------------- 与网页的桥 ---------------- */

    public class Bridge {

        @JavascriptInterface
        public void setupNotifications(String planJson) {
            prefs.edit().putString(NotificationScheduler.KEY_PLAN, planJson == null ? "[]" : planJson).apply();
            NotificationScheduler.reschedule(MainActivity.this);
        }

        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                        return;
                    }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    android.app.AlarmManager am =
                            (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
                    if (am != null && !am.canScheduleExactAlarms()) {
                        Toast.makeText(MainActivity.this,
                                "提示：可在系统设置中允许“闹钟和提醒”，提醒会更准时",
                                Toast.LENGTH_LONG).show();
                    }
                }
                NotificationScheduler.ensureChannels(MainActivity.this);
                Toast.makeText(MainActivity.this, "提醒已开启", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void testNotification() {
            runOnUiThread(() -> {
                NotificationScheduler.ensureChannels(MainActivity.this);
                NotificationScheduler.show(MainActivity.this, 777,
                        "🎂 这是一条测试提醒",
                        "收到这条通知，说明提醒功能正常。");
                Toast.makeText(MainActivity.this, "已发送一条测试提醒", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public boolean hasPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    return false;
                }
                return NotificationScheduler.areNotificationsOn(MainActivity.this);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(i);
                } catch (Exception e) {
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void exportBackup(String fileName, String content) {
            final String name = (fileName == null || fileName.trim().isEmpty())
                    ? "xiaorizi-backup.json" : fileName;
            pendingExportText = content;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(Intent.createChooser(intent, "保存备份文件"), REQ_EXPORT);
                } catch (Exception e) {
                    pendingExportText = null;
                    Toast.makeText(MainActivity.this, "无法打开保存对话框", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void pickBackup() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    startActivityForResult(Intent.createChooser(intent, "选择备份文件"), REQ_IMPORT);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String getData() {
            try {
                return prefs.getString("data_json", "");
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void setData(String json) {
            try {
                prefs.edit().putString("data_json", json == null ? "" : json).apply();
            } catch (Exception ignored) {
            }
        }

        /** 网页把最新几条日子推给小组件 */
        /**
         * 把「小组件皮肤」写给原生：封面图（dataURL，可为空）+ 主题色。
         * 封面会被压缩落盘，避免每次刷新都重新解码大快照。
         */
        @JavascriptInterface
        public void setWidgetSkin(String coverDataUrl, String accentHex) {
            try {
                SharedPreferences.Editor ed = prefs.edit();
                ed.putString(DayWidgetProvider.KEY_WIDGET_ACCENT,
                        accentHex == null || accentHex.isEmpty() ? "#FF6F61" : accentHex);
                if (coverDataUrl != null && coverDataUrl.length() > 64) {
                    String path = WidgetArt.cacheCover(MainActivity.this, coverDataUrl);
                    ed.putString(DayWidgetProvider.KEY_WIDGET_COVER, path);
                } else {
                    ed.remove(DayWidgetProvider.KEY_WIDGET_COVER);
                }
                ed.apply();
            } catch (Exception ignored) {
            }
        }

        /** 网页切换深色模式时同步小组件配色 */
        @JavascriptInterface
        public void setWidgetTheme(String theme) {
            try {
                prefs.edit().putString(DayWidgetProvider.KEY_WIDGET_THEME,
                        "dark".equals(theme) ? "dark" : "light").apply();
            } catch (Exception ignored) {
            }
            runOnUiThread(() -> {
                try {
                    DayWidgetProvider.refreshAll(MainActivity.this);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void updateWidget(String itemsJson) {
            try {
                prefs.edit().putString(DayWidgetProvider.KEY_WIDGET,
                        itemsJson == null ? "[]" : itemsJson).apply();
            } catch (Exception ignored) {
            }
            runOnUiThread(() -> {
                try {
                    DayWidgetProvider.refreshAll(MainActivity.this);
                } catch (Exception ignored) {
                }
            });
        }

        /** 保存分享卡片（base64 PNG）到相册 */
        /** 从相册挑一张图，作为卡片背景 */
        @JavascriptInterface
        public void pickImage() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                    startActivityForResult(Intent.createChooser(intent, "选择背景图片"), REQ_PICK_IMAGE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "无法打开相册", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void saveImage(String dataUrl, String fileName) {
            runOnUiThread(() -> saveImageToGallery(dataUrl, fileName));
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void openUrl(String url) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        }
    }
}
