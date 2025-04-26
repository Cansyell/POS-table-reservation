const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { initCronJobs } = require('./cronjobs'); 

// Import routes
const authRoutes = require('./routes/authRoutes');
const tableRoutes = require('./routes/tableRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

// Import database connection
const sequelize = require('./config/database');

// Initialize Express app
const app = express();

// Inisialisasi cronjob saat aplikasi dimulai
initCronJobs();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/reservations', reservationRoutes);

// Rute untuk testing
app.get('/', (req, res) => {
  res.send('API Coffee Shop Reservation is running!');
});

// Port
const PORT = process.env.PORT || 3000;

// Sync database dan start server
(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error syncing database:', error);
  }
})();