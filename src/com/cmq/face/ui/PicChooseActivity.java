package com.cmq.face.ui;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.AdapterView.OnItemClickListener;
import android.widget.AdapterView.OnItemSelectedListener;
import android.widget.ArrayAdapter;
import android.widget.GridView;
import android.widget.Spinner;

import com.cmq.face.R;
import com.cmq.face.adapter.PhotoAdapter;
import com.cmq.face.base.BaseActivity;
import com.cmq.face.entity.ImageBean;
import com.cmq.face.util.Constants;
import com.cmq.face.util.Flog;
import com.cmq.face.util.Utils;

public class PicChooseActivity extends BaseActivity {
	private static final String TAG = "PicChooseActivity";

	private GridView mGridView;
	private Spinner mDir;

	private Map<String, List<ImageBean>> mDirMap;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.pic_choose);

		findViews();
		loadImage();
	}

	private void findViews() {
		mDir = (Spinner) findViewById(R.id.pic_choose_dir);
		mGridView = (GridView) findViewById(R.id.pic_choose_list);
		mGridView.setOnItemClickListener(mGridViewItemClickListener);
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

	Handler mHandler = new Handler();

	private void loadImage() {
		new Thread(new Runnable() {

			@Override
			public void run() {
				mDirMap = new HashMap<String, List<ImageBean>>();
				// final List<ImageBean> list = new ArrayList<ImageBean>();
				Uri mImageUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
				ContentResolver mResolver = PicChooseActivity.this.getContentResolver();

				Cursor mCursor = mResolver.query(mImageUri, null, MediaStore.Images.Media.MIME_TYPE
						+ "=?", new String[] { "image/jpeg" }, null);
				if (mCursor == null)
					return;
				while (mCursor.moveToNext()) {
					String path = mCursor.getString(mCursor
							.getColumnIndex(MediaStore.Images.Media.DATA));
					ImageBean bean = new ImageBean();
					bean.setImagePath(path);
					String parentPath = Utils.getParentFilePath(path);
					List<ImageBean> imgList = mDirMap.get(parentPath);
					if (imgList == null) {
						imgList = new ArrayList<ImageBean>();
						imgList.add(bean);
						mDirMap.put(parentPath, imgList);
					} else {
						imgList.add(bean);
					}

				}
				String[] strs = mCursor.getColumnNames();
				Log.i(TAG, "getColumnNames : " + strs.length);
				for (int i = 0; i < strs.length; i++) {
					Log.i(TAG, "getColumnName : " + strs[i]);
				}
				mCursor.close();
				mHandler.post(new Runnable() {

					@Override
					public void run() {
						setSpinnerAndGrid();
					}
				});
			}
		}).start();
	}

	private void setSpinnerAndGrid() {
		String[] dirArray = new String[mDirMap.keySet().size()];
		mDirMap.keySet().toArray(dirArray);
		Flog.i(TAG, "dir List length : " + dirArray.length);
		ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, dirArray);
		adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
		mDir.setAdapter(adapter);
		mDir.setOnItemSelectedListener(mOnItemSelectedListener);
	}
	
	OnItemSelectedListener mOnItemSelectedListener = new OnItemSelectedListener() {

		@Override
		public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
			String dir = mDir.getItemAtPosition(position).toString();
			Flog.i(TAG, "onitem selected : " + dir);
			List<ImageBean> list = mDirMap.get(dir);
			PhotoAdapter<ImageBean> adapter = new PhotoAdapter<ImageBean>(PicChooseActivity.this, list);
			mGridView.setAdapter(adapter);
		}

		@Override
		public void onNothingSelected(AdapterView<?> parent) {
			
		}
	};
	
	OnItemClickListener mGridViewItemClickListener = new OnItemClickListener() {

		@Override
		public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
			ImageBean bean = (ImageBean) mGridView.getAdapter().getItem(position);
			String filePath = bean.getImagePath();
			Bundle b = new Bundle();
			b.putString(Constants.BUNDLE_PIC_PATH, filePath);
			openActivity(ResultActivity.class, b);
		}
	};
}
