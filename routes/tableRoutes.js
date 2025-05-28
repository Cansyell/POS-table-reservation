const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');


// Public routes
router.get('/', tableController.getAllTables);
router.get('/available', tableController.getAvailableTables);
router.get('/:id', tableController.getTableById);

// Protected routes (admin only)
router.post('/', tableController.createTable);
router.patch('/:id/status', tableController.updateTableStatus);
router.delete('/:id',  tableController.deleteTable);

module.exports = router;