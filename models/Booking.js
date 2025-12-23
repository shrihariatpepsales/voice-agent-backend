const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    browserSessionId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
      max: 150,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    medicalConcern: {
      type: String,
      required: true,
      trim: true,
    },
    appointmentDateTime: {
      type: Date,
      required: true,
    },
    email: {
      type: String,
      default: null,
      trim: true,
    },
    doctorPreference: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'confirmed',
    },
  },
  {
    timestamps: true,
  }
);

BookingSchema.index({ browserSessionId: 1, createdAt: -1 });

module.exports = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);



