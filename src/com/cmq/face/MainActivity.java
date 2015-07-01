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
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.View.MeasureSpec;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ImageView;

import com.cmq.face.base.BaseActivity;

public class MainActivity extends BaseActivity implements OnClickListener {
	private static final String TAG = "MainActivity";

	private ImageView mImage;

	private Button mTakePhoto;
	private Button mChoosePic;
	
	private File mCascadeFile;
	
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
		mTakePhoto.setOnClickListener(this);
	}

	@Override
	protected void onResume() {
		super.onResume();
		if (!OpenCVLoader.initDebug()) {
			Log.i(TAG,
					"Internal OpenCV library not found. Using OpenCV Manager for initialization");
			OpenCVLoader.initAsync(OpenCVLoader.OPENCV_VERSION_3_0_0, this,
					mLoaderCallback);
		} else {
			Log.i(TAG, "OpenCV library found inside package. Using it!");
			mLoaderCallback.onManagerConnected(LoaderCallbackInterface.SUCCESS);
		}
	}

	private BaseLoaderCallback mLoaderCallback = new BaseLoaderCallback(this) {
		@Override
		public void onManagerConnected(int status) {
			switch (status) {
			case LoaderCallbackInterface.SUCCESS: {
				Log.i(TAG, "OpenCV loaded successfully");

				// Load native library after(!) OpenCV initialization
				// System.loadLibrary("detection_based_tracker");
			}
				break;
			default: {
				super.onManagerConnected(status);
			}
				break;
			}
		}
	};

	@Override
	public void onClick(View v) {
		int id = v.getId();
		switch (id) {
		case R.id.main_take_photo:
			checkFace();
			break;
		case R.id.main_choose_pic:
			break;
		}
	}

	private void checkFace() {
//		mImage.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
//				MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
//		mImage.layout(0, 0, mImage.getMeasuredWidth(),
//				mImage.getMeasuredHeight());
		mImage.buildDrawingCache();
		Bitmap map = mImage.getDrawingCache();
		
		try {
			// load cascade file from application resources
			InputStream is = getResources().openRawResource(
					R.raw.lbpcascade_frontalface);
			File cascadeDir = getDir("cascade", Context.MODE_PRIVATE);
			mCascadeFile = new File(cascadeDir,
					"lbpcascade_frontalface.xml");
			FileOutputStream os = new FileOutputStream(mCascadeFile);

			byte[] buffer = new byte[4096];
			int bytesRead;
			while ((bytesRead = is.read(buffer)) != -1) {
				os.write(buffer, 0, bytesRead);
			}
			is.close();
			os.close();

			CascadeClassifier mJavaDetector = new CascadeClassifier(
					mCascadeFile.getAbsolutePath());
			
			Mat mat = new Mat();
			Utils.bitmapToMat(map, mat);
			
			MatOfRect faceDetections = new MatOfRect();  
			mJavaDetector.detectMultiScale(mat, faceDetections);  

            Log.i(String.format("Detected %s faces",  
                    faceDetections.toArray().length), "");  

            // Draw a bounding box around each face.  
            Rect[] facesArray = faceDetections.toArray();
    		for (int i = 0; i < facesArray.length; i++)
    			Imgproc.rectangle(mat, facesArray[i].tl(), facesArray[i].br(),
    					new Scalar(255, 0, 0, 255), 3); 
            Utils.matToBitmap(mat, map);  
            mImage.setImageBitmap(map); 
			cascadeDir.delete();

		} catch (IOException e) {
			e.printStackTrace();
			Log.e(TAG, "Failed to load cascade. Exception thrown: " + e);
		}
	}

	@Override
	public void onBackPressed() {
		super.onBackPressed();
		android.os.Process.killProcess(android.os.Process.myPid());
	}
	
	
	
}
