package com.cmq.face.util;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapFactory.Options;
import android.graphics.Matrix;
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

	public static void getImagesByFolder(Context mContext) {
		List<ImageBean> list = new ArrayList<ImageBean>();
		Map<String, List<ImageBean>> parent = new HashMap<String, List<ImageBean>>();
		Uri mImageUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
		ContentResolver mResolver = mContext.getContentResolver();

		Cursor mCursor = mResolver.query(mImageUri, null, MediaStore.Images.Media.MIME_TYPE + "=?",
				new String[] { "image/jpeg" }, null);
		if (mCursor == null)
			return;

		while (mCursor.moveToNext()) {
			String path = mCursor.getString(mCursor.getColumnIndex(MediaStore.Images.Media.DATA));
			ImageBean bean = new ImageBean();
			bean.setImagePath(path);

			String parentPath = path.substring(0, path.lastIndexOf("/"));
			Log.i(TAG, "imgFolder : " + parentPath);
			List<ImageBean> subList = parent.get(parentPath);
			if (subList == null) {
				subList = new ArrayList<ImageBean>();
				subList.add(bean);
				parent.put(parentPath, subList);
			} else {
				subList.add(bean);
			}
			Log.i(TAG, "img info : " + mCursor.getColumnCount() + ",");
			list.add(bean);
		}
	}

	public static String getParentFilePath(String filePath) {
		if (filePath != null) {
			String parentPath = filePath.substring(0, filePath.lastIndexOf("/"));
			return parentPath;
		}
		return null;
	}

	public static Bitmap loadBitmap(int screenWdith, String filePath) {
		Bitmap bitmap = null;
		Bitmap finalBitmap = null;
		BitmapFactory.Options opts = null;
		opts = new Options();
		opts.inJustDecodeBounds = true;
		BitmapFactory.decodeFile(filePath, opts);
		int width = opts.outWidth;
		int scale = width > screenWdith ? width / screenWdith : 1;
		opts.inJustDecodeBounds = false;
		opts.inSampleSize = scale;
		bitmap = BitmapFactory.decodeFile(filePath, opts);
		float scaleBit = (float)screenWdith / bitmap.getWidth();
		Matrix matrx = new Matrix();
		matrx.postScale(scaleBit, scaleBit);
		finalBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrx, true);
		Flog.i("Utils", "bitmap size : " + finalBitmap.getWidth() + "," + finalBitmap.getHeight() + "scale :" + scaleBit);
		return finalBitmap;
	}
}
