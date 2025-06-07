const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { Op, Sequelize } = require('sequelize');
const now = new Date();
const axios = require('axios');
const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

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
    
    // Debug: Log semua headers yang diterima
    console.log('All headers:', req.headers);
    console.log('Authorization header:', req.headers.authorization);
    
    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    let token;

    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header tidak ditemukan' });
    }

    // Cek apakah format Bearer token atau langsung token
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      // Jika tidak ada 'Bearer ', anggap header langsung berisi token
      token = authHeader;
    }

    if (!token) {
      return res.status(401).json({ message: 'Token tidak ditemukan dalam Authorization header' });
    }

    console.log('Extracted token:', token);

    // Request ke Auth Service lewat API Gateway
    // Pastikan format Authorization header sesuai dengan yang diharapkan Auth Service
    const authResponse = await axios.get('http://localhost:3000/auth/getUser', {
      headers: {
        Authorization: authHeader // Kirim header authorization yang sama
      }
    });

    const user = authResponse.data.user;
    if (!user) {
      return res.status(401).json({ message: 'User tidak valid' });
    }

    const user_id = user.id;

    // Cek keberadaan meja
    const table = await Table.findByPk(table_id);
    if (!table) {
      return res.status(404).json({ message: 'Meja tidak ditemukan' });
    }
    
    // Validasi kapasitas
    if (guest_count > table.capacity) {
      return res.status(400).json({ message: `Kapasitas meja hanya ${table.capacity} orang` });
    }
    
    // Cek ketersediaan jadwal reservasi
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
    
    res.status(201).json({
      message: 'Reservasi berhasil dibuat',
      reservation
    });
  } catch (error) {
    console.error('Error creating reservation:', error.response?.data || error.message);
    
    // Jika error dari Auth Service, kirim response yang lebih detail
    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Gagal memverifikasi user',
        error: error.response.data
      });
    }
    
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
    console.log('=== RESERVATION SERVICE DEBUG ===');
    console.log('All headers:', req.headers);
    console.log('x-user-id header:', req.headers['x-user-id']);

    const user_id = req.headers['x-user-id'];
    const reservationId = req.params.id;

    if (!user_id) {
      return res.status(401).json({ message: 'User ID tidak ditemukan dalam header' });
    }

    // Cari reservasi berdasarkan ID
    const reservation = await Reservation.findOne({
      where: {
        id: reservationId,
        user_id: user_id // Pastikan reservasi milik user yang sama
      },
      include: [
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ]
    });

    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan atau tidak dimiliki oleh user ini' });
    }

    res.status(200).json({
      message: 'Data reservasi berhasil diambil',
      reservation
    });

  } catch (error) {
    console.error('Error fetching reservation by ID:', error.message);
    res.status(500).json({ 
      message: 'Gagal mengambil data reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};



// Mendapatkan reservasi berdasarkan user
exports.getUserReservations = async (req, res) => {
  try {
    console.log('=== RESERVATION SERVICE DEBUG ===');
    console.log('All headers:', req.headers);
    console.log('x-user-id header:', req.headers['x-user-id']);

    const user_id = req.headers['x-user-id'];

    if (!user_id) {
      return res.status(401).json({ message: 'User ID tidak ditemukan dalam header' });
    }

    const reservations = await Reservation.findAll({
      where: { user_id },
      include: [
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ],
      order: [['reservation_date', 'ASC'], ['reservation_time', 'ASC']]
    });

    res.status(200).json({
      message: 'Data reservasi berhasil diambil',
      reservations
    });

  } catch (error) {
    console.error('Error fetching user reservations:', error.message);
    res.status(500).json({ 
      message: 'Gagal mengambil data reservasi pengguna', 
      error: error.message || 'Unknown error'
    });
  }
};

// Mengupdate data reservasi
exports.updateReservation = async (req, res) => {
  try {
    // Debug: Log headers dan Authorization
    console.log('All headers:', req.headers);
    console.log('Authorization header:', req.headers.authorization);
    console.log('Request body:', req.body);

    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    let token;

    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header tidak ditemukan' });
    }

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader;
    }

    if (!token) {
      return res.status(401).json({ message: 'Token tidak ditemukan dalam Authorization header' });
    }

    console.log('Extracted token:', token);

    // Request ke Auth Service untuk verifikasi user
    const authResponse = await axios.get('http://localhost:3000/auth/getUser', {
      headers: {
        Authorization: authHeader
      }
    });

    const user = authResponse.data.user;
    if (!user) {
      return res.status(401).json({ message: 'User tidak valid' });
    }

    // Dapatkan ID reservasi dan data update
    const { id } = req.params;
    const { table_id, reservation_date, reservation_time, duration, guest_count, notes } = req.body;

    // Cari reservasi
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }

    // Validasi user: hanya admin atau pemilik reservasi yang boleh update
    if (user.id !== reservation.user_id && user.role !== 'admin') {
      return res.status(403).json({ message: 'Tidak berhak mengupdate reservasi ini' });
    }

    // Validasi status reservasi
    if (reservation.status === 'completed' || reservation.status === 'cancelled') {
      return res.status(400).json({ message: `Reservasi sudah ${reservation.status}, tidak dapat diupdate` });
    }

    // Validasi keberadaan meja baru jika ada perubahan
    let table = null;
    if (table_id && table_id !== reservation.table_id) {
      table = await Table.findByPk(table_id);
      if (!table) {
        return res.status(404).json({ message: 'Meja tidak ditemukan' });
      }
    } else {
      table = await Table.findByPk(reservation.table_id);
    }

    // Validasi kapasitas meja
    if (guest_count && guest_count > table.capacity) {
      return res.status(400).json({ message: `Kapasitas meja hanya ${table.capacity} orang` });
    }

    // Cek ketersediaan jadwal reservasi jika ada perubahan waktu/tanggal/durasi/meja
    if (
      reservation_date ||
      reservation_time ||
      duration ||
      (table_id && table_id !== reservation.table_id)
    ) {
      const availabilityCheck = await checkReservationAvailability(
        table_id || reservation.table_id,
        reservation_date || reservation.reservation_date,
        reservation_time || reservation.reservation_time,
        duration || reservation.duration,
        id // exclude current reservation
      );

      if (!availabilityCheck.isAvailable) {
        return res.status(400).json({ message: availabilityCheck.message });
      }
    }

    // Update data reservasi
    const updatedFields = {};
    if (table_id) updatedFields.table_id = table_id;
    if (reservation_date) updatedFields.reservation_date = reservation_date;
    if (reservation_time) updatedFields.reservation_time = reservation_time;
    if (duration) updatedFields.duration = duration;
    if (guest_count) updatedFields.guest_count = guest_count;
    if (notes !== undefined) updatedFields.notes = notes;

    await reservation.update(updatedFields);

    // Ambil data reservasi yang sudah diupdate
    const updatedReservation = await Reservation.findByPk(id, {
      include: [{ model: Table, attributes: ['id', 'table_number', 'capacity'] }]
    });

    res.status(200).json({
      message: 'Reservasi berhasil diupdate',
      reservation: updatedReservation
    });
  } catch (error) {
    console.error('Error updating reservation:', error.response?.data || error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Gagal memverifikasi user atau mengupdate reservasi',
        error: error.response.data
      });
    }

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
    console.log('=== RESERVATION SERVICE UPDATE STATUS DEBUG ===');
    console.log('All headers:', req.headers);
    console.log('Authorization header:', req.headers.authorization);
    console.log('Request body:', req.body);

    const { id } = req.params;
    const { status } = req.body;

    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    let token;

    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header tidak ditemukan' });
    }

    // Cek apakah format Bearer token atau langsung token
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      // Jika tidak ada 'Bearer ', anggap header langsung berisi token
      token = authHeader;
    }

    if (!token) {
      return res.status(401).json({ message: 'Token tidak ditemukan dalam Authorization header' });
    }

    console.log('Extracted token:', token);

    // Request ke Auth Service lewat API Gateway
    // Pastikan format Authorization header sesuai dengan yang diharapkan Auth Service
    const authResponse = await axios.get('http://localhost:3000/auth/getUser', {
      headers: {
        Authorization: authHeader // Kirim header authorization yang sama
      }
    });

    const user = authResponse.data.user;
    if (!user) {
      return res.status(401).json({ message: 'User tidak valid' });
    }

    const user_id = user.id;

    // Cari reservasi
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }

    // Cek apakah user authorized (admin atau pemilik reservasi)
    if (user.id !== reservation.user_id && user.role !== 'admin') {
      return res.status(403).json({ message: 'Tidak berhak mengupdate reservasi ini' });
    }

    // Update status reservasi
    reservation.status = status;
    await reservation.save();

    // Update status meja sesuai logika
    const table = await Table.findByPk(reservation.table_id);
    if (table) {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().split(' ')[0];

      if (status === 'confirmed') {
        const activeOccupiedReservation = await Reservation.findOne({
          where: {
            table_id: reservation.table_id,
            id: { [Op.ne]: reservation.id },
            reservation_date: currentDate,
            status: 'confirmed',
            [Op.and]: [
              { reservation_time: { [Op.lte]: currentTime } },
              Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
            ]
          }
        });

        if (activeOccupiedReservation) {
          console.log(`Meja tetap occupied karena reservasi ${activeOccupiedReservation.id} sedang aktif`);
        } else {
          const reservationDateTime = new Date(`${reservation.reservation_date}T${reservation.reservation_time}`);
          const diffMinutes = Math.floor((reservationDateTime - now) / (1000 * 60));
          if (reservation.reservation_date === currentDate && (diffMinutes <= 60 || diffMinutes < 0)) {
            table.status = 'occupied';
          } else {
            table.status = 'reserved';
          }
          await table.save();
        }
      } else if (status === 'cancelled' || status === 'completed') {
        const activeReservation = await Reservation.findOne({
          where: {
            table_id: reservation.table_id,
            id: { [Op.ne]: reservation.id },
            reservation_date: currentDate,
            status: 'confirmed',
            [Op.and]: [
              { reservation_time: { [Op.lte]: currentTime } },
              Sequelize.literal(`ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > '${currentTime}'`)
            ]
          }
        });

        if (!activeReservation) {
          const nextReservation = await Reservation.findOne({
            where: {
              table_id: reservation.table_id,
              id: { [Op.ne]: reservation.id },
              reservation_date: currentDate,
              status: 'confirmed',
              reservation_time: { [Op.gt]: currentTime }
            },
            order: [['reservation_time', 'ASC']]
          });

          if (nextReservation) {
            const nextReservationDateTime = new Date(`${nextReservation.reservation_date}T${nextReservation.reservation_time}`);
            const diffMinutes = Math.floor((nextReservationDateTime - now) / (1000 * 60));
            if (diffMinutes <= 60) {
              table.status = 'occupied';
            } else {
              table.status = 'reserved';
            }
          } else {
            table.status = 'available';
          }
          await table.save();
        }
      }
    }

    res.status(200).json({
      message: 'Status reservasi berhasil diupdate',
      reservation,
      tableStatus: table ? table.status : null
    });

  } catch (error) {
    console.error('Error updating reservation status:', error.response?.data || error.message);
    
    // Jika error dari Auth Service, kirim response yang lebih detail
    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Gagal memverifikasi user',
        error: error.response.data
      });
    }
    
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
        table.status = 'reserved';
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
    console.log('=== RESERVATION SERVICE CANCEL DEBUG ===');
    console.log('All headers:', req.headers);
    console.log('Authorization header:', req.headers.authorization);

    const { id } = req.params;

    // Ambil token dari Authorization header
    const authHeader = req.headers.authorization;
    let token;

    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header tidak ditemukan' });
    }

    // Cek apakah format Bearer token atau langsung token
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      // Jika tidak ada 'Bearer ', anggap header langsung berisi token
      token = authHeader;
    }

    if (!token) {
      return res.status(401).json({ message: 'Token tidak ditemukan dalam Authorization header' });
    }

    console.log('Extracted token:', token);

    // Request ke Auth Service lewat API Gateway
    // Pastikan format Authorization header sesuai dengan yang diharapkan Auth Service
    const authResponse = await axios.get('http://localhost:3000/auth/getUser', {
      headers: {
        Authorization: authHeader // Kirim header authorization yang sama
      }
    });

    const user = authResponse.data.user;
    if (!user) {
      return res.status(401).json({ message: 'User tidak valid' });
    }

    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservasi tidak ditemukan' });
    }

    // Cek apakah user authorized (admin atau pemilik reservasi)
    if (user.id !== reservation.user_id && user.role !== 'admin') {
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
    console.error('Error cancelling reservation:', error.response?.data || error.message);
    
    // Jika error dari Auth Service, kirim response yang lebih detail
    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Gagal memverifikasi user',
        error: error.response.data
      });
    }
    
    res.status(500).json({ 
      message: 'Gagal membatalkan reservasi', 
      error: error.message || 'Unknown error'
    });
  }
};

// 
exports.getOngoingReservations = async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Format YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // Format HH:MM:SS

    const reservations = await Reservation.findAll({
      where: {
        reservation_date: today,
        status: {
          [Op.notIn]: ['cancelled', 'completed']
        },
        [Op.and]: [
          Sequelize.literal(TIME(reservation_time) <= TIME('${currentTime}')),
          Sequelize.literal(ADDTIME(reservation_time, SEC_TO_TIME(duration * 60)) > TIME('${currentTime}'))
        ]
      },
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Table, attributes: ['id', 'table_number', 'capacity'] }
      ],
      order: [['reservation_time', 'ASC']]
    });

    res.status(200).json(reservations);
  } catch (error) {
    console.error('Error fetching ongoing reservations:', error);
    res.status(500).json({ 
      message: 'Gagal mengambil reservasi yang sedang berlangsung', 
      error: error.message || 'Unknown error'
    });
  }
};
