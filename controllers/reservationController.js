const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const User = require('../models/User');
const { Op, Sequelize } = require('sequelize');

/**
 * Fungsi untuk memeriksa ketersediaan jadwal reservasi
 * @param {number} table_id - ID meja yang akan direservasi
 * @param {string} reservation_date - Tanggal reservasi (format: YYYY-MM-DD)
 * @param {string} reservation_time - Waktu mulai reservasi (format: HH:MM:SS)
 * @param {number} duration - Durasi reservasi dalam menit
 * @param {number} reservation_id - ID reservasi (opsional, untuk kasus update)
 * @returns {Promise<{isAvailable: boolean, message: string}>} - Status ketersediaan dan pesan
 */
const checkReservationAvailability = async (table_id, reservation_date, reservation_time, duration, reservation_id = null) => {
  try {
    // Validasi input
    if (!table_id || !reservation_date || !reservation_time || !duration) {
      return {
        isAvailable: false,
        message: 'Data reservasi tidak lengkap. table_id, reservation_date, reservation_time, dan duration harus diisi'
      };
    }

    // Konversi ke tipe data yang sesuai jika perlu
    const tableId = parseInt(table_id, 10);
    const durationMinutes = parseInt(duration, 10);
    
    // Buat kondisi untuk mencari reservasi yang overlap
    const whereCondition = {
      table_id: tableId,
      reservation_date: reservation_date,
      status: {
        [Op.notIn]: ['cancelled', 'completed']
      }
    };
    
    // Jika ini adalah update, exclude reservasi yang sedang diupdate
    if (reservation_id) {
      whereCondition.id = {
        [Op.ne]: reservation_id
      };
    }

    // Cek apakah ada reservasi yang overlap untuk meja yang sama pada waktu tersebut
    const overlappingReservation = await Reservation.findOne({
      where: {
        ...whereCondition,
        [Op.or]: [
          // Kasus 1: Reservasi yang sudah ada dimulai sebelum atau sama dengan waktu yang diminta
          // dan berakhir setelah waktu mulai yang diminta
          Sequelize.literal(`
            reservation_time <= '${reservation_time}' AND 
            ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${reservation_time}'
          `),
          
          // Kasus 2: Reservasi yang sudah ada dimulai setelah waktu yang diminta
          // tapi dimulai sebelum waktu yang diminta berakhir
          Sequelize.literal(`
            reservation_time > '${reservation_time}' AND 
            reservation_time < ADDTIME('${reservation_time}', SEC_TO_TIME(${durationMinutes} * 60))
          `)
        ]
      }
    });
    
    if (overlappingReservation) {
      return {
        isAvailable: false,
        message: 'Waktu reservasi bertabrakan dengan reservasi lain',
        conflictingReservation: overlappingReservation
      };
    }
    
    return {
      isAvailable: true,
      message: 'Waktu reservasi tersedia'
    };
    
  } catch (error) {
    console.error('Error checking reservation availability:', error);
    return {
      isAvailable: false,
      message: `Gagal memeriksa ketersediaan waktu: ${error.message || 'Unknown error'}`
    };
  }
};

// Membuat reservasi baru
exports.createReservation = async (req, res) => {
  try {
    const { table_id, reservation_date, reservation_time, duration, guest_count, notes } = req.body;
    const user_id = req.user.id; // Dari middleware auth
    
    // Cek keberadaan meja
    const table = await Table.findByPk(table_id);
    if (!table) {
      return res.status(404).json({ message: 'Meja tidak ditemukan' });
    }
    
    // Validasi kapasitas
    if (guest_count > table.capacity) {
      return res.status(400).json({ message: `Kapasitas meja hanya ${table.capacity} orang` });
    }
    
    // Cek ketersediaan jadwal reservasi (overlap check)
    const availabilityCheck = await checkReservationAvailability(
      table_id, 
      reservation_date, 
      reservation_time, 
      duration
    );
    
    if (!availabilityCheck.isAvailable) {
      return res.status(400).json({ message: availabilityCheck.message });
    }
      
    // Buat reservasi
    const reservation = await Reservation.create({
      user_id,
      table_id,
      reservation_date,
      reservation_time,
      duration,
      guest_count,
      notes,
      status: 'pending'
    });
    
    // Status meja tidak perlu diubah saat reservasi dibuat untuk jadwal di masa depan
    // Status meja tetap 'available' sampai mendekati atau saat jadwal reservasi tiba
    
    res.status(201).json({
      message: 'Reservasi berhasil dibuat',
      reservation
    });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ 
      message: 'Gagal membuat reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};

// Mendapatkan semua reservasi (untuk admin)
exports.getAllReservations = async (req, res) => {
  try {
    const reservations = await Reservation.findAll({
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ],
      order: [['reservation_date', 'ASC'], ['reservation_time', 'ASC']]
    });
    
    res.status(200).json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ 
      message: 'Gagal mengambil data reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};

// Mendapatkan reservasi berdasarkan ID
exports.getReservationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ]
    });
    
    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }
    
    // Cek apakah user authorized (admin atau pemilik reservasi)
    if (req.user.id !== reservation.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Tidak berhak mengakses reservasi ini' });
    }
    
    res.status(200).json(reservation);
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({ 
      message: 'Gagal mengambil data reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};

// Mendapatkan reservasi berdasarkan user
exports.getUserReservations = async (req, res) => {
  try {
    const user_id = req.user.id;
    
    const reservations = await Reservation.findAll({
      where: { user_id },
      include: [
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ],
      order: [['reservation_date', 'ASC'], ['reservation_time', 'ASC']]
    });
    
    res.status(200).json(reservations);
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    res.status(500).json({ 
      message: 'Gagal mengambil data reservasi pengguna', 
      error: error.message || 'Unknown error'
    });
  }
};

// Mengupdate data reservasi
exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { table_id, reservation_date, reservation_time, duration, guest_count, notes } = req.body;
    
    // Cek apakah reservasi ada
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }
    
    // Cek apakah user authorized (admin atau pemilik reservasi)
    if (req.user.id !== reservation.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Tidak berhak mengupdate reservasi ini' });
    }
    
    // Cek apakah reservasi sudah selesai atau dibatalkan
    if (reservation.status === 'completed' || reservation.status === 'cancelled') {
      return res.status(400).json({ message: `Reservasi sudah ${reservation.status}, tidak dapat diupdate` });
    }
    
    // Jika ganti meja, cek keberadaan meja baru
    let table = null;
    if (table_id && table_id !== reservation.table_id) {
      table = await Table.findByPk(table_id);
      if (!table) {
        return res.status(404).json({ message: 'Meja tidak ditemukan' });
      }
    } else {
      // Gunakan meja yang sama
      table = await Table.findByPk(reservation.table_id);
    }
    
    // Validasi kapasitas jika guest_count berubah
    if (guest_count && guest_count > table.capacity) {
      return res.status(400).json({ message: `Kapasitas meja hanya ${table.capacity} orang` });
    }
    
    // Cek ketersediaan jadwal jika waktu/tanggal/durasi diubah
    if (reservation_date || reservation_time || duration || (table_id && table_id !== reservation.table_id)) {
      const availabilityCheck = await checkReservationAvailability(
        table_id || reservation.table_id,
        reservation_date || reservation.reservation_date,
        reservation_time || reservation.reservation_time,
        duration || reservation.duration,
        id // Kirim ID reservasi yang sedang diupdate untuk dikecualikan dari pengecekan
      );
      
      if (!availabilityCheck.isAvailable) {
        return res.status(400).json({ message: availabilityCheck.message });
      }
    }
    
    // Update reservasi
    const updatedFields = {};
    if (table_id) updatedFields.table_id = table_id;
    if (reservation_date) updatedFields.reservation_date = reservation_date;
    if (reservation_time) updatedFields.reservation_time = reservation_time;
    if (duration) updatedFields.duration = duration;
    if (guest_count) updatedFields.guest_count = guest_count;
    if (notes !== undefined) updatedFields.notes = notes;
    
    await reservation.update(updatedFields);
    
    // Ambil data reservasi yang telah diupdate
    const updatedReservation = await Reservation.findByPk(id, {
      include: [
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ]
    });
    
    res.status(200).json({
      message: 'Reservasi berhasil diupdate',
      reservation: updatedReservation
    });
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({ 
      message: 'Gagal mengupdate reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};

// Endpoint untuk cek ketersediaan (untuk frontend)
exports.checkAvailability = async (req, res) => {
    try {
        const { table_id, reservation_date, reservation_time, duration, reservation_id } = req.body;
    
        const result = await checkReservationAvailability(
      table_id, 
      reservation_date, 
      reservation_time, 
      duration,
      reservation_id
    );
    
    res.status(200).json(result);
} catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      isAvailable: false,
      message: `Error: ${error.message}`
    });
  }
};

// Fungsi untuk memperbarui status meja berdasarkan jadwal reservasi

// Mengupdate status reservasi
exports.updateReservationStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
      }
      
      // Cek apakah user authorized (admin atau pemilik reservasi)
      if (req.user.id !== reservation.user_id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Tidak berhak mengupdate reservasi ini' });
      }
      
      // Update status reservasi
      reservation.status = status;
      await reservation.save();
      
      // Update status meja berdasarkan status reservasi
      const table = await Table.findByPk(reservation.table_id);
      if (table) {
        // Jika status reservasi berubah menjadi 'confirmed', update status meja menjadi 'occupied'
        if (status === 'confirmed') {
          // Periksa apakah ini adalah reservasi untuk saat ini
          const now = new Date();
          const reservationDate = new Date(reservation.reservation_date);
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // Jika reservasi untuk hari ini dan waktunya sudah tiba atau hampir tiba
          if (
            reservationDate.getTime() === today.getTime() && 
            reservation.reservation_time <= now.toTimeString().split(' ')[0]
          ) {
            table.status = 'occupied';
            await table.save();
          } else {
            table.status = 'reserve';
            await table.save();
          }
        }
        // Jika status reservasi berubah menjadi 'cancelled' atau 'completed', periksa reservasi aktif lainnya
        else if (status === 'cancelled' || status === 'completed') {
          // Cek apakah ada reservasi aktif lain untuk meja ini pada waktu yang sama
          const now = new Date();
          const currentDate = now.toISOString().split('T')[0];
          const currentTime = now.toTimeString().split(' ')[0];
          
          const activeReservation = await Reservation.findOne({
            where: {
              table_id: reservation.table_id,
              id: { [Op.ne]: reservation.id },
              reservation_date: currentDate,
              status: 'confirmed',
              // Reservasi yang sedang berlangsung (waktu mulai <= sekarang <= waktu selesai)
              [Op.and]: [
                { reservation_time: { [Op.lte]: currentTime } },
                Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
              ]
            }
          });
          
          // Jika tidak ada reservasi aktif lain, kembalikan status meja menjadi available
          if (!activeReservation) {
            table.status = 'available';
            await table.save();
          }
        }
      }
      
      res.status(200).json({
        message: 'Status reservasi berhasil diupdate',
        reservation
      });
    } catch (error) {
      console.error('Error updating reservation status:', error);
      res.status(500).json({ 
        message: 'Gagal mengupdate status reservasi', 
        error: error.message || 'Unknown error'
      });
    }
  };
  
// Fungsi untuk memperbarui status meja berdasarkan jadwal reservasi
exports.updateTableStatuses = async (req, res) => {
try {
    // Dapatkan waktu sekarang
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    
    // 1. Cari reservasi yang sedang berlangsung (waktu mulai <= sekarang <= waktu selesai)
    const ongoingReservations = await Reservation.findAll({
    where: {
        reservation_date: currentDate,
        status: 'confirmed',
        [Op.and]: [
        { reservation_time: { [Op.lte]: currentTime } },
        Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
        ]
    }
    });
    
    // Set meja untuk reservasi yang sedang berlangsung menjadi 'occupied'
    for (const reservation of ongoingReservations) {
    const table = await Table.findByPk(reservation.table_id);
    if (table && table.status !== 'occupied') {
        table.status = 'occupied';
        await table.save();
    }
    }
    
    // 2. Cari reservasi yang akan dimulai dalam 30 menit
    const thirtyMinutesLater = new Date(now.getTime() + 30 * 60000);
    const upcomingTime = thirtyMinutesLater.toTimeString().split(' ')[0];
    
    const upcomingReservations = await Reservation.findAll({
    where: {
        reservation_date: currentDate,
        status: 'confirmed',
        [Op.and]: [
        { reservation_time: { [Op.gt]: currentTime } },
        { reservation_time: { [Op.lte]: upcomingTime } }
        ]
    }
    });
    
    // Set meja untuk reservasi yang akan dimulai menjadi 'reserve'
    for (const reservation of upcomingReservations) {
    const table = await Table.findByPk(reservation.table_id);
    if (table && table.status === 'available') {
        table.status = 'reserve';
        await table.save();
    }
    }
    
    // 3. Cari reservasi yang sudah selesai
    const completedReservations = await Reservation.findAll({
    where: {
        reservation_date: currentDate,
        status: 'confirmed',
        [Op.and]: [
        Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) <= '${currentTime}'`)
        ]
    }
    });
    
    // Update status reservasi yang sudah selesai
    for (const reservation of completedReservations) {
    reservation.status = 'completed';
    await reservation.save();
    
    // Cek apakah ada reservasi aktif lain untuk meja ini
    const activeReservation = await Reservation.findOne({
        where: {
        table_id: reservation.table_id,
        id: { [Op.ne]: reservation.id },
        reservation_date: currentDate,
        status: 'confirmed',
        // Reservasi yang sedang berlangsung atau akan dimulai dalam 30 menit
        [Op.or]: [
            {
            [Op.and]: [
                { reservation_time: { [Op.lte]: currentTime } },
                Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
            ]
            },
            {
            [Op.and]: [
                { reservation_time: { [Op.gt]: currentTime } },
                { reservation_time: { [Op.lte]: upcomingTime } }
            ]
            }
        ]
        }
    });
    
    // Kembalikan status meja menjadi available jika tidak ada reservasi aktif lainnya
    if (!activeReservation) {
        const table = await Table.findByPk(reservation.table_id);
        if (table) {
        table.status = 'available';
        await table.save();
        }
    }
    }
    
    if (res) {
    res.status(200).json({
        message: 'Status meja berhasil diperbarui',
        ongoing: ongoingReservations.length,
        upcoming: upcomingReservations.length,
        completed: completedReservations.length
    });
    }
    
    return {
    ongoing: ongoingReservations,
    upcoming: upcomingReservations,
    completed: completedReservations
    };
} catch (error) {
    console.error('Error updating table statuses:', error);
    if (res) {
    res.status(500).json({
        message: 'Gagal memperbarui status meja',
        error: error.message || 'Unknown error'
    });
    }
    
    return { error };
}
};

// Membatalkan reservasi
exports.cancelReservation = async (req, res) => {
try {
    const { id } = req.params;
    
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
    return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }
    
    // Cek apakah user authorized (admin atau pemilik reservasi)
    if (req.user.id !== reservation.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Tidak berhak membatalkan reservasi ini' });
    }
    
    // Cek apakah reservasi sudah selesai atau dibatalkan
    if (reservation.status === 'completed' || reservation.status === 'cancelled') {
    return res.status(400).json({ message: `Reservasi sudah ${reservation.status}` });
    }
    
    // Update status reservasi menjadi cancelled
    reservation.status = 'cancelled';
    await reservation.save();
    
    // Cek apakah reservasi ini adalah yang sedang aktif untuk meja
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0];
    
    if (
    reservation.reservation_date === currentDate &&
    reservation.reservation_time <= currentTime &&
    Sequelize.literal(`ADDTIME('${reservation.reservation_time}', SEC_TO_TIME(${reservation.duration} * 60)) > '${currentTime}'`)
    ) {
    // Cek apakah ada reservasi aktif lain untuk meja ini
    const activeReservation = await Reservation.findOne({
        where: {
        table_id: reservation.table_id,
        id: { [Op.ne]: reservation.id },
        reservation_date: currentDate,
        status: 'confirmed',
        // Reservasi yang sedang berlangsung (waktu mulai <= sekarang <= waktu selesai)
        [Op.and]: [
            { reservation_time: { [Op.lte]: currentTime } },
            Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
        ]
        }
    });
    
    // Update status meja menjadi available jika tidak ada reservasi aktif lainnya
    if (!activeReservation) {
        const table = await Table.findByPk(reservation.table_id);
        if (table) {
        table.status = 'available';
        await table.save();
        }
    }
    }
    
    res.status(200).json({
    message: 'Reservasi berhasil dibatalkan',
    reservation
    });
} catch (error) {
    console.error('Error cancelling reservation:', error);
    res.status(500).json({ 
    message: 'Gagal membatalkan reservasi', 
    error: error.message || 'Unknown error'
    });
}
};
