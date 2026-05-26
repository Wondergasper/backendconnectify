const { createClient } = require('@supabase/supabase-js');

class SupabaseStorageService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'connectify-uploads';
    this.client = null;

    this.initSupabase();
  }

  initSupabase() {
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      return;
    }

    this.client = createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  isConfigured() {
    return Boolean(this.client && this.bucket);
  }

  getExtension(fileName = '', mimeType = '') {
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.png')) return '.png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return '.jpg';
    if (lowerName.endsWith('.webp')) return '.webp';
    if (lowerName.endsWith('.gif')) return '.gif';
    if (lowerName.endsWith('.pdf')) return '.pdf';

    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'application/pdf') return '.pdf';

    return '.jpg';
  }

  buildPath(folder, fileName, mimeType = '') {
    const safeFolder = String(folder || 'connectify')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\\/g, '/');
    const safeName = String(fileName || `file_${Date.now()}`).replace(/\s+/g, '_');
    const extension = this.getExtension(safeName, mimeType);
    const baseName = safeName.includes('.') ? safeName : `${safeName}${extension}`;

    return `${safeFolder}/${baseName}`.replace(/\/+/g, '/');
  }

  async uploadFile(fileBuffer, folder = 'connectify', options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    try {
      const fileName = options.public_id || options.fileName || `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mimeType = options.contentType || options.mimetype || 'application/octet-stream';
      const filePath = this.buildPath(folder, fileName, mimeType);
      const body = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

      const { error } = await this.client.storage
        .from(this.bucket)
        .upload(filePath, body, {
          contentType: mimeType,
          upsert: Boolean(options.upsert)
        });

      if (error) {
        throw error;
      }

      const { data } = this.client.storage.from(this.bucket).getPublicUrl(filePath);

      return {
        public_id: filePath,
        secure_url: data.publicUrl,
        path: filePath
      };
    } catch (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }
  }

  async uploadMultipleFiles(files, folder = 'connectify', options = {}) {
    try {
      const uploadPromises = files.map((file, index) =>
        this.uploadFile(file.buffer, folder, {
          ...options,
          public_id: options.public_id
            ? `${options.public_id}_${index}`
            : `${file.originalname || 'file'}_${Date.now()}_${index}`,
          mimetype: file.mimetype,
          contentType: file.mimetype
        })
      );

      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Upload multiple files error:', error);
      throw error;
    }
  }

  async uploadFromUrl(url, folder = 'connectify', options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || options.contentType || 'application/octet-stream';
      const fileName = options.public_id || `remote_${Date.now()}`;

      return await this.uploadFile(buffer, folder, {
        ...options,
        public_id: fileName,
        contentType
      });
    } catch (error) {
      console.error('Upload from URL error:', error);
      throw error;
    }
  }

  async deleteFile(publicId) {
    if (!this.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    try {
      const { error } = await this.client.storage
        .from(this.bucket)
        .remove([publicId]);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  async deleteMultipleFiles(publicIds) {
    if (!this.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    try {
      const { error } = await this.client.storage
        .from(this.bucket)
        .remove(publicIds);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Delete multiple files error:', error);
      throw error;
    }
  }

  getUrl(publicId) {
    if (!this.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(publicId);
    return data.publicUrl;
  }

  async uploadProfileImage(fileBuffer, userId) {
    return this.uploadFile(fileBuffer, 'connectify/users/profiles', {
      public_id: `user_${userId}_${Date.now()}`,
      mimetype: 'image/jpeg',
      contentType: 'image/jpeg',
      upsert: true
    });
  }

  async uploadServiceImages(files, serviceId) {
    return this.uploadMultipleFiles(files, 'connectify/services', {
      public_id: `service_${serviceId}_${Date.now()}`
    });
  }

  async uploadVerificationDocuments(files, userId) {
    return this.uploadMultipleFiles(files, 'connectify/verification', {
      public_id: `verification_${userId}_${Date.now()}`
    });
  }

  getOptimizedImageUrl(publicId, width = 800, height = 600) {
    return this.getUrl(publicId);
  }
}

module.exports = new SupabaseStorageService();
