const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  memberCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index to ensure unique group names within an organization
groupSchema.index({ orgId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Group', groupSchema);
