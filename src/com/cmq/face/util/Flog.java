package com.cmq.face.util;

import android.util.Log;

/**
 * @author caomengqi 2014年12月11日
 * @JDK version 1.8
 * @brief
 * @version 1.0
 */
public class Flog {
	public static final String TAG = "Flog";
	
	private static final boolean DEBUG = true;
	private static final int LOG_LEVEL = 3;

	public static void i(String tag, String msg) {
		if (DEBUG && LOG_LEVEL >= 3)
			Log.i(tag, msg);
	}

	public static void v(String tag, String msg) {
		if (DEBUG && LOG_LEVEL >= 5)
			Log.v(tag, msg);
	}

	public static void d(String tag, String msg) {
		if (DEBUG && LOG_LEVEL >= 4)
			Log.d(tag, msg);
	}

	public static void e(String tag, String msg) {
		if (DEBUG && LOG_LEVEL >= 1)
			Log.e(tag, msg);
	}

	public static void w(String tag, String msg) {
		if (DEBUG && LOG_LEVEL >= 2)
			Log.w(tag, msg);
	}
}
