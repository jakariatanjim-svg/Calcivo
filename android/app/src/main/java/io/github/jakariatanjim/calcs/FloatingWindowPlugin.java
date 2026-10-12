package io.github.jakariatanjim.calcs;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puts the calculator into the Android floating window (picture in picture).
 *
 * JavaScript side: src/js/floating-window.js
 *
 * Methods
 *   isSupported() -> { supported, sdk }
 *   enter()       -> { entered, reason }
 *
 * The window opens with the aspect ratio of the screen the app is running on, so
 * the calculator keeps its phone shaped layout while it floats above another
 * app. MainActivity sends a "floatingWindowChanged" event back to the page when
 * the window opens or closes.
 */
@CapacitorPlugin(name = "FloatingWindow")
public class FloatingWindowPlugin extends Plugin {

    /** Width of the floating window; the height follows the display. */
    private static final int WINDOW_WIDTH = 9;
    private static final int WINDOW_HEIGHT = 16;

    private boolean isSupported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false;
        }
        PackageManager manager = getContext().getPackageManager();
        return manager != null && manager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private JSObject answer(boolean entered, String reason) {
        JSObject result = new JSObject();
        result.put("entered", entered);
        if (reason != null && !reason.isEmpty()) {
            result.put("reason", reason);
        }
        return result;
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", isSupported());
        result.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        if (!isSupported()) {
            call.resolve(answer(false, "unsupported"));
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(answer(false, "no-activity"));
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                // The main activity is locked to portrait; the floating window
                // is resized by the system, so the lock is lifted for as long as
                // the app floats (MainActivity puts it back afterwards).
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);

                PictureInPictureParams.Builder params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(WINDOW_WIDTH, WINDOW_HEIGHT));
                activity.enterPictureInPictureMode(params.build());

                call.resolve(answer(true, null));
            } catch (Exception error) {
                String reason = error.getMessage() == null ? "failed" : error.getMessage();
                call.resolve(answer(false, reason));
            }
        });
    }
}
