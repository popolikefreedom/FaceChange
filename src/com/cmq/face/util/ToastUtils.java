package com.cmq.face.util;

import android.content.Context;
import android.widget.Toast;

public class ToastUtils {
	public static Toast mToast;

	public static void showToast(Context context, int resId) {
		if (mToast == null) {
			mToast = Toast.makeText(context.getApplicationContext(), resId,
					Toast.LENGTH_SHORT);
		} else {
			mToast.setText(resId);
		}
		mToast.show();
	}

	public static void showToast(Context context, String str) {
		if (mToast == null) {
			mToast = Toast.makeText(context.getApplicationContext(), str,
					Toast.LENGTH_SHORT);
		} else {
			mToast.setText(str);
		}
		mToast.show();
	}
}
