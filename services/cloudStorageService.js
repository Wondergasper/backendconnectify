// services/cloudStorageService.js
const cloudinary = require('cloudinary').v2;

class CloudStorageService {
  constructor() {
    this.initCloudinary();
  }

  initCloudinary() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  }

  // Upload single file
  async uploadFile(fileBuffer, folder = 'connectify', options = {}) {
    try {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: 'auto',
            ...options
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        // Convert buffer to stream and pipe to upload
        const { Readable } = require('stream');
        const bufferStream = Readable.from(fileBuffer);
        bufferStream.pipe(stream);
      });
    } catch (error) {
      console.error('Upload file error:', error);
      throw error;
    }
  }

  // Upload multiple files
  async uploadMultipleFiles(files, folder = 'connectify', options = {}) {
    try {
      const uploadPromises = files.map(file => 
        this.uploadFile(file.buffer, folder, options)
      );
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Upload multiple files error:', error);
      throw error;
    }
  }

  // Upload file from URL
  async uploadFromUrl(url, folder = 'connectify', options = {}) {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder: folder,
        resource_type: 'auto',
        ...options
      });
      return result;
    } catch (error) {
      console.error('Upload from URL error:', error);
      throw error;
    }
  }

  // Delete file
  async deleteFile(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  // Delete multiple files
  async deleteMultipleFiles(publicIds) {
    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      return result;
    } catch (error) {
      console.error('Delete multiple files error:', error);
      throw error;
    }
  }

  // Get file URL with transformations
  getUrl(publicId, transformations = {}, resourceType = 'image') {
    try {
      return cloudinary.url(publicId, {
        type: 'upload',
        resource_type: resourceType,
        secure: true,
        ...transformations
      });
    } catch (error) {
      console.error('Get URL error:', error);
      throw error;
    }
  }

  // Upload user profile image
  async uploadProfileImage(fileBuffer, userId) {
    try {
      const result = await cloudinary.uploader.upload(fileBuffer, {
        folder: 'connectify/users/profiles',
        public_id: `user_${userId}_${Date.now()}`,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ] // Optimize for profile images
      });
      return result;
    } catch (error) {
      console.error('Upload profile image error:', error);
      throw error;
    }
  }

  // Upload service images
  async uploadServiceImages(files, serviceId) {
    try {
      const uploadPromises = files.map((file, index) => 
        cloudinary.uploader.upload(file.buffer, {
          folder: 'connectify/services',
          public_id: `service_${serviceId}_${Date.now()}_${index}`,
          resource_type: 'image',
          tags: ['service_image']
        })
      );
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Upload service images error:', error);
      throw error;
    }
  }

  // Upload verification documents
  async uploadVerificationDocuments(files, userId) {
    try {
      const uploadPromises = files.map((file, index) => 
        cloudinary.uploader.upload(file.buffer, {
          folder: 'connectify/verification',
          public_id: `verification_${userId}_${Date.now()}_${index}`,
          resource_type: 'auto',
          tags: ['verification_document']
        })
      );
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Upload verification documents error:', error);
      throw error;
    }
  }

  // Optimize image for specific use case
  getOptimizedImageUrl(publicId, width = 800, height = 600, quality = 'auto') {
    return cloudinary.url(publicId, {
      type: 'upload',
      secure: true,
      transformation: [
        { width: width, height: height, crop: 'fill' },
        { quality: quality, fetch_format: 'auto' }
      ]
    });
  }

  // Check if cloudinary is configured
  isConfigured() {
    return process.env.CLOUDINARY_CLOUD_NAME && 
           process.env.CLOUDINARY_API_KEY && 
           process.env.CLOUDINARY_API_SECRET;
  }
}

module.exports = new CloudStorageService();