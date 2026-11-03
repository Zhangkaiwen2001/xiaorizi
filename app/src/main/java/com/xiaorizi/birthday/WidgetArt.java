package com.xiaorizi.birthday;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 小组件背景绘制：
 * 1. 有封面图 → 等比裁切铺满 + 从左上深色到右下透明的遮罩，保证文字可读
 * 2. 没封面图 → 用主题色生成柔和渐变
 * 3. 统一按实际尺寸绘制圆角（RemoteViews 里 ImageView 不能直接裁圆角）
 */
public final class WidgetArt {

    private WidgetArt() {
    }

    /** 把 dataURL 存成 PNG 文件，返回路径；已存在则直接复用 */
    public static String cacheCover(Context ctx, String dataUrl) {
        if (dataUrl == null || dataUrl.length() < 64) return null;
        try {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) return null;
            String b64 = dataUrl.substring(comma + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            String hash = Integer.toHexString((dataUrl.length() + "").hashCode() + bytes.length);
            File dir = new File(ctx.getCacheDir(), "widget");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File f = new File(dir, "cover_" + hash + ".img");
            if (f.exists() && f.length() == bytes.length) return f.getAbsolutePath();
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(bytes);
            fos.close();
            return f.getAbsolutePath();
        } catch (Exception e) {
            return null;
        } catch (OutOfMemoryError e) {
            return null;
        }
    }

    /**
     * 绘制背景位图
     * @param coverPath 封面图路径，可为 null
     * @param accent    主题色（无封面时用于渐变）
     * @param dark      深色模式
     * @param w/h       目标尺寸（像素）
     */
    public static Bitmap buildBackground(Context ctx, String coverPath, int accent, boolean dark, int w, int h) {
        if (w <= 0 || h <= 0) return null;
        Bitmap out = null;
        try {
            out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(out);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            RectF full = new RectF(0, 0, w, h);

            Bitmap photo = coverPath != null ? decodeCover(coverPath, w, h) : null;

            if (photo != null) {
                // 等比裁切铺满（centerCrop）
                float scale = Math.max((float) w / photo.getWidth(), (float) h / photo.getHeight());
                Matrix m = new Matrix();
                m.postScale(scale, scale);
                float dx = (w - photo.getWidth() * scale) / 2f;
                // 纵向按 30% 偏上对齐：人物/天空通常在上半部分，避免只截到地面
                float dy = (h - photo.getHeight() * scale) * 0.30f;
                m.postTranslate(dx, dy);
                c.drawBitmap(photo, m, p);
                photo.recycle();

                // 遮罩：左上略暗 + 底部更暗，保证白字清晰
                LinearGradient shade = new LinearGradient(
                        0, 0, 0, h,
                        new int[]{0x33000000, 0x4D000000, 0x8C000000},
                        new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP);
                p.setShader(shade);
                c.drawRect(full, p);
                p.setShader(null);
            } else {
                // 无封面：用主题色做渐变底
                int base = dark ? darken(accent, 0.55f) : accent;
                int c1 = adjust(base, dark ? 0.55f : 1.06f);
                int c2 = darken(base, dark ? 0.35f : 0.72f);
                LinearGradient g = new LinearGradient(0, 0, w, h,
                        new int[]{c1, c2}, new float[]{0f, 1f}, Shader.TileMode.CLAMP);
                p.setShader(g);
                c.drawRect(full, p);
                p.setShader(null);

                // 右上角柔光
                Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
                glow.setShader(new android.graphics.RadialGradient(
                        w * 0.9f, h * 0.05f, Math.max(w, h) * 0.62f,
                        new int[]{0x40FFFFFF, 0x00FFFFFF}, new float[]{0f, 1f}, Shader.TileMode.CLAMP));
                c.drawRect(full, glow);

                // 左下暗角，增加层次
                Paint vignette = new Paint(Paint.ANTI_ALIAS_FLAG);
                vignette.setShader(new android.graphics.RadialGradient(
                        w * 0.12f, h * 1.05f, Math.max(w, h) * 0.75f,
                        new int[]{0x33000000, 0x00000000}, new float[]{0f, 1f}, Shader.TileMode.CLAMP));
                c.drawRect(full, vignette);

                // 斜向高光条，模拟玻璃质感
                Paint shine = new Paint(Paint.ANTI_ALIAS_FLAG);
                shine.setShader(new LinearGradient(
                        0, 0, w * 0.9f, h * 0.9f,
                        new int[]{0x00FFFFFF, 0x1FFFFFFF, 0x00FFFFFF},
                        new float[]{0f, 0.42f, 0.65f}, Shader.TileMode.CLAMP));
                c.drawRect(full, shine);
            }

            // 圆角裁切
            Bitmap rounded = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas rc = new Canvas(rounded);
            Paint rp = new Paint(Paint.ANTI_ALIAS_FLAG);
            rp.setColor(Color.WHITE);
            float radius = Math.min(w, h) * 0.16f;
            rc.drawRoundRect(new RectF(0, 0, w, h), radius, radius, rp);
            rp.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
            rc.drawBitmap(out, 0, 0, rp);
            out.recycle();
            return rounded;
        } catch (Exception e) {
            return out;
        } catch (OutOfMemoryError e) {
            return out;
        }
    }

    private static Bitmap decodeCover(String path, int targetW, int targetH) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, bounds);
            if (bounds.outWidth <= 0) return null;

            int sample = 1;
            int need = Math.max(targetW, targetH);
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > need * 2) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.RGB_565;  // 省内存，小组件够用
            return BitmapFactory.decodeFile(path, opts);
        } catch (Exception e) {
            return null;
        } catch (OutOfMemoryError e) {
            return null;
        }
    }

    private static int adjust(int color, float factor) {
        int r = Math.min(255, Math.round(Color.red(color) * factor));
        int g = Math.min(255, Math.round(Color.green(color) * factor));
        int b = Math.min(255, Math.round(Color.blue(color) * factor));
        return Color.rgb(r, g, b);
    }

    private static int darken(int color, float factor) {
        return adjust(color, factor);
    }
}
