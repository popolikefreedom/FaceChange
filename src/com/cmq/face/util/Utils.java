package com.cmq.face.util;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;

import com.cmq.face.entity.ImageBean;

public class Utils {
	public static final String TAG = "Utils";

	public static void getImages(final Context mContext, final ImageListCallback callback) {
		new Thread(new Runnable() {

			@Override
			public void run() {
				final List<ImageBean> list = new ArrayList<ImageBean>();
				Uri mImageUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
				ContentResolver mResolver = mContext.getContentResolver();

				Cursor mCursor = mResolver.query(mImageUri, null, MediaStore.Images.Media.MIME_TYPE
						+ "=?", new String[] { "image/jpeg" }, null);
				if (mCursor == null)
					return;
				while (mCursor.moveToNext()) {
					String path = mCursor.getString(mCursor
							.getColumnIndex(MediaStore.Images.Media.DATA));
					ImageBean bean = new ImageBean();
					bean.setImagePath(path);
					Log.i(TAG, "img info : " + mCursor.getColumnCount() + ",");
					list.add(bean);
				}
				String[] strs = mCursor.getColumnNames();
				Log.i(TAG, "getColumnNames : " + strs.length);
				for (int i = 0; i < strs.length; i++) {
					Log.i(TAG, "getColumnName : " + strs[i]);
				}
				callback.getList(list);
			}
		}).start();
	}
	
	public static void getImagesByFolder(Context mContext){
		List<ImageBean> list = new ArrayList<ImageBean>();
		Map<String, List<ImageBean>> parent = new HashMap<String, List<ImageBean>>();
		Uri mImageUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
		ContentResolver mResolver = mContext.getContentResolver();

		Cursor mCursor = mResolver.query(mImageUri, null, MediaStore.Images.Media.MIME_TYPE
				+ "=?", new String[] { "image/jpeg" }, null);
		if (mCursor == null)
			return;
		
		while (mCursor.moveToNext()) {
			String path = mCursor.getString(mCursor
					.getColumnIndex(MediaStore.Images.Media.DATA));
			ImageBean bean = new ImageBean();
			bean.setImagePath(path);
			
			String parentPath = path.substring(0,path.lastIndexOf("\\/"));
			Log.i(TAG, "imgFolder : " + parentPath );
			List<ImageBean> subList = parent.get(parentPath);
			if(subList == null){
				subList = new ArrayList<ImageBean>();
				subList.add(bean);
				parent.put(parentPath, subList);
			}else{
				subList.add(bean);
			}
			Log.i(TAG, "img info : " + mCursor.getColumnCount() + ",");
			list.add(bean);
		}
	}
}
