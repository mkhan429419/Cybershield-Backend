const mongoose = require("mongoose");
const WhatsAppTemplate = require("../models/WhatsAppTemplate");
require("dotenv").config();

const templates = [
  {
    title: "Banking Verification",
    description: "Simulate banking security alerts and account verification requests to test user awareness of financial phishing attempts.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `Your UBL account will be blocked within 24 hours due to incomplete verification.
Click the link below to verify now:
🔗 ubl-verification-pk.com/login

Helpline: +92-301-1234567`,
  },
  {
    title: "Lottery Prize",
    description: "Test how users respond to prize-winning notifications and lottery scams that request personal information.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    messageTemplate: `You have won Rs. 50,000 through the Jazz Daily Lucky Draw.
Please send your CNIC number and JazzCash number to claim your prize!
📞 Contact: 0345-9876543`,
  },
  {
    title: "Job Interview",
    description: "Create realistic job offer messages to evaluate how well users can identify employment-related phishing attempts.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    messageTemplate: `You have been shortlisted for a job interview.
Please pay Rs. 2000 for form verification to confirm your slot.
Send via Easypaisa: 0333-7654321
Form link: nestle-careerpk.com`,
  },
  {
    title: "Package Delivery",
    description: "Simulate shipping notifications and delivery updates to assess user vigilance against delivery-related phishing scams.",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    messageTemplate: `Your parcel is held due to incorrect address.
Please click below to update details and pay Rs. 150 handling charges.
🔗 tcs-tracking-pk.net`,
  },
];

const seedTemplates = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybershield';
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB");

    // Check if templates already exist
    const existingCount = await WhatsAppTemplate.countDocuments();
    if (existingCount > 0) {
      console.log(`ℹ️ Found ${existingCount} existing templates. Skipping seed.`);
      console.log("💡 To re-seed, delete existing templates first or modify the script.");
      process.exit(0);
    }

    // Insert templates
    const inserted = await WhatsAppTemplate.insertMany(templates);
    console.log(`✅ Successfully seeded ${inserted.length} WhatsApp templates`);
    
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

