package com.cmq.face.base;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface.OnCancelListener;
import android.content.Intent;
import android.os.Bundle;
import android.widget.ProgressBar;

/**
 * @author caomengqi 2015年5月5日
 * @JDK version 1.8
 * @brief provide basic function for activity, all the activities should extend
 *        this
 * @version 1.0
 */
public class BaseActivity extends Activity {

	private AlertDialog mDialog = null;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
	}

	@Override
	protected void onDestroy() {
		super.onDestroy();
	}

	@Override
	protected void onPause() {
		super.onPause();
	}

	@Override
	protected void onResume() {
		super.onResume();
	}

	public void openActivity(Class<?> pClass) {
		openActivity(pClass, null);
	}

	public void openActivity(Class<?> pClass, Bundle pBundle) {
		Intent intent = new Intent(this, pClass);
		if (pBundle != null) {
			intent.putExtras(pBundle);
		}
		startActivity(intent);
	}

	public void openActivity(String pAction) {
		openActivity(pAction, null);
	}

	public void openActivity(String pAction, Bundle pBundle) {
		Intent intent = new Intent(pAction);
		if (pBundle != null) {
			intent.putExtras(pBundle);
		}
		startActivity(intent);
	}

	public void showProgressBar(OnCancelListener onCancelListener) {
		if (mDialog == null) {
			AlertDialog.Builder builder = new AlertDialog.Builder(this);
			ProgressBar progress = new ProgressBar(this);
			builder.setView(progress);
			builder.setCancelable(true);
			mDialog = builder.create();
			mDialog.setView(progress, 0, 0, 0, 0);
		}
		mDialog.show();
		mDialog.setOnCancelListener(onCancelListener);
	}

	public void cancelProgressBar() {
		if (mDialog != null && mDialog.isShowing()) {
			mDialog.cancel();
			mDialog = null;
		}
	}

}
