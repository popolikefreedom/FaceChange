package com.cmq.face;

import android.os.Bundle;
import android.widget.ImageView;

import com.cmq.face.base.BaseActivity;

public class MainActivity extends BaseActivity {
	private static final String TAG = "MainActivity";
	
	private ImageView mImage;
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);
		
		findViews();
	}

	private void findViews() {
		mImage = (ImageView) findViewById(R.id.main_img);
		mImage.setImageResource(R.drawable.res1);
	}
	
	
}
