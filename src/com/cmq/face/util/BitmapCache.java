package com.cmq.face.util;

import android.annotation.TargetApi;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.LruCache;


@TargetApi(Build.VERSION_CODES.HONEYCOMB_MR1) 
public class BitmapCache{
	private LruCache<String, Bitmap> mCache;
	
	public BitmapCache() {
		int maxSize = 10 * 1024 * 1024;
		mCache = new LruCache<String, Bitmap>(maxSize) {
			@Override
			protected int sizeOf(String key, Bitmap value) {
				return value.getRowBytes() * value.getHeight();
			}
			
		};
	}

	public Bitmap getBitmap(String url) {
		return mCache.get(url);
	}

	public void putBitmap(String url, Bitmap bitmap) {
		mCache.put(url, bitmap);
	}

}
