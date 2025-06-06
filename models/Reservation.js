const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Table = require('./Table');

const Reservation = sequelize.define('Reservation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  table_id: {
    type: DataTypes.INTEGER,
    references: {
      model: Table,
      key: 'id'
    }
  },
  reservation_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  reservation_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60
  },
  guest_count: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
    defaultValue: 'pending'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Hubungan antar model
Table.hasMany(Reservation, { foreignKey: 'table_id' });
Reservation.belongsTo(Table, { foreignKey: 'table_id' });

module.exports = Reservation;
