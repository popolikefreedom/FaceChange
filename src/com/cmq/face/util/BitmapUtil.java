package com.cmq.face.util;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import android.graphics.Bitmap;
import android.graphics.Bitmap.Config;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Message;

public class BitmapUtil {
	private static final String TAG = "BitmapUtil";

	private static final int DEFAULT_THREAD_POOL_SIZE = 3;

	private static final int MSG_LOAD_BITMAP_COMPLETE = 1;
	private BitmapCache mBitmapCache;

	private static BitmapUtil mBitmapUtil;
	private ExecutorService mImageService = Executors.newFixedThreadPool(DEFAULT_THREAD_POOL_SIZE);

	private BitmapUtil() {
		mBitmapCache = new BitmapCache();
	}

	public static BitmapUtil getInstance() {
		if (mBitmapUtil == null)
			mBitmapUtil = new BitmapUtil();
		return mBitmapUtil;
	}

	public void loadImage(final int width, final int height, final String filePath,
			final ImageLoadCallBack callback) {
		Bitmap bitmap = getMapFromCache(filePath);
		final Handler mHandler = new Handler() {

			@Override
			public void dispatchMessage(Message msg) {
				super.dispatchMessage(msg);
				if (msg.what == MSG_LOAD_BITMAP_COMPLETE) {
					callback.onLoadImage((Bitmap) msg.obj);
				}
			}

		};

		if (bitmap == null) {
			mImageService.execute(new Runnable() {
				@Override
				public void run() {
					Bitmap bitmap2 = decodeThumbMapFromPath(width, height, filePath);

					Message msg = mHandler.obtainMessage();
					msg.obj = bitmap2;
					msg.what = MSG_LOAD_BITMAP_COMPLETE;
					msg.sendToTarget();
					mBitmapCache.putBitmap(filePath, bitmap2);
				}
			});
		} else {
			callback.onLoadImage(bitmap);
		}
	}

	protected Bitmap decodeThumbMapFromPath(int width, int height, String filePath) {
		if (!new File(filePath).exists())
			return null;

		BitmapFactory.Options options = new BitmapFactory.Options();
		// 设置为true,表示解析Bitmap对象，该对象不占内存
		options.inJustDecodeBounds = true;
		BitmapFactory.decodeFile(filePath, options);
		int bitmapWidth = options.outWidth;
		int bitmapHeight = options.outHeight;

		int minBorder = (bitmapWidth < bitmapHeight) ? bitmapWidth : bitmapHeight;
		options.inSampleSize = minBorder / width;

		options.inJustDecodeBounds = false;
		Bitmap bitmap = BitmapFactory.decodeFile(filePath, options);

		int newBitmapWidth = bitmap.getWidth();
		int newBitmapHeight = bitmap.getHeight();

		int left = (newBitmapWidth > width) ? (newBitmapWidth - width) / 2 : 0;
		int top = (newBitmapHeight > height) ? (newBitmapHeight - height) / 2 : 0;

		Bitmap ThumbBitmap = createThumbBitmap(left, top, width, height, bitmap);

		if (bitmap != null) {
			bitmap.recycle();
			bitmap = null;
		}

		return ThumbBitmap;
	}

	private Bitmap createThumbBitmap(int left, int top, int width, int height, Bitmap bitmap) {

		Bitmap ThumbBitmap = Bitmap.createBitmap(width, height, Config.RGB_565);
		Paint photoPaint = new Paint();
		photoPaint.setDither(true);
		photoPaint.setFilterBitmap(true);

		Canvas canvas = new Canvas(ThumbBitmap);
		Rect srcRect = new Rect(left, top, left + width, top + height);
		Rect destRect = new Rect(0, 0, width, height);
		canvas.drawBitmap(bitmap, srcRect, destRect, photoPaint);
		canvas.save(Canvas.ALL_SAVE_FLAG);
		canvas.restore();

		return ThumbBitmap;
	}

	private Bitmap getMapFromCache(String filePath) {
		return mBitmapCache.getBitmap(filePath);
	}

	public interface ImageLoadCallBack {
		public void onLoadImage(Bitmap bitmap);
	}
}
