const express = require('express');
const router = express.Router();
const geolocationService = require('../services/geolocationService');

// @route   POST /api/location/reverse-geocode
// @desc    Convert coordinates to address
// @access  Public (no auth needed for basic geocoding)
router.post('/reverse-geocode', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        // Validate input
        if (!latitude || !longitude) {
            return res.status(400).json({
                error: 'Latitude and longitude are required'
            });
        }

        // Validate coordinates
        if (!geolocationService.validateCoordinates(latitude, longitude)) {
            return res.status(400).json({
                error: 'Invalid coordinates provided'
            });
        }

        // Perform reverse geocoding
        const result = await geolocationService.reverseGeocode(latitude, longitude);

        res.json(result);
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        res.status(500).json({
            error: 'Failed to get address from coordinates'
        });
    }
});

// @route   POST /api/location/calculate-distance
// @desc    Calculate distance between two points
// @access  Public
router.post('/calculate-distance', async (req, res) => {
    try {
        const { lat1, lon1, lat2, lon2 } = req.body;

        // Validate input
        if (!lat1 || !lon1 || !lat2 || !lon2) {
            return res.status(400).json({
                error: 'All coordinates are required (lat1, lon1, lat2, lon2)'
            });
        }

        // Validate all coordinates
        if (
            !geolocationService.validateCoordinates(lat1, lon1) ||
            !geolocationService.validateCoordinates(lat2, lon2)
        ) {
            return res.status(400).json({
                error: 'Invalid coordinates provided'
            });
        }

        // Calculate distance
        const distance = geolocationService.calculateDistance(lat1, lon1, lat2, lon2);

        res.json({
            success: true,
            data: {
                distance: distance.toFixed(2),
                unit: 'km'
            }
        });
    } catch (error) {
        console.error('Distance calculation error:', error);
        res.status(500).json({
            error: 'Failed to calculate distance'
        });
    }
});

module.exports = router;
