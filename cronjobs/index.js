// cronjobs/index.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const updateReservationAndTableStatus = require('./updateReservationStatus');

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
 * Fungsi untuk memulai semua cronjobs
 */
const initCronJobs = () => {
  // Log inisialisasi cronjob
  logMessage('===== INITIALIZING CRONJOBS =====');
  
  // Cronjob untuk update status reservasi dan meja
  // Berjalan setiap 5 menit
  const scheduledJob = cron.schedule('*/5 * * * *', async () => {
    try {
      logMessage('Cronjob triggered: update reservation and table status');
      const result = await updateReservationAndTableStatus();
      if (result) {
        logMessage('Cronjob completed successfully');
      } else {
        logMessage('Cronjob completed with errors');
      }
    } catch (error) {
      logMessage(`ERROR running cronjob: ${error.message}`);
      logMessage(error.stack);
    }
  });
  
  logMessage('Reservation status update cronjob scheduled (every 5 minutes)');
  logMessage('===== ALL CRONJOBS INITIALIZED =====');
  
  return {
    scheduledJob
  };
};

module.exports = { initCronJobs };