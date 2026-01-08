const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: String,
  password: String,
  __v: Number
});

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;