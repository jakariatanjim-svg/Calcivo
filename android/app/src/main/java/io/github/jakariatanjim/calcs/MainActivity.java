package io.github.jakariatanjim.calcs;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

/**
 * Full screen calculator shell.
 *
 * The calculator needs every pixel of the display, so both system bars are
 * hidden with the modern WindowInsetsController API (the theme flags alone are
 * ignored once Android 15 edge to edge enforcement kicks in). The bars come
 * back temporarily when the user swipes from an edge, and are hidden again as
 * soon as the window regains focus.
 *
 * Two plugins are registered here:
 *
 *   ApkUpdaterPlugin     downloads release APKs and opens the package installer
 *   FloatingWindowPlugin moves the app into the Android floating window (PiP)
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(FloatingWindowPlugin.class);
        super.onCreate(savedInstanceState);
        enterImmersiveMode();
    }

    /**
     * Keeps the portrait lock in step with the floating window and tells the web
     * layer about it, so the page can drop its app bar when only a few pixels
     * are left.
     */
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);

        if (!isInPictureInPictureMode) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            enterImmersiveMode();
        }

        try {
            JSObject data = new JSObject();
            data.put("active", isInPictureInPictureMode);
            getBridge().triggerJSEvent("floatingWindowChanged", "window", data.toString());
        } catch (Exception ignored) {
            // No page is listening - nothing to report.
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller == null) {
            return;
        }

        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
