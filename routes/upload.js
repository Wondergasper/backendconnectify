const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const cloudStorageService = require('../services/cloudStorageService');
const User = require('../models/User');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else if (file.mimetype === 'application/pdf') {
    // Allow PDFs for verification documents
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter
});

// @route   POST api/upload/profile-image
// @desc    Upload user profile image
// @access  Private
router.post('/profile-image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if Cloudinary is configured
    if (!cloudStorageService.isConfigured()) {
      return res.status(500).json({ error: 'Cloud storage is not configured' });
    }

    // Upload to Cloudinary
    const result = await cloudStorageService.uploadFile(
      req.file.buffer,
      'connectify/users/profiles',
      {
        public_id: `user_${req.user._id}_${Date.now()}`,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      }
    );

    // Update user profile with new avatar URL
    await User.findByIdAndUpdate(req.user._id, {
      'profile.avatar': result.secure_url
    });

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id
      },
      message: 'Profile image uploaded successfully'
    });
  } catch (error) {
    console.error('Profile image upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload profile image' });
  }
});

// @route   POST api/upload/portfolio
// @desc    Upload portfolio images for providers
// @access  Private
router.post('/portfolio', auth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!cloudStorageService.isConfigured()) {
      return res.status(500).json({ error: 'Cloud storage is not configured' });
    }

    // Upload all files to Cloudinary
    const uploadPromises = req.files.map((file, index) =>
      cloudStorageService.uploadFile(
        file.buffer,
        'connectify/portfolio',
        {
          public_id: `portfolio_${req.user._id}_${Date.now()}_${index}`,
          transformation: [
            { width: 1200, height: 900, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }
      )
    );

    const results = await Promise.all(uploadPromises);

    // Create portfolio items with URLs and publicIds
    const portfolioItems = results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id,
      uploadedAt: new Date()
    }));

    // Update user portfolio using new structure
    const user = await User.findById(req.user._id);

    // Initialize profile if it doesn't exist
    if (!user.profile) {
      user.profile = {};
    }

    // Initialize portfolio array if it doesn't exist
    if (!user.profile.portfolio) {
      user.profile.portfolio = [];
    }

    // Add new images to portfolio
    user.profile.portfolio.push(...portfolioItems);
    await user.save();

    res.json({
      success: true,
      data: {
        images: portfolioItems,
        count: portfolioItems.length
      },
      message: 'Portfolio images uploaded successfully'
    });
  } catch (error) {
    console.error('Portfolio upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload portfolio images' });
  }
});

// @route   POST api/upload/verification
// @desc    Upload verification documents
// @access  Private
router.post('/verification', auth, upload.array('documents', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!cloudStorageService.isConfigured()) {
      return res.status(500).json({ error: 'Cloud storage is not configured' });
    }

    // Upload all files to Cloudinary
    const uploadPromises = req.files.map((file, index) =>
      cloudStorageService.uploadFile(
        file.buffer,
        'connectify/verification',
        {
          public_id: `verification_${req.user._id}_${Date.now()}_${index}`,
          resource_type: 'auto' // Allow PDFs and images
        }
      )
    );

    const results = await Promise.all(uploadPromises);

    // Extract URLs
    const documentUrls = results.map(result => result.secure_url);

    // Update user verification documents
    await User.findByIdAndUpdate(req.user._id, {
      'profile.verification.documents': documentUrls
    });

    res.json({
      success: true,
      data: {
        urls: documentUrls,
        count: documentUrls.length
      },
      message: 'Verification documents uploaded successfully'
    });
  } catch (error) {
    console.error('Verification upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload verification documents' });
  }
});

// @route   DELETE api/upload/portfolio/:publicId
// @desc    Delete portfolio image
// @access  Private
router.delete('/portfolio/:publicId', auth, async (req, res) => {
  try {
    const { publicId } = req.params;

    // Delete from Cloudinary
    await cloudStorageService.deleteFile(publicId);

    // Remove from user portfolio using new structure
    const user = await User.findById(req.user._id);

    if (user.profile && user.profile.portfolio) {
      user.profile.portfolio = user.profile.portfolio.filter(
        item => item.publicId !== publicId
      );
      await user.save();
    }

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete image' });
  }
});

module.exports = router;
