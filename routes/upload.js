const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const cloudStorageService = require('../services/cloudStorageService');
const { userRepository } = require('../repositories/supabase/userRepository');

const router = express.Router();

// ─── Multer storage ───────────────────────────────────────────────────────────

const storage = multer.memoryStorage();

const MULTER_LIMITS = {
  fileSize: 5 * 1024 * 1024, // 5 MB
};

// ─── Route-specific file filters ──────────────────────────────────────────────

/**
 * imageOnlyFilter — used for /profile-image and /portfolio.
 * Strictly rejects anything that is not an image (including PDFs).
 * Prevents users from uploading documents as avatars or portfolio items.
 */
const imageOnlyFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error('Invalid file type. Only image files (JPEG, PNG, WebP, etc.) are accepted here.'),
        { status: 400 }
      ),
      false
    );
  }
};

/**
 * documentFilter — used for /verification only.
 * Accepts images (scanned docs / photos of ID) and PDFs (official certificates).
 */
const documentFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error('Invalid file type. Only images and PDF documents are accepted for verification.'),
        { status: 400 }
      ),
      false
    );
  }
};

// ─── Multer instances ─────────────────────────────────────────────────────────

/** Images only — for profile-image and portfolio routes */
const imageOnlyUpload = multer({ storage, limits: MULTER_LIMITS, fileFilter: imageOnlyFilter });

/** Images + PDFs — for verification document route */
const documentUpload = multer({ storage, limits: MULTER_LIMITS, fileFilter: documentFilter });

// ─── Multer error wrapper ─────────────────────────────────────────────────────
// Surfaces filter/size rejections as clean 400 responses instead of 500s.

function handleMulterError(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();
      const status = err instanceof multer.MulterError || err.status === 400 ? 400 : 500;
      return res.status(status).json({ error: err.message || 'File upload error' });
    });
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// @route   POST api/upload/profile-image
// @desc    Upload user profile image
// @access  Private
// Filter: images only — PDFs are rejected
router.post(
  '/profile-image',
  auth,
  handleMulterError(imageOnlyUpload.single('image')),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!cloudStorageService.isConfigured()) {
        return res.status(500).json({ error: 'Cloud storage is not configured' });
      }

      const result = await cloudStorageService.uploadFile(
        req.file.buffer,
        'connectify/users/profiles',
        {
          public_id: `user_${req.user._id}_${Date.now()}`,
          mimetype: req.file.mimetype,
          contentType: req.file.mimetype,
        }
      );

      const userObj = await userRepository.findById(req.user.id);
      const profile = userObj.profile || {};
      profile.avatar = result.secure_url;
      await userRepository.updateProfile(req.user.id, { profile });

      res.json({
        success: true,
        data: {
          url: result.secure_url,
          publicId: result.public_id,
        },
        message: 'Profile image uploaded successfully',
      });
    } catch (error) {
      console.error('Profile image upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload profile image' });
    }
  }
);

// @route   POST api/upload/portfolio
// @desc    Upload portfolio images for providers
// @access  Private
// Filter: images only — PDFs are rejected
router.post(
  '/portfolio',
  auth,
  handleMulterError(imageOnlyUpload.array('images', 10)),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      if (!cloudStorageService.isConfigured()) {
        return res.status(500).json({ error: 'Cloud storage is not configured' });
      }

      const uploadPromises = req.files.map((file, index) =>
        cloudStorageService.uploadFile(
          file.buffer,
          'connectify/portfolio',
          {
            public_id: `portfolio_${req.user._id}_${Date.now()}_${index}`,
            mimetype: file.mimetype,
            contentType: file.mimetype,
          }
        )
      );

      const results = await Promise.all(uploadPromises);

      const portfolioItems = results.map(result => ({
        url: result.secure_url,
        publicId: result.public_id,
        uploadedAt: new Date(),
      }));

      const userObj = await userRepository.findById(req.user.id);

      const profile = userObj.profile || {};
      if (!profile.portfolio) profile.portfolio = [];

      profile.portfolio.push(...portfolioItems);
      await userRepository.updateProfile(req.user.id, { profile });

      res.json({
        success: true,
        data: {
          images: portfolioItems,
          count: portfolioItems.length,
        },
        message: 'Portfolio images uploaded successfully',
      });
    } catch (error) {
      console.error('Portfolio upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload portfolio images' });
    }
  }
);

// @route   POST api/upload/verification
// @desc    Upload verification documents
// @access  Private
// Filter: images AND PDFs — the only route where PDFs are permitted
router.post(
  '/verification',
  auth,
  handleMulterError(documentUpload.array('documents', 5)),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      if (!cloudStorageService.isConfigured()) {
        return res.status(500).json({ error: 'Cloud storage is not configured' });
      }

      const uploadPromises = req.files.map((file, index) =>
        cloudStorageService.uploadFile(
          file.buffer,
          'connectify/verification',
          {
            public_id: `verification_${req.user._id}_${Date.now()}_${index}`,
            mimetype: file.mimetype,
            contentType: file.mimetype,
          }
        )
      );

      const results = await Promise.all(uploadPromises);
      const documentUrls = results.map(result => result.secure_url);

      const userObj = await userRepository.findById(req.user.id);
      const profile = userObj.profile || {};
      if (!profile.verification) profile.verification = {};
      profile.verification.documents = documentUrls;
      await userRepository.updateProfile(req.user.id, { profile });

      res.json({
        success: true,
        data: {
          urls: documentUrls,
          count: documentUrls.length,
        },
        message: 'Verification documents uploaded successfully',
      });
    } catch (error) {
      console.error('Verification upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload verification documents' });
    }
  }
);

// @route   DELETE api/upload/portfolio/:publicId
// @desc    Delete portfolio image
// @access  Private
router.delete('/portfolio/:publicId', auth, async (req, res) => {
  try {
    const { publicId } = req.params;

    const user = await userRepository.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ownsAsset = user.profile?.portfolio?.some(item => item.publicId === publicId);
    if (!ownsAsset) {
      return res.status(403).json({ error: 'Access denied: You do not own this portfolio item.' });
    }

    await cloudStorageService.deleteFile(publicId);

    const profile = user.profile || {};
    if (profile.portfolio) {
      profile.portfolio = profile.portfolio.filter(
        item => item.publicId !== publicId
      );
      await userRepository.updateProfile(req.user.id, { profile });
    }

    res.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete image' });
  }
});

module.exports = router;
