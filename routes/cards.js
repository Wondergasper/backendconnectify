const express = require('express');
const {
  getCards,
  addCard,
  setDefaultCard,
  deleteCard
} = require('../controllers/cardController');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getCards);
router.post('/', auth, addCard);
router.put('/:id/default', auth, setDefaultCard);
router.delete('/:id', auth, deleteCard);

module.exports = router;
