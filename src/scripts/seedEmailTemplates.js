const mongoose = require("mongoose");
const EmailTemplate = require("../models/EmailTemplate");
require("dotenv").config();

const templates = [
  {
    title: "UBL Account Verification",
    description: "Simulate UBL banking security alerts requesting urgent verification to test awareness of financial phishing in Pakistan.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "URGENT: UBL Account Verification Required Within 24 Hours",
      bodyContent: `Dear Valued UBL Customer,

We have detected unusual activity on your United Bank Limited (UBL) account.

For your security, your account access has been temporarily restricted. To avoid permanent suspension, please verify your account information immediately.

🔗 Verify Account: https://ubl-secure-verification.pk/login

Failure to verify within 24 hours may result in:
• Temporary account freeze
• Restricted online banking access
• ATM transaction limitations

Security Reminder:
• UBL will NEVER ask for your ATM PIN or full password
• Do not share OTP codes with anyone
• Always verify official UBL domains

For assistance, contact UBL Helpline:
📞 111-825-888

Regards,
UBL Digital Banking Team
United Bank Limited`
    }
  },
  {
    title: "Online Account Security Alert",
    description: "Test user response to urgent login alerts and password reset requests commonly seen in Pakistan.",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Security",
    emailTemplate: {
      subject: "Security Alert: Unrecognized Login Detected",
      bodyContent: `Hello,

We noticed a login attempt on your account from an unfamiliar device.

📍 Location: Istanbul, Turkey  
💻 Device: Windows PC  
🕒 Time: Today at 3:12 AM (PKT)

If this was not you, please secure your account immediately.

🔐 Secure Account Now → Reset Password

This link will expire in 12 hours for your safety.

If you ignore this alert, your account may be temporarily locked to prevent unauthorized access.

Stay safe,
Online Security Team`
    }
  },
  {
    title: "Daraz Delivery Issue",
    description: "Simulate Daraz delivery notifications requesting address confirmation and small fees to assess phishing awareness.",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    emailTemplate: {
      subject: "Daraz Delivery Pending – Address Confirmation Required",
      bodyContent: `Dear Daraz Customer,

Your Daraz order (Order ID: DPK-45892176) could not be delivered due to an incomplete address.

To avoid cancellation, please confirm your delivery details within 48 hours.

📦 Confirm Address: https://daraz-logistics-pk.com/confirm

A small verification fee of Rs. 149 may be required to reschedule delivery.

Accepted payment methods:
• Easypaisa
• JazzCash
• Debit/Credit Card

If no action is taken, your order will be returned to the seller.

Thank you for shopping with Daraz.

Daraz Pakistan Logistics Team
www.daraz.pk`
    }
  },
  {
    title: "Job Interview Shortlisting",
    description: "Create realistic job interview emails requesting processing fees to test awareness of employment-related phishing scams in Pakistan.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    emailTemplate: {
      subject: "Interview Confirmation – Nestlé Pakistan",
      bodyContent: `Dear Applicant,

Congratulations! Your CV has been shortlisted for the position of Marketing Executive at Nestlé Pakistan.

Interview Details:
📍 Location: Nestlé Office, Lahore
📅 Date: To be confirmed after registration

To confirm your interview slot, please complete the following steps:

1️⃣ Pay interview registration fee (Rs. 2,000)
• Easypaisa / JazzCash: 0301-9876543

2️⃣ Complete interview form:
https://nestle-careers-pk.com/confirmation

3️⃣ Email payment screenshot for verification

Please note:
• Limited interview slots available
• Confirmation is required within 24 hours

We look forward to meeting you.

HR Recruitment Team
Nestlé Pakistan`
    }
  }
];

const seedTemplates = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybershield';
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB");

    // Clear existing templates (optional - remove if you want to keep existing)
    // await EmailTemplate.deleteMany({});
    // console.log("🗑️ Cleared existing templates");

    // Check if templates already exist
    const existingCount = await EmailTemplate.countDocuments();
    if (existingCount > 0) {
      console.log(`ℹ️ Found ${existingCount} existing templates. Skipping seed.`);
      console.log("💡 To re-seed, delete existing templates first or modify the script.");
      process.exit(0);
    }

    // Insert templates
    const inserted = await EmailTemplate.insertMany(templates);
    console.log(`✅ Successfully seeded ${inserted.length} email templates`);
    
    inserted.forEach((template, index) => {
      console.log(`   ${index + 1}. ${template.title} (${template.category})`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding templates:", error);
    process.exit(1);
  }
};

seedTemplates();

