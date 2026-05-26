const { cardRepository } = require('../repositories/supabase/cardRepository');
const { logAudit } = require('../utils/auditLogger');

exports.getCards = async (req, res) => {
  try {
    const cards = await cardRepository.listCards(req.user.id);

    res.json({
      success: true,
      data: cards
    });
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addCard = async (req, res) => {
  try {
    const {
      brand = 'Card',
      last4,
      expiryMonth,
      expiryYear,
      cardHolderName,
      authorizationCode,
      provider = 'paystack',
      isDefault = false
    } = req.body;

    if (!last4 || !expiryMonth || !expiryYear) {
      return res.status(400).json({ error: 'Card last4, expiryMonth, and expiryYear are required' });
    }

    const cardCount = await cardRepository.countCards(req.user.id);
    const shouldBeDefault = isDefault || cardCount === 0;

    const card = await cardRepository.createCard({
      userId: req.user.id,
      brand,
      last4,
      expiryMonth,
      expiryYear,
      cardHolderName,
      authorizationCode,
      provider,
      isDefault: shouldBeDefault
    });

    await logAudit({
      req,
      action: 'Added payment card',
      entityType: 'payment_card',
      entityId: card.id,
      target: `${brand} ending ${last4}`
    });

    res.status(201).json({
      success: true,
      data: card
    });
  } catch (error) {
    console.error('Add card error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.setDefaultCard = async (req, res) => {
  try {
    const card = await cardRepository.findById(req.params.id, req.user.id);

    if (!card || card.status === 'disabled') {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updatedCard = await cardRepository.setDefault(req.params.id, req.user.id);

    res.json({
      success: true,
      data: updatedCard
    });
  } catch (error) {
    console.error('Set default card error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteCard = async (req, res) => {
  try {
    const card = await cardRepository.findById(req.params.id, req.user.id);

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    await cardRepository.disableCard(req.params.id, req.user.id);

    const fallback = await cardRepository.findFirstActive(req.user.id);

    if (fallback) {
      await cardRepository.setDefault(fallback.id, req.user.id);
    }

    await logAudit({
      req,
      action: 'Removed payment card',
      entityType: 'payment_card',
      entityId: card.id,
      target: `${card.brand} ending ${card.last4}`
    });

    res.json({
      success: true,
      message: 'Card removed successfully'
    });
  } catch (error) {
    console.error('Delete card error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
