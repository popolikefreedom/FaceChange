package com.cmq.face;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import org.opencv.android.BaseLoaderCallback;
import org.opencv.android.LoaderCallbackInterface;
import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.Core;
import org.opencv.core.Mat;
import org.opencv.core.MatOfRect;
import org.opencv.core.Point;
import org.opencv.core.Rect;
import org.opencv.core.Scalar;
import org.opencv.imgproc.Imgproc;
import org.opencv.objdetect.CascadeClassifier;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Bitmap.Config;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.View.MeasureSpec;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ImageView;

import com.cmq.face.base.BaseActivity;
import com.cmq.face.ui.PicChooseActivity;

public class MainActivity extends BaseActivity implements OnClickListener {
	private static final String TAG = "MainActivity";

	private ImageView mImage;

	private Button mTakePhoto;
	private Button mChoosePic;

	

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);

		findViews();
	}

	private void findViews() {
		mImage = (ImageView) findViewById(R.id.main_img);
		mImage.setImageResource(R.drawable.res1);

		mTakePhoto = (Button) findViewById(R.id.main_take_photo);
		mChoosePic = (Button) findViewById(R.id.main_choose_pic);
		mTakePhoto.setOnClickListener(this);
		mChoosePic.setOnClickListener(this);
	}

	@Override
	protected void onResume() {
		super.onResume();
	}

	

	@Override
	public void onClick(View v) {
		int id = v.getId();
		switch (id) {
		case R.id.main_take_photo:
			break;
		case R.id.main_choose_pic:
			openActivity(PicChooseActivity.class);
			break;
		}
	}

	

	@Override
	public void onBackPressed() {
		super.onBackPressed();
		android.os.Process.killProcess(android.os.Process.myPid());
	}

}
