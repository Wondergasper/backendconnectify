const Service = require('../models/Service');

// Add service images (from URLs)
exports.addServiceImages = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { imageUrls } = req.body; // Array of image URLs

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: 'Image URLs are required' });
    }

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check if the user owns this service
    if (service.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Add new images to the service (filter out duplicates)
    const uniqueImages = [...new Set([...(service.images || []), ...imageUrls])];
    service.images = uniqueImages;
    
    await service.save();

    res.json({
      success: true,
      data: service,
      message: 'Images added successfully'
    });
  } catch (error) {
    console.error('Add service images error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Remove service image
exports.removeServiceImage = async (req, res) => {
  try {
    const { serviceId, imageUrl } = req.body;

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check if the user owns this service
    if (service.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Remove the image from the array
    service.images = (service.images || []).filter(img => img !== imageUrl);
    
    await service.save();

    res.json({
      success: true,
      data: service,
      message: 'Image removed successfully'
    });
  } catch (error) {
    console.error('Remove service image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};