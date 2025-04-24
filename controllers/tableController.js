const Table = require('../models/Table');

// Mendapatkan semua meja
exports.getAllTables = async (req, res) => {
  try {
    const tables = await Table.findAll();
    res.status(200).json(tables);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ message: 'Gagal mengambil data meja' });
  }
};

// Mendapatkan meja berdasarkan ID
exports.getTableById = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findByPk(id);
    
    if (!table) {
      return res.status(404).json({ message: 'Meja tidak ditemukan' });
    }
    
    res.status(200).json(table);
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ message: 'Gagal mengambil data meja' });
  }
};

// Menambahkan meja baru
exports.createTable = async (req, res) => {
  try {
    const { table_number, capacity } = req.body;
    
    // Cek apakah nomor meja sudah ada
    const existingTable = await Table.findOne({ where: { table_number } });
    if (existingTable) {
      return res.status(400).json({ message: 'Nomor meja sudah ada' });
    }
    
    const table = await Table.create({
      table_number,
      capacity,
      status: 'available'
    });
    
    res.status(201).json({
      message: 'Meja berhasil ditambahkan',
      table
    });
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ message: 'Gagal menambahkan meja' });
  }
};

// Mengupdate status meja
exports.updateTableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const table = await Table.findByPk(id);
    if (!table) {
      return res.status(404).json({ message: 'Meja tidak ditemukan' });
    }
    
    // Update status meja
    table.status = status;
    await table.save();
    
    res.status(200).json({
      message: 'Status meja berhasil diupdate',
      table
    });
  } catch (error) {
    console.error('Error updating table status:', error);
    res.status(500).json({ message: 'Gagal mengupdate status meja' });
  }
};

// Menghapus meja
exports.deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    
    const table = await Table.findByPk(id);
    if (!table) {
      return res.status(404).json({ message: 'Meja tidak ditemukan' });
    }
    
    await table.destroy();
    
    res.status(200).json({ message: 'Meja berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ message: 'Gagal menghapus meja' });
  }
};

// Mendapatkan meja yang tersedia
exports.getAvailableTables = async (req, res) => {
  try {
    const tables = await Table.findAll({
      where: { status: 'available' }
    });
    
    res.status(200).json(tables);
  } catch (error) {
    console.error('Error fetching available tables:', error);
    res.status(500).json({ message: 'Gagal mengambil data meja yang tersedia' });
  }
};