package io.github.jakariatanjim.calcs;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads a release APK and hands it to the Android package installer.
 *
 * JavaScript side: src/js/apk-updater.js
 *
 * Methods
 *   isSupported()          -> { supported, platform, sdk, canInstall }
 *   canInstall()           -> { canInstall }
 *   download({url, fileName}) -> { fileName, path, size, sha256 }
 *                                events: downloadProgress { received, total, percent }
 *   install({fileName})    -> { needsPermission }
 *   openInstallSettings()
 *   cancel()
 *
 * The download runs on a background thread so the UI keeps painting, and the
 * SHA-256 of the file is computed while it streams so the app can verify it
 * against the checksum published with the release.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String FILE_PROVIDER_SUFFIX = ".fileprovider";
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long PROGRESS_INTERVAL_BYTES = 512 * 1024;

    private ExecutorService executor;
    private volatile boolean cancelled = false;

    @Override
    public void load() {
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    protected void handleOnDestroy() {
        cancelled = true;
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private File downloadDirectory() {
        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            directory = new File(getContext().getFilesDir(), "updates");
        }
        if (!directory.exists() && !directory.mkdirs()) {
            // Fall through: the file stream below reports any real problem.
        }
        return directory;
    }

    private static String safeFileName(String name) {
        if (name == null || name.trim().isEmpty()) {
            return "calcs-update.apk";
        }
        String cleaned = name.replaceAll("[^A-Za-z0-9._-]", "_");
        return cleaned.toLowerCase(Locale.US).endsWith(".apk") ? cleaned : cleaned + ".apk";
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("platform", "android");
        result.put("sdk", Build.VERSION.SDK_INT);
        result.put("canInstall", canInstallPackages());
        call.resolve(result);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("canInstall", canInstallPackages());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open the install permission screen", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String urlText = call.getString("url");
        if (urlText == null || urlText.trim().isEmpty()) {
            call.reject("A download url is required");
            return;
        }
        final String fileName = safeFileName(call.getString("fileName", "calcs-update.apk"));

        if (executor == null || executor.isShutdown()) {
            call.reject("The updater is not ready yet");
            return;
        }

        cancelled = false;
        call.setKeepAlive(true);

        executor.execute(
            () -> {
                HttpURLConnection connection = null;
                try {
                    File target = new File(downloadDirectory(), fileName);
                    if (target.exists() && !target.delete()) {
                        // The stream below overwrites the file anyway.
                    }

                    connection = (HttpURLConnection) new URL(urlText).openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("Accept", "application/octet-stream");
                    connection.setRequestProperty("User-Agent", "CalcS-Updater");
                    connection.connect();

                    int status = connection.getResponseCode();
                    if (status < 200 || status >= 300) {
                        call.reject("Download failed (HTTP " + status + ")");
                        return;
                    }

                    long total = connection.getContentLengthLong();
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");

                    long received = 0;
                    int lastPercent = -1;
                    long lastNotifiedAt = 0;

                    try (
                        InputStream input = connection.getInputStream();
                        FileOutputStream output = new FileOutputStream(target)
                    ) {
                        byte[] buffer = new byte[BUFFER_SIZE];
                        int read;
                        while ((read = input.read(buffer)) != -1) {
                            if (cancelled) {
                                output.flush();
                                target.delete();
                                call.reject("The download was cancelled");
                                return;
                            }

                            output.write(buffer, 0, read);
                            digest.update(buffer, 0, read);
                            received += read;

                            int percent = total > 0 ? (int) Math.min(100, (received * 100) / total) : -1;
                            if (percent != lastPercent || received - lastNotifiedAt >= PROGRESS_INTERVAL_BYTES) {
                                lastPercent = percent;
                                lastNotifiedAt = received;
                                notifyProgress(received, total, percent);
                            }
                        }
                        output.flush();
                    }

                    notifyProgress(received, total, 100);

                    JSObject result = new JSObject();
                    result.put("fileName", fileName);
                    result.put("path", target.getAbsolutePath());
                    result.put("size", received);
                    result.put("sha256", toHex(digest.digest()));
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("The download failed: " + error.getMessage(), error);
                } finally {
                    if (connection != null) {
                        connection.disconnect();
                    }
                }
            }
        );
    }

    @PluginMethod
    public void install(PluginCall call) {
        String requested = call.getString("fileName", "");
        if (requested == null || requested.trim().isEmpty()) {
            call.reject("The update file name is missing");
            return;
        }

        File apk = new File(downloadDirectory(), safeFileName(requested));
        if (!apk.exists()) {
            call.reject("The update file is missing. Download it again.");
            return;
        }

        if (!canInstallPackages()) {
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + FILE_PROVIDER_SUFFIX,
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("needsPermission", false);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not open the installer: " + error.getMessage(), error);
        }
    }

    private void notifyProgress(long received, long total, long percent) {
        JSObject progress = new JSObject();
        progress.put("received", received);
        progress.put("total", total);
        progress.put("percent", percent);
        notifyListeners("downloadProgress", progress, false);
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            // "& 0xFF" keeps the byte unsigned; without it a byte >= 0x80 is
            // sign extended and formatted as eight characters (ffffff80),
            // so the SHA-256 would never match the published checksum.
            builder.append(String.format(Locale.US, "%02x", value & 0xFF));
        }
        return builder.toString();
    }
}
