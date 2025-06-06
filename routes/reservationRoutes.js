const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');


// Protected routes
// Semua route di bawah ini memerlukan autentikasi

// Endpoint reservasi
router.post('/', reservationController.createReservation);
router.get('/', reservationController.getAllReservations);
router.get('/user', reservationController.getUserReservations);
router.get('/:id', reservationController.getReservationById);
router.put('/:id', reservationController.updateReservation); // Tambahkan route PUT untuk update data
router.patch('/:id/status', reservationController.updateReservationStatus);
router.delete('/:id', reservationController.cancelReservation);

// Endpoint untuk cek ketersediaan waktu reservasi
router.post('/check-availability', reservationController.checkAvailability);
router.get('/ongoing', reservationController.getOngoingReservations);

module.exports = router;