const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Cek apakah email sudah digunakan
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    // Buat user baru
    const user = await User.create({
      name,
      email,
      phone,
      password
    });

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat registrasi' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Cari user berdasarkan email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'Email tidak ditemukan' });
    }

    // Verifikasi password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password salah' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat login' });
  }
};
exports.logout = async (req, res) => {
  try {
    // Since JWT is stateless, we cannot invalidate the token server-side
    // The client needs to remove the token from storage (browser)
    // For enhanced security, we could implement a token blacklist
    
    // For now, we'll just send a successful response
    res.status(200).json({
      success: true,
      message: 'Logout berhasil'
    });

    // If you want to implement a token blacklist in the future:
    // 1. Get the token from the request
    // 2. Add it to a blacklist (Redis or database table)
    // 3. Set expiry time equal to the remaining time of the token
    
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat logout' });
  }
};