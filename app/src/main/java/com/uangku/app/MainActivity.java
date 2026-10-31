package com.uangku.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Main Entry Activity for UangKu Android Financial Tracker Application.
 */
public class MainActivity extends Activity {
    private WebView appView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        appView = new WebView(this);
        appView.setBackgroundColor(Color.parseColor("#0B0C0E"));
        appView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        appView.setVerticalScrollBarEnabled(false);
        appView.setHorizontalScrollBarEnabled(false);
        setContentView(appView);

        WebSettings settings = appView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        appView.addJavascriptInterface(new NativeStorageBridge(this), "AndroidNativeStorage");

        appView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return true;
            }
        });

        appView.loadDataWithBaseURL(
            "https://app.uangku.local/",
            LedgerView.buildDocument(),
            "text/html",
            "UTF-8",
            null
        );
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && appView != null && appView.canGoBack()) {
            appView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
