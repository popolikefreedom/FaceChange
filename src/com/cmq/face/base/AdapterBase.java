package com.cmq.face.base;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;

public abstract class AdapterBase<T> extends BaseAdapter {
	
	private final List<T> mList = new ArrayList<T>();
	
	public List<T> getList(){
		return mList;
	}
	
	public void appendToList(List<T> list) {
		if (list == null) {
			return;
		}
		mList.addAll(list);
		notifyDataSetChanged();
	}

	public void appendToTopList(List<T> list) {
		if (list == null) {
			return;
		}
		mList.addAll(0, list);
		notifyDataSetChanged();
	}

	public void clear() {
		mList.clear();
		notifyDataSetChanged();
	}
	@Override
	public int getCount() {
		return mList.size();
	}

	@Override
	public Object getItem(int position) {
		if(position > mList.size()-1){
			return null;
		}
		return mList.get(position);
	}

	@Override
	public long getItemId(int position) {
		return position;
	}

	@Override
	public View getView(int position, View convertView, ViewGroup parent) {
		return getExView(position, convertView, parent);
	}
	

	protected abstract View getExView(int position, View convertView, ViewGroup parent);
}
