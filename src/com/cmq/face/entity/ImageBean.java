package com.cmq.face.entity;

public class ImageBean {
	private String imagePath; //文件路径
	
	private String isFolder; //是否是文件夹
	 
	private String firstImagePath; //如果是文件夹要显示的图片路径
	
	private String name; //名称
	
	private int fileCounts; //文件数量

	public String getImagePath() {
		return imagePath;
	}

	public void setImagePath(String imagePath) {
		this.imagePath = imagePath;
	}

	public String getIsFolder() {
		return isFolder;
	}

	public void setIsFolder(String isFolder) {
		this.isFolder = isFolder;
	}

	public String getFirstImagePath() {
		return firstImagePath;
	}

	public void setFirstImagePath(String firstImagePath) {
		this.firstImagePath = firstImagePath;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public int getFileCounts() {
		return fileCounts;
	}

	public void setFileCounts(int fileCounts) {
		this.fileCounts = fileCounts;
	}
	
	
}
