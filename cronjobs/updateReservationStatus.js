// cronjobs/updateReservationStatus.js

const { Sequelize, Op } = require('sequelize');
// Perbaikan path model agar sesuai dengan struktur folder
const Reservation = require('../models/Reservation.js');
const Table = require('../models/Table.js');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Konfigurasi logging
const logDir = path.join(__dirname, '../logs');
const logFilePath = path.join(logDir, 'cronjob.log');

// Memastikan direktori log ada
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Fungsi untuk menulis log ke file dan console
 */
const logMessage = (message) => {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logEntry = `[${timestamp}] ${message}\n`;
  
  // Log ke console
  console.log(logEntry.trim());
  
  // Log ke file
  fs.appendFileSync(logFilePath, logEntry);
};

/**
 * Fungsi utama untuk update status reservasi dan meja
 * Dijalankan oleh cronjob secara berkala
 */
const updateReservationAndTableStatus = async () => {
  try {
    logMessage('===== CRONJOB STARTED: UPDATE RESERVATION AND TABLE STATUS =====');
    
    // Dapatkan waktu sekarang
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    
    logMessage(`Current time: ${currentDate} ${currentTime}`);
    
    // 1. Update status reservasi yang lewat waktu tapi belum complete/cancelled
    const expiredCount = await updateExpiredReservations(currentDate, currentTime);
    logMessage(`Updated ${expiredCount} expired reservations to 'completed'`);
    
    // 2. Update semua status meja berdasarkan reservasi aktif
    const tableUpdates = await updateAllTableStatus(currentDate, currentTime);
    logMessage(`Updated table statuses: ${tableUpdates.occupied} occupied, ${tableUpdates.reserved} reserved, ${tableUpdates.available} available`);
    
    logMessage('===== CRONJOB COMPLETED: UPDATE RESERVATION AND TABLE STATUS =====');
    return true;
  } catch (error) {
    logMessage(`ERROR on cronjob: ${error.message}`);
    logMessage(error.stack);
    return false;
  }
};

/**
 * Update reservasi yang sudah lewat waktu tapi belum diselesaikan
 */
const updateExpiredReservations = async (currentDate, currentTime) => {
  // Cari reservasi yang status masih confirmed tapi waktunya sudah lewat
  const expiredReservations = await Reservation.findAll({
    where: {
      status: 'confirmed',
      [Op.or]: [
        // Reservasi dari hari-hari sebelumnya
        { reservation_date: { [Op.lt]: currentDate } },
        // Reservasi hari ini yang waktunya + durasinya sudah lewat
        {
          reservation_date: currentDate,
          [Op.and]: [
            Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) < '${currentTime}'`)
          ]
        }
      ]
    }
  });
  
  // Update status menjadi 'completed' untuk reservasi yang sudah lewat
  for (const reservation of expiredReservations) {
    logMessage(`Auto-completing expired reservation #${reservation.id} (Table #${reservation.table_id}, Time: ${reservation.reservation_date} ${reservation.reservation_time})`);
    reservation.status = 'completed';
    await reservation.save();
  }
  
  return expiredReservations.length;
};

/**
 * Update status semua meja berdasarkan reservasi yang aktif
 */
const updateAllTableStatus = async (currentDate, currentTime) => {
  // Ambil semua meja
  const tables = await Table.findAll();
  const updates = { occupied: 0, reserved: 0, available: 0 };
  
  for (const table of tables) {
    const oldStatus = table.status;
    
    // Cek apakah ada reservasi yang sedang aktif untuk meja ini
    const activeReservation = await Reservation.findOne({
      where: {
        table_id: table.id,
        reservation_date: currentDate,
        status: 'confirmed',
        // Reservasi yang sedang berlangsung (waktu mulai <= sekarang <= waktu selesai)
        [Op.and]: [
          { reservation_time: { [Op.lte]: currentTime } },
          Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
        ]
      }
    });
    
    // Jika ada reservasi aktif, set status meja menjadi 'occupied'
    if (activeReservation) {
      if (table.status !== 'occupied') {
        logMessage(`Table #${table.id}: ${oldStatus} -> occupied (Active reservation #${activeReservation.id})`);
        table.status = 'occupied';
        await table.save();
        updates.occupied++;
      }
      continue;
    }
    
    // Jika tidak ada reservasi aktif, cek reservasi berikutnya
    const nextReservation = await Reservation.findOne({
      where: {
        table_id: table.id,
        reservation_date: currentDate,
        status: 'confirmed',
        reservation_time: { [Op.gt]: currentTime }
      },
      order: [['reservation_time', 'ASC']]
    });
    
    if (nextReservation) {
      // Hitung selisih waktu dengan reservasi berikutnya
      const nextReservationTime = new Date(`${nextReservation.reservation_date}T${nextReservation.reservation_time}`);
      const diffMinutes = Math.floor((nextReservationTime - new Date()) / (1000 * 60));
      
      // Jika waktu <= 60 menit sebelum reservasi, set 'occupied'
      if (diffMinutes <= 60) {
        if (table.status !== 'occupied') {
          logMessage(`Table #${table.id}: ${oldStatus} -> occupied (Upcoming reservation #${nextReservation.id} in ${diffMinutes} minutes)`);
          table.status = 'occupied';
          await table.save();
          updates.occupied++;
        }
      }
      // Jika lebih dari 60 menit, set 'reserved'
      else {
        if (table.status !== 'reserved') {
          logMessage(`Table #${table.id}: ${oldStatus} -> reserved (Next reservation #${nextReservation.id} in ${diffMinutes} minutes)`);
          table.status = 'reserved';
          await table.save();
          updates.reserved++;
        }
      }
    }
    // Jika tidak ada reservasi aktif atau berikutnya, set 'available'
    else {
      if (table.status !== 'available') {
        logMessage(`Table #${table.id}: ${oldStatus} -> available (No active or upcoming reservations)`);
        table.status = 'available';
        await table.save();
        updates.available++;
      }
    }
  }
  
  return updates;
};

module.exports = updateReservationAndTableStatus;