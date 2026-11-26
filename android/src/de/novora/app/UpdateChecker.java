package de.novora.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Prüft beim Start still auf ein neues APK, lädt es nach cache/updates und
 * übergibt es per ACTION_VIEW an den System-Installer.
 *
 * Sicherheit: nur HTTPS, SHA-256 aus dem Manifest ist Pflicht. Eine
 * Signaturprüfung des Manifests ist noch offen (siehe docs/UPDATES.md).
 */
public final class UpdateChecker {
    private static final String TAG = "NovoraUpdate";
    private static final String AUTHORITY = "de.novora.app.fileprovider";
    private static final String UPDATE_DIR = "updates";
    private static final int MANIFEST_TIMEOUT_MS = 5000;
    private static final int APK_TIMEOUT_MS = 30000;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    // Progress throttling: update dialog at most every 64 KB or 150 ms.
    private static final long PROGRESS_MIN_BYTES = 64 * 1024;
    private static final long PROGRESS_MIN_MS = 150;
    /** Schützt gegen parallele/doppelte Prüfungen (z.B. Activity-Neustart während des Checks). */
    private static final AtomicBoolean CHECK_RUNNING = new AtomicBoolean(false);
    /**
     * Schützt gegen einen zweiten Download. CHECK_RUNNING taugt dafür nicht, weil es
     * schon im finally des Prüf-Threads gelöst wird, während der Dialog noch offen ist.
     */
    private static final AtomicBoolean DOWNLOAD_RUNNING = new AtomicBoolean(false);
    /** true, solange der Update-Dialog offen ist – bis zum Dismiss, nicht nur bis zum Thread-Ende. */
    private static final AtomicBoolean DIALOG_RUNNING = new AtomicBoolean(false);

    private UpdateChecker() {
    }

    /** Startet die Prüfung im Hintergrund. Fehler bleiben still; nie zwei Läufe gleichzeitig. */
    public static void checkAndPrompt(final Activity activity) {
        if (activity == null) return;
        String url;
        try {
            url = activity.getString(R.string.update_manifest_url);
        } catch (Throwable t) {
            Log.w(TAG, "Keine Update-URL konfiguriert", t);
            return;
        }
        if (url == null || url.trim().length() == 0) return;
        if (!CHECK_RUNNING.compareAndSet(false, true)) {
            Log.d(TAG, "Update-Prüfung läuft bereits – Aufruf ignoriert");
            return;
        }
        final String manifestUrl = url;
        try {
            Thread thread = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        runCheck(activity, manifestUrl);
                    } catch (Throwable t) {
                        // offline / DNS / Parse-Fehler: niemals crashen
                        Log.w(TAG, "Update-Prüfung fehlgeschlagen: " + t);
                    } finally {
                        // Flag immer lösen, auch bei Exception – sonst bliebe die Prüfung gesperrt.
                        CHECK_RUNNING.set(false);
                    }
                }
            }, "novora-update-check");
            thread.setDaemon(true);
            thread.start();
        } catch (Throwable t) {
            CHECK_RUNNING.set(false);
            Log.w(TAG, "Update-Prüfung nicht startbar", t);
        }
    }

    private static void runCheck(final Activity activity, String manifestUrl) throws Exception {
        if (manifestUrl == null) return;
        manifestUrl = manifestUrl.trim();
        if (manifestUrl.startsWith("http://")) {
            Log.w(TAG, "Unverschlüsselte Update-URL abgelehnt: " + manifestUrl);
            return;
        }
        if (!manifestUrl.startsWith("https://")) {
            Log.w(TAG, "Ungültige Update-URL: " + manifestUrl);
            return;
        }
        if (activity.isFinishing()) return;

        final int currentCode = currentVersionCode(activity);
        String body = fetch(manifestUrl, MAX_MANIFEST_BYTES);
        JSONObject root = new JSONObject(body);
        JSONObject android = root.optJSONObject("android");
        if (android == null) return;

        final int remoteCode = android.optInt("versionCode", 0);
        if (remoteCode <= currentCode) return;

        final String version = firstNonEmpty(
                android.optString("version", ""),
                String.valueOf(remoteCode));
        final String rawApkUrl = android.optString("url", "").trim();
        final String apkUrl = resolveUrl(manifestUrl, rawApkUrl);
        final String sha256 = normalizeHex(android.optString("sha256", ""));
        final long size = android.optLong("size", 0);
        final String notes = firstNonEmpty(
                android.optString("notes", ""),
                root.optString("notes", ""));

        int minSupported = 0;
        JSONObject mins = root.optJSONObject("minSupported");
        if (mins == null) mins = android.optJSONObject("minSupported");
        if (mins != null) minSupported = mins.optInt("android", 0);
        final boolean forced = minSupported > currentCode;

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                showUpdateDialog(activity, version, remoteCode, currentCode,
                        notes, forced, apkUrl, sha256, size);
            }
        });
    }

    private static String resolveUrl(String baseUrl, String raw) {
        if (raw == null || raw.length() == 0) return "";
        if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
        try {
            return new URL(new URL(baseUrl), raw).toString();
        } catch (Throwable t) {
            return raw;
        }
    }

    private static void showUpdateDialog(final Activity activity, String version,
                                         int remoteCode, int currentCode, String notes,
                                         boolean forced, final String apkUrl,
                                         final String sha256, final long size) {
        if (activity.isFinishing()) return;
        // Ein bereits offener Update-Dialog bleibt allein (kein zweiter Dialog, kein Doppel-Download).
        if (!DIALOG_RUNNING.compareAndSet(false, true)) return;

        StringBuilder msg = new StringBuilder();
        msg.append("Version ").append(version).append(" verfügbar");
        msg.append(" (installiert: Code ").append(currentCode).append(").");
        if (notes != null && notes.length() > 0) {
            msg.append("\n\n").append(notes);
        }
        if (forced) {
            msg.append("\n\nDieses Update ist erforderlich.");
        }
        if (apkUrl.length() == 0) {
            msg.append("\n\nHinweis: im Manifest fehlt die Download-URL.");
        }

        AlertDialog.Builder b = new AlertDialog.Builder(activity)
                .setTitle("Novora aktualisieren")
                .setMessage(msg.toString())
                .setCancelable(!forced)
                .setPositiveButton("Installieren", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (apkUrl.length() == 0) {
                            Toast.makeText(activity, "Keine Download-URL im Manifest",
                                    Toast.LENGTH_LONG).show();
                            return;
                        }
                        if (!ensureInstallPermission(activity)) return;
                        startDownload(activity, version, apkUrl, sha256, size);
                    }
                });
        if (!forced) {
            b.setNegativeButton("Später", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface d, int which) {
                    d.dismiss();
                }
            });
        }
        // Flag bis zum Dismiss halten, damit ein späterer Check keinen zweiten Dialog aufbaut.
        b.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                DIALOG_RUNNING.set(false);
            }
        });
        try {
            b.show();
        } catch (Throwable t) {
            DIALOG_RUNNING.set(false);
            Log.w(TAG, "Update-Dialog nicht anzeigbar", t);
        }
    }

    /** Android 8+: Installation aus unbekannten Quellen muss erlaubt sein. */
    private static boolean ensureInstallPermission(final Activity activity) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
            if (activity.getPackageManager().canRequestPackageInstalls()) return true;
        } catch (Throwable t) {
            Log.w(TAG, "Installationsberechtigung nicht prüfbar", t);
            return true; // Installer entscheidet selbst
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(i);
        } catch (Exception e) {
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES));
            } catch (Exception ignored) {
            }
        }
        Toast.makeText(activity,
                "Installation aus dieser Quelle erlauben und erneut starten",
                Toast.LENGTH_LONG).show();
        return false;
    }

    private static void startDownload(final Activity activity, String version,
                                      final String apkUrl, final String sha256,
                                      final long size) {
        if (!apkUrl.startsWith("https://")) {
            Log.w(TAG, "APK-URL ist nicht HTTPS: " + apkUrl);
            Toast.makeText(activity, "Unsicheres Update abgelehnt", Toast.LENGTH_LONG).show();
            return;
        }
        if (sha256.length() == 0) {
            Log.w(TAG, "Manifest ohne SHA-256 – Download abgelehnt");
            Toast.makeText(activity, "Manifest ohne Prüfsumme – Update abgelehnt",
                    Toast.LENGTH_LONG).show();
            return;
        }
        if (activity.isFinishing()) return;
        // Ab hier läuft der Download: genau ein Lauf gleichzeitig, unabhängig von CHECK_RUNNING.
        if (!DOWNLOAD_RUNNING.compareAndSet(false, true)) {
            Toast.makeText(activity, "Update wird bereits geladen", Toast.LENGTH_SHORT).show();
            return;
        }

        final ProgressDialog dialog;
        try {
            dialog = createProgressDialog(activity, version, size);
            dialog.show();
        } catch (Throwable t) {
            // activity gone or bad token: ohne Dialog nicht weiterladen
            DOWNLOAD_RUNNING.set(false);
            Log.w(TAG, "Fortschrittsdialog nicht anzeigbar", t);
            return;
        }
        final DialogProgress listener = new DialogProgress(activity, dialog);

        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                final File dir = new File(activity.getCacheDir(), UPDATE_DIR);
                File target = null;
                try {
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IOException("Verzeichnis " + dir + " nicht anlegbar");
                    }
                    target = new File(dir, "novora-update.apk");
                    download(apkUrl, target, sha256, size, listener);
                    final File ready = target;
                    dismissProgress(activity, dialog);
                    activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (!activity.isFinishing()) install(activity, ready);
                        }
                    });
                    DOWNLOAD_RUNNING.set(false);
                } catch (final Throwable e) {
                    DOWNLOAD_RUNNING.set(false);
                    Log.w(TAG, "Update-Download fehlgeschlagen: " + e);
                    dismissProgress(activity, dialog);
                    if (target != null && target.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        target.delete();
                    }
                    activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(activity,
                                    "Update fehlgeschlagen: " + e.getMessage(),
                                    Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }, "novora-update-download");
        t.setDaemon(true);
        try {
            t.start();
        } catch (Throwable e) {
            DOWNLOAD_RUNNING.set(false);
            dismissProgress(activity, dialog);
            Log.w(TAG, "Download-Thread nicht startbar", e);
        }
    }

    private static ProgressDialog createProgressDialog(Activity activity, String version,
                                                       long expectedSize) {
        ProgressDialog d = new ProgressDialog(activity);
        d.setTitle("Update wird geladen");
        d.setMessage("Version " + version + " …");
        d.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        d.setMax(100);
        d.setProgress(0);
        if (expectedSize > 0) {
            d.setIndeterminate(false);
        } else {
            d.setIndeterminate(true);
        }
        d.setCancelable(false);
        d.setCanceledOnTouchOutside(false);
        return d;
    }

    /** Closes the dialog on the UI thread; never throws, safe after activity teardown. */
    private static void dismissProgress(Activity activity, final ProgressDialog dialog) {
        if (dialog == null) return;
        try {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (dialog.isShowing()) dialog.dismiss();
                    } catch (Throwable t) {
                        Log.w(TAG, "Dialog nicht schließbar", t);
                    }
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "Dialog nicht schließbar", t);
        }
    }

    /** Progress callback from the download thread. */
    private interface DownloadListener {
        /** Total bytes once known (> 0), called before the body is read. */
        void onTotal(long totalBytes);

        /** Bytes written so far; totalBytes <= 0 means unknown. */
        void onProgress(long written, long totalBytes);
    }

    /** Maps download progress onto the ProgressDialog via the UI thread. */
    private static final class DialogProgress implements DownloadListener {
        private final Activity activity;
        private final ProgressDialog dialog;
        private volatile long knownTotal;

        DialogProgress(Activity activity, ProgressDialog dialog) {
            this.activity = activity;
            this.dialog = dialog;
        }

        @Override
        public void onTotal(final long totalBytes) {
            if (totalBytes <= 0) return;
            knownTotal = totalBytes;
            post(new Runnable() {
                @Override
                public void run() {
                    if (!dialog.isShowing()) return;
                    dialog.setIndeterminate(false);
                    dialog.setMax(100);
                    dialog.setProgress(0);
                    dialog.setMessage(kb(0) + "/" + kb(totalBytes) + " KB");
                }
            });
        }

        @Override
        public void onProgress(final long written, final long totalBytes) {
            final long total = totalBytes > 0 ? totalBytes : knownTotal;
            post(new Runnable() {
                @Override
                public void run() {
                    if (!dialog.isShowing()) return;
                    if (total > 0) {
                        int pct = (int) Math.min(100L, written * 100L / total);
                        dialog.setIndeterminate(false);
                        dialog.setMax(100);
                        dialog.setProgress(pct);
                        dialog.setMessage(pct + " %  ·  "
                                + kb(written) + "/" + kb(total) + " KB");
                    } else {
                        dialog.setMessage(kb(written) + " KB geladen");
                    }
                }
            });
        }

        private void post(final Runnable r) {
            try {
                if (activity.isFinishing()) return;
                activity.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            r.run();
                        } catch (Throwable t) {
                            Log.w(TAG, "Fortschritt nicht aktualisierbar", t);
                        }
                    }
                });
            } catch (Throwable t) {
                Log.w(TAG, "Fortschritt nicht aktualisierbar", t);
            }
        }

        private static long kb(long bytes) {
            return Math.max(0L, bytes) / 1024L;
        }
    }

    private static void download(String apkUrl, File target, String expectedSha,
                                 long expectedSize, DownloadListener listener)
            throws Exception {
        HttpURLConnection c = null;
        FileOutputStream out = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(apkUrl).openConnection();
            c.setConnectTimeout(APK_TIMEOUT_MS);
            c.setReadTimeout(APK_TIMEOUT_MS);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);

            // Content-Length wins over the manifest size when both are present.
            long total = c.getContentLengthLong();
            if (total <= 0) total = expectedSize;
            if (total > 0 && listener != null) listener.onTotal(total);

            MessageDigest md = MessageDigest.getInstance("SHA-256");
            out = new FileOutputStream(target);
            in = c.getInputStream();
            byte[] buf = new byte[16 * 1024];
            long written = 0;
            long lastBytes = 0;
            long lastAt = System.currentTimeMillis();
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
                out.write(buf, 0, n);
                written += n;
                long now = System.currentTimeMillis();
                if (listener != null && (written - lastBytes >= PROGRESS_MIN_BYTES
                        || now - lastAt >= PROGRESS_MIN_MS)) {
                    lastBytes = written;
                    lastAt = now;
                    listener.onProgress(written, total);
                }
            }
            out.flush();
            if (listener != null) listener.onProgress(written, total);
            if (expectedSize > 0 && written != expectedSize) {
                throw new IOException("Größe " + written + " != " + expectedSize);
            }
            String actual = toHex(md.digest());
            if (!actual.equalsIgnoreCase(expectedSha)) {
                throw new IOException("SHA-256 stimmt nicht");
            }
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException ignored) {
                }
            }
            if (out != null) {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
            if (c != null) c.disconnect();
        }
    }

    private static void install(Activity activity, File apk) {
        try {
            Uri uri = Uri.parse("content://" + AUTHORITY + "/" + UPDATE_DIR + "/" + apk.getName());
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Throwable t) {
            Log.w(TAG, "Installations-Intent fehlgeschlagen", t);
            Toast.makeText(activity, "Installer konnte nicht geöffnet werden",
                    Toast.LENGTH_LONG).show();
        }
    }

    // ---------------------------------------------------------------- Hilfen

    private static int currentVersionCode(Activity activity) {
        try {
            PackageInfo pi = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            return pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            Log.w(TAG, "Eigene Version nicht lesbar", e);
            return 0;
        }
    }

    private static String fetch(String url, int maxBytes) throws IOException {
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(MANIFEST_TIMEOUT_MS);
            c.setReadTimeout(MANIFEST_TIMEOUT_MS);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            in = c.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) {
                bos.write(buf, 0, n);
                if (bos.size() > maxBytes) throw new IOException("Manifest zu groß");
            }
            return new String(bos.toByteArray(), "UTF-8");
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException ignored) {
                }
            }
            if (c != null) c.disconnect();
        }
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && a.trim().length() > 0) return a.trim();
        if (b != null) return b.trim();
        return "";
    }

    private static String normalizeHex(String s) {
        return s == null ? "" : s.trim().toLowerCase();
    }

    private static String toHex(byte[] data) {
        StringBuilder sb = new StringBuilder(data.length * 2);
        for (int i = 0; i < data.length; i++) {
            int v = data[i] & 0xff;
            if (v < 16) sb.append('0');
            sb.append(Integer.toHexString(v));
        }
        return sb.toString();
    }

    /**
     * Minimaler Ersatz für androidx FileProvider (keine Gradle-Abhängigkeiten):
     * liefert ausschließlich Dateien aus cache/updates read-only aus.
     */
    public static class UpdateFileProvider extends ContentProvider {
        private static final String[] PROJECTION = {
                OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE
        };

        @Override
        public boolean onCreate() {
            return true;
        }

        private File resolveFile(Uri uri) {
            String path = uri == null ? null : uri.getPath();
            if (path == null) return null;
            while (path.startsWith("/")) path = path.substring(1);
            if (!path.startsWith(UPDATE_DIR + "/")) return null;
            String name = path.substring(UPDATE_DIR.length() + 1);
            if (name.length() == 0 || name.contains("..")
                    || name.contains("/") || name.contains("\\")) {
                return null;
            }
            Context ctx = getContext();
            if (ctx == null) return null;
            return new File(new File(ctx.getCacheDir(), UPDATE_DIR), name);
        }

        @Override
        public ParcelFileDescriptor openFile(Uri uri, String mode)
                throws FileNotFoundException {
            if (mode != null && mode.contains("w")) {
                throw new FileNotFoundException("read-only");
            }
            File f = resolveFile(uri);
            if (f == null || !f.isFile()) {
                throw new FileNotFoundException(String.valueOf(uri));
            }
            return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
        }

        @Override
        public Cursor query(Uri uri, String[] projection, String selection,
                            String[] selectionArgs, String sortOrder) {
            File f = resolveFile(uri);
            if (f == null || !f.isFile()) return null;
            String[] cols = PROJECTION;
            if (projection != null && projection.length > 0) cols = projection;
            MatrixCursor cursor = new MatrixCursor(cols, 1);
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                    row[i] = f.getName();
                } else if (OpenableColumns.SIZE.equals(cols[i])) {
                    row[i] = f.length();
                } else {
                    row[i] = null;
                }
            }
            cursor.addRow(row);
            return cursor;
        }

        @Override
        public String getType(Uri uri) {
            return "application/vnd.android.package-archive";
        }

        @Override
        public Uri insert(Uri uri, ContentValues values) {
            throw new UnsupportedOperationException("read-only provider");
        }

        @Override
        public int delete(Uri uri, String selection, String[] selectionArgs) {
            throw new UnsupportedOperationException("read-only provider");
        }

        @Override
        public int update(Uri uri, ContentValues values, String selection,
                          String[] selectionArgs) {
            throw new UnsupportedOperationException("read-only provider");
        }
    }
}
