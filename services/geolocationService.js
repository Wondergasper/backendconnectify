// Geolocation service for reverse geocoding (coordinates to address)
const axios = require('axios');

class GeolocationService {
    constructor() {
        // Using OpenStreetMap's Nominatim API (free, no API key needed)
        // For production, consider Google Maps API, Mapbox, or LocationIQ
        this.nominatimUrl = 'https://nominatim.openstreetmap.org';
        this.userAgent = 'ConnectifyApp/1.0'; // Required by Nominatim
    }

    /**
     * Convert coordinates to human-readable address
     * @param {number} latitude 
     * @param {number} longitude 
     * @returns {Promise<object>} Address details
     */
    async reverseGeocode(latitude, longitude) {
        try {
            const response = await axios.get(`${this.nominatimUrl}/reverse`, {
                params: {
                    lat: latitude,
                    lon: longitude,
                    format: 'json',
                    addressdetails: 1,
                    zoom: 18
                },
                headers: {
                    'User-Agent': this.userAgent
                },
                timeout: 5000
            });

            if (!response.data) {
                throw new Error('No data received from geocoding service');
            }

            const data = response.data;
            const address = data.address || {};

            // Format the address in a user-friendly way
            const formattedAddress = this.formatAddress(address, data.display_name);

            return {
                success: true,
                data: {
                    formattedAddress,
                    details: {
                        road: address.road || address.street,
                        suburb: address.suburb || address.neighbourhood,
                        city: address.city || address.town || address.village,
                        state: address.state,
                        country: address.country,
                        postcode: address.postcode,
                        // Keep original coordinates
                        latitude,
                        longitude
                    },
                    raw: data
                }
            };
        } catch (error) {
            console.error('Reverse geocoding error:', error.message);

            // Return a fallback response with just coordinates
            return {
                success: false,
                error: error.message,
                data: {
                    formattedAddress: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`,
                    details: {
                        latitude,
                        longitude
                    }
                }
            };
        }
    }

    /**
     * Format address components into readable string
     * @param {object} address - Address components from Nominatim
     * @param {string} displayName - Full display name as fallback
     * @returns {string} Formatted address
     */
    formatAddress(address, displayName) {
        // Priority order for formatting Nigerian addresses
        const parts = [];

        // Add specific location (road, building, etc.)
        if (address.road || address.street) {
            parts.push(address.road || address.street);
        }

        // Add area/suburb
        if (address.suburb || address.neighbourhood) {
            parts.push(address.suburb || address.neighbourhood);
        }

        // Add city
        if (address.city || address.town || address.village) {
            parts.push(address.city || address.town || address.village);
        }

        // Add state (important for Nigeria)
        if (address.state) {
            parts.push(address.state);
        }

        // If we have parts, join them
        if (parts.length > 0) {
            return parts.join(', ');
        }

        // Fallback to display name if available
        if (displayName) {
            // Take first 3-4 parts of display name
            const nameParts = displayName.split(',').slice(0, 4);
            return nameParts.join(',');
        }

        return 'Location detected';
    }

    /**
     * Validate coordinates
     * @param {number} latitude 
     * @param {number} longitude 
     * @returns {boolean}
     */
    validateCoordinates(latitude, longitude) {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lon)) {
            return false;
        }

        // Valid latitude: -90 to 90
        // Valid longitude: -180 to 180
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }

    /**
     * Get distance between two coordinates (in kilometers)
     * Using Haversine formula
     * @param {number} lat1 
     * @param {number} lon1 
     * @param {number} lat2 
     * @param {number} lon2 
     * @returns {number} Distance in kilometers
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance;
    }

    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
}

module.exports = new GeolocationService();
