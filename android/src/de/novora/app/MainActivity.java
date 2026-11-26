package de.novora.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.net.DhcpInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.WindowManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String PREFS = "novora";
    /** Wert ist immer "ip:port", z. B. "192.168.0.12:47830". */
    private static final String KEY = "server";
    private static final int DEFAULT_PORT = 47830;
    private static final int DISC_PORT = 47831;
    private static final int REQ_SCAN = 4101;
    private static final int REQ_CAM_PERM = 4102;
    /** Eigene Authority; "de.novora.app.fileprovider" gehört bereits dem UpdateChecker. */
    static final String SCAN_AUTHORITY = "de.novora.app.scan";
    private static final String SCAN_DIR = "scan";

    private WebView web;
    private SharedPreferences prefs;
    private long lastBack = 0;
    private File scanFile;
    private Uri scanUri;

    /** true, solange eine Suche läuft (verhindert parallele Dialoge/Suchen). */
    private boolean discovering = false;
    /** true, wenn für die aktuelle Seite bereits automatisch gesucht wurde. */
    private boolean autoDiscoverStarted = false;
    private long lastAutoDiscoverAt = 0;
    private boolean offlineDialogOpen = false;
    /** Seite des letzten Fehlversuchs (für "Erneut versuchen" / onResume). */
    private String lastUrl = "";
    /** true, wenn die aktuell geladene Seite vollständig geladen wurde. */
    private boolean pageOk = false;
    /** true, wenn beim laufenden Laden ein Main-Frame-Fehler auftrat. */
    private boolean navError = false;
    private long lastErrorAt = 0;
    /** true, sobald die Activity pausiert war (steuert das Resume-Verhalten). */
    private boolean wasPaused = false;

    /**
     * Versionsname aus dem Manifest (kein BuildConfig vorhanden, da kein Gradle).
     * Einzige Quelle ist PackageInfo.versionName; der Fallback ist bewusst neutral,
     * damit hier nie eine veraltete Version steht.
     */
    private String appVersion() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (pi.versionName != null && pi.versionName.length() > 0) return pi.versionName;
        } catch (Throwable ignored) {
        }
        return "0.0.0";
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Smartphones (<600dp) fest im Querformat, Tablets (>=600dp) frei drehbar.
        int sw = getResources().getConfiguration().smallestScreenWidthDp;
        setRequestedOrientation(sw < 600
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0D1117"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " NovoraApp/" + appVersion());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                navError = false;
                if (url != null && url.length() > 0 && !url.startsWith("about:")) {
                    lastUrl = url;
                    pageOk = false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (navError) return;
                if (url == null || url.startsWith("about:")) return;
                pageOk = true;
                autoDiscoverStarted = false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req == null || !req.isForMainFrame()) return;
                String url = req.getUrl() == null ? "" : req.getUrl().toString();
                if (url.startsWith("about:")) return;
                navError = true;
                pageOk = false;
                lastErrorAt = System.currentTimeMillis();
                onMainFrameFailure();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req,
                                            WebResourceResponse res) {
                if (req == null || !req.isForMainFrame()) return;
                int code = res == null ? 0 : res.getStatusCode();
                // Lizenzsperre des PC-Servers: der PC ist erreichbar, nur die Lizenz fehlt.
                if (code == 401 || code == 402 || code == 403) {
                    pageOk = true;
                    autoDiscoverStarted = false;
                    Toast.makeText(MainActivity.this,
                            "Lizenz auf dem PC aktivieren – dann erneut verbinden",
                            Toast.LENGTH_LONG).show();
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "NovoraNative");
        setContentView(web);
        enterImmersive();

        if (!handlePairIntent(getIntent())) {
            String saved = prefs.getString(KEY, "");
            if (saved.trim().isEmpty()) discover();
            else loadServer(saved);
        }

        // Stille Update-Prüfung im Hintergrund, leicht verzögert damit der
        // Discovery-Dialog nicht überlagert wird. Fehler bleiben intern.
        web.postDelayed(new Runnable() {
            @Override
            public void run() {
                UpdateChecker.checkAndPrompt(MainActivity.this);
            }
        }, 3000);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handlePairIntent(intent);
    }

    /** Verarbeitet Deep-Links wie novora://pair?host=192.168.0.12&port=47830&code=123456. */
    private boolean handlePairIntent(Intent intent) {
        if (intent == null) return false;
        Uri data = intent.getData();
        if (data == null || !"novora".equalsIgnoreCase(data.getScheme())) return false;
        if (!"pair".equalsIgnoreCase(data.getHost())) return false;
        String host = data.getQueryParameter("host");
        if (host == null || host.trim().isEmpty()) host = data.getQueryParameter("ip");
        String portStr = data.getQueryParameter("port");
        String code = data.getQueryParameter("code");
        String raw = (host == null ? "" : host.trim())
                + (portStr != null && !portStr.trim().isEmpty() ? ":" + portStr.trim() : "");
        String[] addr = splitAddr(raw);
        if (addr == null) return false;
        int port = Integer.parseInt(addr[1]);
        saveServer(addr[0], port);
        load(addr[0], port, code);
        return true;
    }

    /* ---------- Server-Adresse: "ip:port" ---------- */

    /**
     * Zerlegt "192.168.0.12", "192.168.0.12:47830", "http://192.168.0.12:47830/app"
     * in {ip, port}. Liefert null, wenn keine gültige IPv4-Adresse erkennbar ist.
     */
    static String[] splitAddr(String value) {
        if (value == null) return null;
        String s = value.trim();
        if (s.length() == 0 || s.length() > 128) return null;
        if (s.regionMatches(true, 0, "http://", 0, 7)) s = s.substring(7);
        else if (s.regionMatches(true, 0, "https://", 0, 8)) s = s.substring(8);
        int slash = s.indexOf('/');
        if (slash >= 0) s = s.substring(0, slash);
        int port = DEFAULT_PORT;
        int colon = s.lastIndexOf(':');
        if (colon > 0) {
            String p = s.substring(colon + 1);
            s = s.substring(0, colon);
            if (!p.matches("\\d{1,5}")) return null;
            int parsed = Integer.parseInt(p);
            if (parsed < 1 || parsed > 65535) return null;
            port = parsed;
        }
        if (!s.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return null;
        for (String octet : s.split("\\.")) {
            if (Integer.parseInt(octet) > 255) return null;
        }
        return new String[]{s, String.valueOf(port)};
    }

    /** Gespeicherte Adresse als {ip, port}. */
    private String[] storedServer() {
        String[] s = splitAddr(prefs.getString(KEY, ""));
        return s == null ? new String[]{"", String.valueOf(DEFAULT_PORT)} : s;
    }

    private void saveServer(String ip, int port) {
        prefs.edit().putString(KEY, ip + ":" + port).apply();
    }

    private void loadServer(String value) {
        String[] s = splitAddr(value);
        if (s == null) {
            discover();
            return;
        }
        load(s[0], Integer.parseInt(s[1]));
    }

    private void load(String ip, int port) {
        load(ip, port, null);
    }

    /** Lädt /app, mit Kopplungscode optional als ?pair=… (app.js koppelt dann automatisch). */
    private void load(String ip, int port, String code) {
        pageOk = false;
        navError = false;
        String url = "http://" + ip + ":" + port + "/app";
        if (code != null && code.matches("\\d{6}")) url += "?pair=" + Uri.encode(code);
        lastUrl = url;
        web.loadUrl(lastUrl);
    }

    /** Lädt die zuletzt verwendete Adresse erneut ("Erneut versuchen"). */
    private void reloadLast() {
        String[] s = storedServer();
        if (s[0].isEmpty()) {
            discover();
            return;
        }
        load(s[0], Integer.parseInt(s[1]));
    }

    /**
     * Main-Frame-Fehler: genau einmal pro Seite automatisch suchen, danach nur
     * noch den Dialog anbieten. Kein Endlos-Reload.
     */
    private void onMainFrameFailure() {
        if (isFinishing()) return;
        if (discovering) return;
        long now = System.currentTimeMillis();
        if (autoDiscoverStarted || now - lastAutoDiscoverAt < 5000) {
            showOfflineDialog();
            return;
        }
        autoDiscoverStarted = true;
        lastAutoDiscoverAt = now;
        Toast.makeText(this, "PC nicht erreichbar – Suche im WLAN", Toast.LENGTH_SHORT).show();
        discover();
    }

    /** Sucht PCs per UDP-Broadcast und zeigt sie als Liste. */
    private void discover() {
        if (isFinishing()) return;
        if (discovering) return;
        discovering = true;

        final ProgressDialog pd = new ProgressDialog(this);
        pd.setMessage("Suche PCs im WLAN …");
        pd.setCancelable(false);
        pd.show();

        new Thread(() -> {
            final List<String[]> found = new ArrayList<>();
            final Set<String> seen = new LinkedHashSet<>();
            DatagramSocket sock = null;
            try {
                sock = new DatagramSocket();
                sock.setBroadcast(true);
                sock.setSoTimeout(300);
                byte[] probe = "{\"t\":\"discover\"}".getBytes(StandardCharsets.UTF_8);
                List<InetAddress> targets = new ArrayList<>();
                targets.add(InetAddress.getByName("255.255.255.255"));
                try {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        DhcpInfo d = wm.getDhcpInfo();
                        if (d != null && d.ipAddress != 0) {
                            int bc = (d.ipAddress & d.netmask) | (~d.netmask);
                            byte[] addr = new byte[]{
                                    (byte) (bc & 0xff), (byte) ((bc >> 8) & 0xff),
                                    (byte) ((bc >> 16) & 0xff), (byte) ((bc >> 24) & 0xff)
                            };
                            targets.add(InetAddress.getByAddress(addr));
                        }
                    }
                } catch (Exception ignored) {
                }
                for (InetAddress target : targets) {
                    sock.send(new DatagramPacket(probe, probe.length, target, DISC_PORT));
                }

                long end = System.currentTimeMillis() + 1600;
                byte[] buf = new byte[2048];
                while (System.currentTimeMillis() < end) {
                    try {
                        DatagramPacket p = new DatagramPacket(buf, buf.length);
                        sock.receive(p);
                        String json = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                        JSONObject o = new JSONObject(json);
                        String type = o.optString("t");
                        if (!"novora".equals(type)) continue;
                        String ip = p.getAddress().getHostAddress();
                        if (!seen.add(ip)) continue;
                        String name = o.optString("name", "PC");
                        int port = o.optInt("port", DEFAULT_PORT);
                        if (port < 1 || port > 65535) port = DEFAULT_PORT;
                        found.add(new String[]{name, ip, String.valueOf(port)});
                    } catch (SocketTimeoutException ignored) {
                    } catch (Exception ignored) {
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (sock != null) sock.close();
            }

            runOnUiThread(() -> {
                discovering = false;
                if (!isFinishing()) pd.dismiss();
                showFound(found);
            });
        }).start();
    }

    private void showFound(List<String[]> found) {
        if (isFinishing()) return;
        if (found.isEmpty()) {
            showOfflineDialog();
            return;
        }
        String[] labels = new String[found.size()];
        for (int i = 0; i < found.size(); i++) {
            labels[i] = found.get(i)[0] + "\n" + found.get(i)[1] + ":" + found.get(i)[2];
        }
        new AlertDialog.Builder(this)
                .setTitle("PC im WLAN wählen")
                .setItems(labels, (d, which) -> {
                    String ip = found.get(which)[1];
                    int port = Integer.parseInt(found.get(which)[2]);
                    saveServer(ip, port);
                    load(ip, port);
                })
                .setPositiveButton("Neu suchen", (d, w) -> discover())
                .setNegativeButton("IP manuell", (d, w) -> askServer("PC-IP eingeben"))
                .setNeutralButton("Abbrechen", (d, w) -> finish())
                .show();
    }

    /** Dialog nach fehlgeschlagenem Laden oder leerer Suche. */
    private void showOfflineDialog() {
        if (isFinishing() || offlineDialogOpen) return;
        offlineDialogOpen = true;
        new AlertDialog.Builder(this)
                .setTitle("PC nicht erreichbar")
                .setMessage("Novora sucht den PC im WLAN. Alternativ die IP des PCs manuell eingeben.")
                .setCancelable(true)
                .setPositiveButton("PC suchen", (d, w) -> {
                    offlineDialogOpen = false;
                    discover();
                })
                .setNegativeButton("IP manuell", (d, w) -> {
                    offlineDialogOpen = false;
                    askServer("PC-IP eingeben");
                })
                .setNeutralButton("Erneut versuchen", (d, w) -> {
                    offlineDialogOpen = false;
                    reloadLast();
                })
                .setOnCancelListener(d -> offlineDialogOpen = false)
                .show();
    }

    private void askServer(String title) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);

        TextView hint = new TextView(this);
        hint.setText("IP des PCs im WLAN, Port optional: 192.168.0.12:47830");
        hint.setTextSize(13);
        box.addView(hint);

        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setHint("192.168.0.12:47830");
        String[] stored = storedServer();
        input.setText(stored[0].isEmpty() ? "" : stored[0] + ":" + stored[1]);
        box.addView(input);

        TextView note = new TextView(this);
        note.setText("Ohne Port wird " + DEFAULT_PORT + " verwendet.");
        note.setTextSize(11);
        note.setPadding(0, pad / 2, 0, 0);
        box.addView(note);

        new AlertDialog.Builder(this)
                .setTitle(title)
                .setView(box)
                .setCancelable(false)
                .setPositiveButton("Verbinden", (d, w) -> {
                    String[] addr = splitAddr(input.getText().toString());
                    if (addr == null) {
                        Toast.makeText(this, "Ungültige IP", Toast.LENGTH_SHORT).show();
                        askServer(title);
                        return;
                    }
                    int port = Integer.parseInt(addr[1]);
                    saveServer(addr[0], port);
                    load(addr[0], port);
                })
                .setNegativeButton("Beenden", (d, w) -> finish())
                .show();
    }

    /* ---------- Native QR-Erkennung (Foto über System-Kamera + ZXing) ---------- */

    /** JS-Bridge: window.NovoraNative */
    public class Bridge {
        @JavascriptInterface
        public void chooseServer() {
            runOnUiThread(() -> discover());
        }

        @JavascriptInterface
        public boolean hasScanner() {
            return true;
        }

        @JavascriptInterface
        public void scanQr() {
            runOnUiThread(() -> startScan());
        }

        /** Diagnose für die Web-UI: gespeicherte Server-Adresse (ohne Geheimnisse). */
        @JavascriptInterface
        public String getServer() {
            String[] s = storedServer();
            JSONObject o = new JSONObject();
            try {
                o.put("ip", s[0]);
                o.put("port", Integer.parseInt(s[1]));
                String url = web == null ? "" : web.getUrl();
                o.put("url", url == null ? "" : url);
                o.put("online", pageOk);
            } catch (Exception ignored) {
            }
            return o.toString();
        }
    }

    private void startScan() {
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM_PERM);
            return;
        }
        launchCamera();
    }

    private void launchCamera() {
        try {
            File dir = new File(getCacheDir(), SCAN_DIR);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("cache");
            scanFile = new File(dir, "scan.jpg");
            if (scanFile.exists() && !scanFile.delete()) throw new IllegalStateException("cleanup");
            scanUri = Uri.parse("content://" + SCAN_AUTHORITY + "/" + SCAN_DIR + "/" + scanFile.getName());

            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, scanUri);
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // Kein resolveActivity-Vorabcheck (liefert ohne <queries> auf API 30+ false negatives);
            // ob eine Kamera-App existiert, entscheidet erst startActivityForResult.
            startActivityForResult(cam, REQ_SCAN);
        } catch (ActivityNotFoundException e) {
            scanFailed(R.string.scan_no_camera);
        } catch (Exception e) {
            scanFailed(R.string.scan_failed);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_CAM_PERM) return;
        boolean granted = grantResults != null && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) launchCamera();
        else scanFailed(R.string.scan_perm_denied);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SCAN) return;
        if (resultCode != RESULT_OK || scanFile == null || !scanFile.isFile() || scanFile.length() == 0) {
            scanFailed(R.string.scan_cancelled);
            return;
        }
        String text = decodeQr(scanFile);
        if (text == null || text.trim().isEmpty()) {
            scanFailed(R.string.scan_no_qr);
            return;
        }

        // Kopplungs-QR: novora://pair?ip=…&port=…&code=…  (Secret wird nie ausgewertet/geloggt)
        String[] pair = parsePair(text);
        if (pair != null) {
            String ip = pair[0];
            int port = Integer.parseInt(pair[1]);
            String code = pair.length > 2 ? pair[2] : null;
            saveServer(ip, port);
            if (isCurrentServer(ip, port)) {
                // Nur eine bereinigte Kopplungs-URL weiterreichen: der Original-QR-Text
                // enthält ggf. secret=… und darf nicht ins DOM/JS gelangen.
                forwardScan(pairUri(ip, port, code));
            } else {
                // Anderer PC: Seite mit Code laden, damit app.js beim Start automatisch koppelt.
                load(ip, port, code);
            }
            return;
        }
        forwardScan(text);
    }

    /** Baut die Kopplungs-URL; Code ja, Secret/v=… nie. */
    private static String pairUri(String ip, int port, String code) {
        String base = "novora://pair?ip=" + Uri.encode(ip) + "&port=" + port;
        if (code != null && code.matches("\\d{6}")) base += "&code=" + code;
        return base;
    }

    /** Reicht den gescannten Text an die Web-UI weiter. */
    private void forwardScan(String text) {
        if (web == null) return;
        final String js = "window.onNativeScan && window.onNativeScan(" + JSONObject.quote(text) + ")";
        web.evaluateJavascript(js, null);
    }

    /** Zeigt die Web-UI bereits genau diese Adresse? */
    private boolean isCurrentServer(String ip, int port) {
        if (web == null) return false;
        String url = web.getUrl();
        if (url == null || url.length() == 0) return false;
        String[] cur = splitAddr(url);
        return cur != null && cur[0].equals(ip) && cur[1].equals(String.valueOf(port));
    }

    /**
     * Liest novora://pair?ip=…&amp;port=…&amp;code=… (Port optional, Default 47830).
     * Liefert {ip, port} bzw. {ip, port, code} (code nur wenn 6 Ziffern).
     * Liefert null, wenn keine gültige Adresse erkennbar ist. Unbekannte Parameter
     * wie secret/v werden bewusst ignoriert und nicht protokolliert.
     */
    static String[] parsePair(String text) {
        if (text == null) return null;
        String t = text.trim();
        if (t.length() == 0 || t.length() > 2048) return null;
        int q = t.indexOf('?');
        String head = (q >= 0 ? t.substring(0, q) : t).trim();
        while (head.endsWith("/")) head = head.substring(0, head.length() - 1);
        if (!"novora://pair".equalsIgnoreCase(head) && !"novora:pair".equalsIgnoreCase(head)) {
            return null;
        }
        String ip = null;
        String portStr = null;
        String codeStr = null;
        if (q >= 0) {
            for (String part : t.substring(q + 1).split("&")) {
                int eq = part.indexOf('=');
                if (eq <= 0) continue;
                String k = part.substring(0, eq).trim();
                String v = Uri.decode(part.substring(eq + 1)).trim();
                if ("ip".equalsIgnoreCase(k)) ip = v;
                else if ("port".equalsIgnoreCase(k)) portStr = v;
                else if ("code".equalsIgnoreCase(k)) codeStr = v;
            }
        }
        if (ip == null) return null;
        String joined = portStr == null || portStr.isEmpty() ? ip : ip + ":" + portStr;
        String[] addr = splitAddr(joined);
        if (addr == null) return null;
        String digits = codeStr == null ? "" : codeStr.replaceAll("\\D", "");
        if (digits.length() > 6) digits = digits.substring(0, 6);
        if (digits.length() == 6) return new String[]{addr[0], addr[1], digits};
        return addr;
    }

    /** Liest das Foto und dekodiert ausschließlich QR-Codes. */
    private String decodeQr(File file) {
        try {
            BitmapFactory.Options probe = new BitmapFactory.Options();
            probe.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), probe);
            int sample = 1;
            int max = Math.max(probe.outWidth, probe.outHeight);
            while (max / sample > 1600) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
            if (bmp == null) return null;
            int w = bmp.getWidth();
            int h = bmp.getHeight();
            int[] px = new int[w * h];
            bmp.getPixels(px, 0, w, 0, 0, w, h);
            bmp.recycle();
            if (w < 8 || h < 8) return null;

            BinaryBitmap bitmap = new BinaryBitmap(
                    new HybridBinarizer(new RGBLuminanceSource(w, h, px)));
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");
            Result r = new MultiFormatReader().decode(bitmap, hints);
            return r == null ? null : r.getText();
        } catch (NotFoundException e) {
            return null;
        } catch (Exception | OutOfMemoryError e) {
            return null;
        }
    }

    private void scanFailed(int resId) {
        final String msg = getString(resId);
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
        if (web == null) return;
        web.evaluateJavascript("window.onNativeScanFailure && window.onNativeScanFailure("
                + JSONObject.quote(msg) + ")", null);
    }

    private void enterImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    /**
     * Nur nach Fehlerseite/about:blank erneut laden – eine gesunde Seite bleibt
     * beim Resume unangetastet (kein Reload-Loop, kein Zustandsverlust).
     */
    @Override
    protected void onResume() {
        super.onResume();
        if (!wasPaused) return; // Erststart nach onCreate: dort wird bereits geladen
        wasPaused = false;
        if (web == null) return;
        if (lastUrl.length() == 0) return;
        String url = web.getUrl();
        boolean blank = url == null || url.length() == 0 || url.startsWith("about:");
        if (blank) {
            reloadLast();
            return;
        }
        if (!pageOk && navError && System.currentTimeMillis() - lastErrorAt > 2000) {
            reloadLast();
        }
    }

    @Override
    protected void onPause() {
        wasPaused = true;
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) {
            super.onBackPressed();
        } else {
            lastBack = now;
            Toast.makeText(this, "Nochmal drücken zum Beenden", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
        }
        super.onDestroy();
    }

    /**
     * Minimaler FileProvider-Ersatz (keine androidx-Abhängigkeiten): gibt
     * ausschließlich cache/scan/&lt;name&gt; schreib- und lesbar frei, damit die
     * System-Kamera das Foto ablegen darf.
     */
    public static class ScanProvider extends ContentProvider {
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
            if (!path.startsWith(SCAN_DIR + "/")) return null;
            String name = path.substring(SCAN_DIR.length() + 1);
            if (name.length() == 0 || name.contains("..")
                    || name.contains("/") || name.contains("\\")) {
                return null;
            }
            Context ctx = getContext();
            if (ctx == null) return null;
            return new File(new File(ctx.getCacheDir(), SCAN_DIR), name);
        }

        @Override
        public ParcelFileDescriptor openFile(Uri uri, String mode)
                throws FileNotFoundException {
            File f = resolveFile(uri);
            if (f == null) throw new FileNotFoundException(String.valueOf(uri));
            File dir = f.getParentFile();
            if (dir != null && !dir.isDirectory() && !dir.mkdirs()) {
                throw new FileNotFoundException("cache unavailable");
            }
            if (mode != null && mode.contains("w")) {
                return ParcelFileDescriptor.open(f,
                        ParcelFileDescriptor.MODE_WRITE_ONLY
                                | ParcelFileDescriptor.MODE_CREATE
                                | ParcelFileDescriptor.MODE_TRUNCATE);
            }
            if (!f.isFile()) throw new FileNotFoundException(String.valueOf(uri));
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
            return "image/jpeg";
        }

        @Override
        public Uri insert(Uri uri, ContentValues values) {
            throw new UnsupportedOperationException("insert not supported");
        }

        @Override
        public int delete(Uri uri, String selection, String[] selectionArgs) {
            throw new UnsupportedOperationException("delete not supported");
        }

        @Override
        public int update(Uri uri, ContentValues values, String selection,
                          String[] selectionArgs) {
            throw new UnsupportedOperationException("update not supported");
        }
    }
}
