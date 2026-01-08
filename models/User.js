// User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  host_ip: String,
  user_agent: String,
  timestamp: String,
  cookies: Array,
});

const User = mongoose.model('User ', userSchema);

module.exports = User;