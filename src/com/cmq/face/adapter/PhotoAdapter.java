package com.cmq.face.adapter;

import java.util.List;

import android.content.Context;
import android.graphics.Bitmap;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;

import com.cmq.face.FaceApplication;
import com.cmq.face.R;
import com.cmq.face.base.AdapterBase;
import com.cmq.face.entity.ImageBean;
import com.cmq.face.util.BitmapUtil;
import com.cmq.face.util.BitmapUtil.ImageLoadCallBack;

public class PhotoAdapter<T> extends AdapterBase<T> {
	private static final String TAG = "PhotoAdapter";
	
	public LayoutInflater mInflater;
	private Context mContext;
	private BitmapUtil mbiBitmapUtil;
	
	public PhotoAdapter(Context context, List<T> list) {
		super();
		mContext = context;
		appendToList(list);
		mInflater = LayoutInflater.from(mContext);
		mbiBitmapUtil = BitmapUtil.getInstance();
	}


	@SuppressWarnings("unchecked")
	@Override
	protected View getExView(int position, View convertView, ViewGroup parent) {
		final ViewHolder holder;
		if(convertView == null){
			holder = new ViewHolder();
			convertView = mInflater.inflate(R.layout.grid_item_photo, null);
			holder.imageView = (ImageView) convertView.findViewById(R.id.grid_item_image);
			
			convertView.setTag(holder);
		}else{
			holder = (ViewHolder) convertView.getTag();
		}
		ImageBean bean = (ImageBean) getItem(position);
		
		holder.imageView.setImageResource(R.drawable.ic_launcher);
		int width = ((FaceApplication)mContext.getApplicationContext()).screenWidth / 3;
		mbiBitmapUtil.loadImage(width, width, bean.getImagePath(), new ImageLoadCallBack() {
			@Override
			public void onLoadImage(Bitmap bitmap) {
				holder.imageView.setImageBitmap(bitmap);
			}
		});
//		if(map != null){
//			holder.imageView.setImageBitmap(map);
//		}
		return convertView;
	}
	
	
	class ViewHolder{
		ImageView imageView;
	}
}
