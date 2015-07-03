package com.cmq.face;

import android.app.Application;
import android.content.Context;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;

public class FaceApplication extends Application {
	public static final String TAG = "FaceApplication";
	
	public int screenWidth;
	
	@Override
	public void onCreate() {
		super.onCreate();
		getScreenWidth();
	}

	@Override
	public void onTerminate() {
		super.onTerminate();
	}
	
	private void getScreenWidth(){
		DisplayMetrics dm = new DisplayMetrics();
		WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
		wm.getDefaultDisplay().getMetrics(dm);
		Log.i(TAG, "display :" + dm.widthPixels);
		screenWidth = dm.widthPixels;
	}
}
