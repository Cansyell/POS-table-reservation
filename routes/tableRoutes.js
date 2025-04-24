const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

// Public routes
router.get('/', tableController.getAllTables);
router.get('/available', tableController.getAvailableTables);
router.get('/:id', tableController.getTableById);

// Protected routes (admin only)
router.post('/', protect, tableController.createTable);
router.patch('/:id/status', protect, tableController.updateTableStatus);
router.delete('/:id', protect, tableController.deleteTable);

module.exports = router;