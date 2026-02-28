const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Allows multiple null values
    default: null // Use null instead of empty string
  },
  email: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: false,
    default: null
  },
  role: {
    type: String,
    enum: ['system_admin', 'client_admin', 'affiliated', 'non_affiliated'],
    required: true
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  groupIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  status: {
    type: String,
    enum: ['invited', 'active', 'suspended'],
    default: 'active'
  },
  points: {
    type: Number,
    default: 0
  },
  learningScore: {
    type: Number,
    default: 0
  },
  emailRiskScore: {
    type: Number,
    default: 0
  },
  whatsappRiskScore: {
    type: Number,
    default: 0
  },
  lmsRiskScore: {
    type: Number,
    default: 0
  },
  voiceRiskScore: {
    type: Number,
    default: 0
  },
  incidentRiskScore: {
    type: Number,
    default: 0
  },
  badges: [{
    type: String
  }]
}, {
  timestamps: true
});

// Index for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ orgId: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
