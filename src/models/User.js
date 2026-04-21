const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
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
  // Combined learning score (0–100): weighted average of email, whatsapp, lms, voice. Recalculated when any of those updates.
  learningScore: {
    type: Number,
    default: 0
  },
  // Learning scores (0–1): higher = better. Email/WhatsApp: no events = 1; with events = 1 - risk.
  learningScoreEmail: {
    type: Number,
    default: 0
  },
  // WhatsApp learning score only. Do not use a field named whatsappRiskScore.
  learningScoreWhatsapp: {
    type: Number,
    default: 0
  },
  learningScoreLms: {
    type: Number,
    default: 0
  },
  // Voice phishing: latest campaign score (0–1); higher = better
  learningScoreVoice: {
    type: Number,
    default: 0
  },
  learningScoreIncident: {
    type: Number,
    default: 0
  },
  badges: [{
    type: String
  }]
}, {
  timestamps: true
});

// Never persist whatsappRiskScore — only learningScoreWhatsapp is valid. Strip if present (e.g. from old data).
userSchema.pre('save', function (next) {
  if (this.isModified('whatsappRiskScore') || this.whatsappRiskScore !== undefined) {
    this.whatsappRiskScore = undefined;
    delete this._doc.whatsappRiskScore;
  }
  next();
});

// Index for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ orgId: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
