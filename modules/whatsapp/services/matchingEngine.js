const connectifyRepository = require('./connectifyRepository');

class MatchingEngine {
  async findBestProviders({ service, location, limit = 3 }) {
    try {
      return await connectifyRepository.findMatchingServices({
        service,
        location,
        limit
      });
    } catch (error) {
      console.error('[WhatsAppMatching] Error:', error.message || error);
      return [];
    }
  }
}

module.exports = new MatchingEngine();
