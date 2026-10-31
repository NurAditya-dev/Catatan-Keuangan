package com.uangku.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

/**
 * Native Android SharedPreferences persistence layer for UangKu financial records.
 */
public final class NativeStorageBridge {
    private static final String PREFS_NAME = "uangku_native_ledger_store";
    private final SharedPreferences prefs;

    public NativeStorageBridge(Context context) {
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String getItem(String key) {
        if (key == null) return "";
        return prefs.getString(key, "");
    }

    @JavascriptInterface
    public void setItem(String key, String value) {
        if (key == null) return;
        prefs.edit().putString(key, value != null ? value : "").apply();
    }
}
