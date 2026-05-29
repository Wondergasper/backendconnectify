const { validationResult } = require('express-validator');
const { jobQuoteRepository } = require('../repositories/supabase/jobQuoteRepository');
const { serviceRequestRepository } = require('../repositories/supabase/serviceRequestRepository');

/**
 * POST /api/requests/:id/quotes
 * Provider submits a quote for a service request.
 */
exports.createQuote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { id: requestId } = req.params;
    const profile = req.providerProfile;
    const { quotedAmount, estimatedDeliveryTime, message } = req.body;

    const request = await serviceRequestRepository.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    if (!['pending', 'matched'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot quote a request with status: ${request.status}` });
    }

    // Check for existing quote from this provider
    const existingQuote = await jobQuoteRepository.findByRequestAndProvider(requestId, profile.id);
    if (existingQuote) {
      return res.status(400).json({ error: 'You have already submitted a quote for this request' });
    }

    const quote = await jobQuoteRepository.create({
      requestId,
      providerId: profile.id,
      quotedAmount: Number(quotedAmount),
      estimatedDeliveryTime,
      message
    });

    // Update request status to 'quoted'
    if (request.status === 'pending') {
      await serviceRequestRepository.updateStatus(requestId, 'quoted');
    }

    res.status(201).json({ success: true, data: { quote } });
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/provider/quotes
 * List all quotes submitted by the authenticated provider.
 */
exports.listMyQuotes = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const profile = req.providerProfile;

    const result = await jobQuoteRepository.listForProvider(profile.id, {
      page: Number(page),
      limit: Number(limit),
      status: status || undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List provider quotes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/quotes/:id/accept
 * Customer (or platform) accepts a quote — marks the request accepted.
 */
exports.acceptQuote = async (req, res) => {
  try {
    const { id } = req.params;

    const quote = await jobQuoteRepository.findById(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status !== 'pending') {
      return res.status(400).json({ error: `Quote is already ${quote.status}` });
    }

    const updatedQuote = await jobQuoteRepository.updateStatus(id, 'accepted');

    // Update the parent service request
    await serviceRequestRepository.assignProvider(quote.requestId, quote.providerId);

    res.json({ success: true, data: { quote: updatedQuote } });
  } catch (error) {
    console.error('Accept quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/quotes/:id/reject
 * Customer (or platform) rejects a quote.
 */
exports.rejectQuote = async (req, res) => {
  try {
    const { id } = req.params;

    const quote = await jobQuoteRepository.findById(id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status !== 'pending') {
      return res.status(400).json({ error: `Quote is already ${quote.status}` });
    }

    const updatedQuote = await jobQuoteRepository.updateStatus(id, 'rejected');
    res.json({ success: true, data: { quote: updatedQuote } });
  } catch (error) {
    console.error('Reject quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
