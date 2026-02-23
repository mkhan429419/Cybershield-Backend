const mongoose = require("mongoose");
const WhatsAppTemplate = require("../models/WhatsAppTemplate");
require("dotenv").config();

// Landing base: deployed URL (https://www-login.vercel.app/). Links go directly to e.g. .../amazon.
const LANDING_BASE = process.env.LANDING_PAGES_BASE_URL || "https://www-login.vercel.app";

const templates = [
  // ==================== INTERNATIONAL TEMPLATES ====================

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "microsoft-secure.com" (not official microsoft.com)
   * 2. Generic message without user name
   * 3. Creates urgency with "unusual activity"
   * 4. Threatens account lock
   * 5. Requests verification via external link
   */
  {
    title: "Microsoft Account Alert",
    description: "Simulate Microsoft account security alerts via WhatsApp.",
    image: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    messageTemplate: `Microsoft Security

Sign-in from an unknown device was detected on your acount.

Location: Unknown
Time: 3:42 AM

Confirm it was you or secure your account:
${LANDING_BASE}/mircosoft

- Microsoft Team`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "linkedln-security.com" (misspelled "linkedin")
   * 2. Creates curiosity with profile views
   * 3. "Upgrade to see" is bait
   * 4. Login through external link
   */
  {
    title: "LinkedIn Profile Views",
    description: "Simulate LinkedIn profile view notifications.",
    image: "https://images.unsplash.com/photo-1611944212129-29977ae1398c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Social Media",
    messageTemplate: `LinkedIn Update

5 people viewed your profile this week!

- HR Manager at Google
- Recruiter at Microsoft
- [Hidden - Login to see]

See who's interested:
${LANDING_BASE}/linkdin`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "dropbox-share.net" (.net instead of dropbox.com)
   * 2. Vague "Someone" shared
   * 3. Creates curiosity about document
   * 4. Link expiry creates urgency
   */
  {
    title: "Dropbox File Share",
    description: "Simulate Dropbox file sharing notifications.",
    image: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Cloud Storage",
    messageTemplate: `📄 Dropbox

Someone shared a file with you:
"Important_Document.pdf"

View file:
${LANDING_BASE}/dropbx

Link expires in 24 hours.`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "paypa1-secure.com" (number "1" instead of "l")
   * 2. Account limitation creates panic
   * 3. Verification via external link
   * 4. Generic without account details
   */
  {
    title: "PayPal Account Limited",
    description: "Simulate PayPal account limitation alerts.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `🔒 PayPal Alert

Your account has been limited due to suspicious activity.

Verify your identity:
${LANDING_BASE}/paypa1

Action required within 24 hours.

- PayPal Security`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "netflix-billing.com" (not official netflix.com)
   * 2. Payment failure creates urgency
   * 3. Threatens suspension
   * 4. Requests payment info update
   */
  {
    title: "Netflix Payment Issue",
    description: "Simulate Netflix billing problem notifications.",
    image: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Entertainment",
    messageTemplate: `Netflix

Payment failed for your subscription.

Update payment method to avoid service interruption:
${LANDING_BASE}/netflx

Amount due: $15.99`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "amazn-delivery.com" (misspelled "amazon")
   * 2. Creates curiosity about package
   * 3. Address confirmation via link
   * 4. Today delivery creates urgency
   */
  {
    title: "Amazon Delivery",
    description: "Simulate Amazon package delivery notifications.",
    image: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "E-Commerce",
    messageTemplate: `📦 Amazon

Your package is out for delivery!

Track: ${LANDING_BASE}/amazn

Delivery by 9 PM today.

Having issues? Update address here.`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "google-security-alert.com" (not google.com)
   * 2. New sign-in creates panic
   * 3. "Wasn't you?" is phishing link
   * 4. Creates urgency to secure
   */
  {
    title: "Google Sign-in Alert",
    description: "Simulate Google account sign-in notifications.",
    image: "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    messageTemplate: `🔔 Google

New sign-in to your account

Device: Windows PC
Location: Unknown

Wasn't you? Secure account:
${LANDING_BASE}/gogle`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "dhl-tracking.net" (.net instead of dhl.com)
   * 2. Customs fee creates urgency
   * 3. Return threat adds pressure
   * 4. Payment via external link
   */
  {
    title: "DHL Customs Fee",
    description: "Simulate DHL customs payment notifications.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    messageTemplate: `DHL Express

Your package is held at customs.

Pay $25 fee to release:
${LANDING_BASE}/dhl

Returns in 5 days if unpaid.`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "faceb00k-security.com" (zeros instead of "o")
   * 2. Login attempt creates panic
   * 3. Secure account link is phishing
   * 4. Creates urgency
   */
  {
    title: "Facebook Login Alert",
    description: "Simulate Facebook security notifications.",
    image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Social Media",
    messageTemplate: `Facebook Security

Someone tried to log into your account!

Location: Moscow, Russia
Time: 4:15 AM

Not you? Secure now:
${LANDING_BASE}/faceb00k`
  },

  // ==================== BANKING/FINANCIAL - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "incomplte", "suspention"
   * 2. Fake URL: "hbl-securty-pk.com" (misspelled "security")
   * 3. URL has "verfiy" instead of "verify"
   * 4. Creates urgency with "24 hours" deadline
   * 5. Generic message without account holder name
   */
  {
    title: "HBL Account Alert",
    description: "Simulate HBL banking alerts requesting urgent verification to test financial phishing awareness.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `⚠️ HBL Security Alert

Your HBL account will be blocked within 24 hours due to incomplte verification.

Verify now to avoid suspention:
${LANDING_BASE}/hbl

Helpline: 111-111-425
- HBL Digital Banking`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "transection", "immediatly"
   * 2. Fake URL: "meezan-secure-banking.pk" (not official meezanbank.com)
   * 3. Vague transaction details
   * 4. Creates panic with "suspicious" claim
   * 5. Asks to click link to block card instead of calling bank
   */
  {
    title: "Meezan Bank Transaction",
    description: "Simulate Meezan Bank suspicious transaction alerts for Islamic banking customers.",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `🏦 Meezan Bank Alert

Suspicious transection detected on your account:
Amount: Rs. 45,000
Location: Karachi

Not you? Block card immediatly:
${LANDING_BASE}/meezan-bank

Call: 0800-00-786`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "verificaton", "Ballance"
   * 2. Fake URL: "jazz-cash-verfiy.pk" (misspelled)
   * 3. Threatens balance forfeiture - extreme pressure tactic
   * 4. 48-hour deadline creates panic
   * 5. Generic message without user's actual phone number
   */
  {
    title: "JazzCash Account Suspended",
    description: "Simulate JazzCash account suspension notices for mobile wallet phishing awareness.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `📱 JazzCash Alert

Your account is SUSPENDED due to CNIC verificaton pending.

Restore access now:
${LANDING_BASE}/jazzcash

Ballance will be forfeited in 48 hours!

Dial *786# for help`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Proccessing"
   * 2. Fake URL: "easypaisa-rewards-pk.net" (.net instead of official domain)
   * 3. Requests CNIC copy via message - never legitimate
   * 4. Processing fee for "prize" - classic scam
   * 5. Personal phone number instead of official helpline
   */
  {
    title: "Easypaisa Lucky Draw",
    description: "Simulate Easypaisa reward notifications to test prize-based phishing awareness.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `🎉 Easypaisa Notification

Mubarak! You've won Rs. 25,000 in Khushiyon Ki Barsaat Lucky Draw!

Claim prize now:
${LANDING_BASE}/easypaisa

Send CNIC copy to: 0345-XXXXXXX
Proccessing fee: Rs. 500`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "suspicous", "immediatly"
   * 2. Fake URL: "ubl-cards-securty.com" (misspelled, .com not .pk)
   * 3. Requests CVV and PIN - banks NEVER ask for these
   * 4. Card blocking notification via SMS/WhatsApp is suspicious
   * 5. Asks to enter sensitive info through link
   */
  {
    title: "UBL Debit Card Block",
    description: "Simulate UBL card blocking alerts for banking phishing awareness.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    messageTemplate: `🚫 UBL Card Alert

Your Debit Card ending 4521 has been BLOCKED due to suspicous activity.

Unblock immediatly:
${LANDING_BASE}/ubl

Enter card CVV and PIN to verify.

Call: 111-825-888`
  },

  // ==================== DELIVERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "incomplte", "cancled"
   * 2. Fake URL: "daraz-logistics-support.com" (not official daraz.pk)
   * 3. Requests payment for re-delivery via link
   * 4. 48-hour deadline creates panic
   * 5. Daraz doesn't charge re-delivery fees this way
   */
  {
    title: "Daraz Delivery Failed",
    description: "Simulate Daraz delivery failure notifications for e-commerce phishing awareness.",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    messageTemplate: `📦 Daraz Pakistan

Delivery Failed!
Order: DPK-45892176

Address incomplte. Update now:
${LANDING_BASE}/daraz

Re-delivery fee: Rs. 149

Order will be cancled in 48 hours!`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "clearence"
   * 2. Fake URL: "tcs-customs-clearence.pk" (misspelled)
   * 3. Customs payment through link is not legitimate
   * 4. 7-day return threat creates urgency
   * 5. Real customs is handled at official channels
   */
  {
    title: "TCS Customs Payment",
    description: "Simulate TCS customs clearance payment requests for delivery phishing.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    messageTemplate: `TCS Express

Your parcel is held at customs!
CN#: TCS-PK-78456123

Pay Rs. 2,500 duty to release:
${LANDING_BASE}/tcs

Returns to sender in 7 days!
Call: 021-111-123-456`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "payement", "attemps"
   * 2. Fake URL: "leopards-courier-cod.net" (.net not official)
   * 3. COD confirmation via website is unusual
   * 4. Return threat after 3 attempts creates pressure
   * 5. Legitimate COD is handled by delivery rider
   */
  {
    title: "Leopards COD Pending",
    description: "Simulate Leopards Courier COD payment pending notices.",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    messageTemplate: `Leopards Courier

COD Payment Pending!
CN#: LEO-2024-567890
Amount: Rs. 3,450

Confirm payement:
${LANDING_BASE}/leopards

Returning after 3 failed attemps!`
  },

  // ==================== TELECOM - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Activaton"
   * 2. Fake URL: "jazz-rewards-offer.pk" (not official jazz.com.pk)
   * 3. Too-good-to-be-true offer (10GB + 5000 mins free)
   * 4. "Activation fee" for free offer - contradiction
   * 5. 12-hour expiry creates false urgency
   */
  {
    title: "Jazz Free Internet",
    description: "Simulate Jazz promotional offers for telecom phishing awareness.",
    image: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Telecom",
    messageTemplate: `🎁 Jazz Offer

Get 10GB FREE + 5000 Minutes!

Activate now:
${LANDING_BASE}/jazz

Enter Jazz number & verify OTP.
Activaton fee: Rs. 50

Expires in 12 hours! ⏰`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "verificaton", "requirment"
   * 2. Fake URL: "telenor-pta-verify.net" (.net not official)
   * 3. PTA doesn't send verification via WhatsApp
   * 4. Requests CNIC + Selfie upload
   * 5. 48-hour SIM block threat creates panic
   */
  {
    title: "Telenor SIM Block Warning",
    description: "Simulate Telenor SIM verification warnings for telecom phishing.",
    image: "https://images.unsplash.com/photo-1556656793-08538906a9f8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Telecom",
    messageTemplate: `⚠️ PTA/Telenor Notice

Your SIM will be BLOCKED in 48 hours!

Biometric verificaton required as per PTA requirment.

Verify online:
${LANDING_BASE}/telenor

Upload CNIC + Selfie
Call 345 for help`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "zong-bundles-offer.pk" (not official zong.com.pk)
   * 2. Too-good-to-be-true offer (50GB for Rs. 100)
   * 3. "Limited time" creates urgency
   * 4. Asks to dial code OR click link - mixing methods
   * 5. Legitimate offers come through official app/USSD
   */
  {
    title: "Zong Data Bundle",
    description: "Simulate Zong promotional data bundle offers.",
    image: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Telecom",
    messageTemplate: `📶 Zong 4G Alert

Exclusive: 50GB for just Rs. 100!

Limited time offer. Subscribe:
${LANDING_BASE}/zong

Dial *567# or click link!

- Zong Pakistan`
  },

  // ==================== EMPLOYMENT - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "registeration"
   * 2. Fake URL: "ptcl-careers-apply.pk" (not official ptcl.com.pk/careers)
   * 3. Requests payment for job - legitimate companies never charge
   * 4. Personal JazzCash number for payment
   * 5. Too-good-to-be-true salary for entry level
   */
  {
    title: "PTCL Job Shortlist",
    description: "Simulate PTCL job interview scams targeting job seekers.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    messageTemplate: `💼 PTCL HR Department

Congratulations! You're shortlisted for Network Engineer position.

Salary: Rs. 85,000-120,000

Pay Rs. 2,500 registeration fee:
JazzCash: 0301-XXXXXXX

Complete form: ${LANDING_BASE}/ptcl`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Vehical"
   * 2. Fake URL: "careem-captain-join.pk" (not official careem.com)
   * 3. Requests registration fee - Careem doesn't charge this
   * 4. Personal mobile wallet number for payment
   * 5. Too-good-to-be-true earnings (Rs. 80,000+)
   */
  {
    title: "Careem Captain Signup",
    description: "Simulate Careem driver registration scams.",
    image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    messageTemplate: `🚗 Careem Pakistan

Earn Rs. 80,000+/month as Captain!

Register now - Limited slots!
${LANDING_BASE}/careem

Fee: Rs. 1,500 (one-time)
JazzCash: 0333-XXXXXXX

Vehical inspection after payment.`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "experiance", "Registeration"
   * 2. Fake URL: "foodpanda-riders-pk.net" (.net not official)
   * 3. Registration fee request - Foodpanda doesn't charge
   * 4. Personal Easypaisa number
   * 5. "No experience needed" targets desperate job seekers
   */
  {
    title: "Foodpanda Rider Job",
    description: "Simulate Foodpanda rider job scams for delivery employment.",
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    messageTemplate: `🍕 Foodpanda Jobs

Become a Rider! Earn Rs. 50,000+/month

No experiance needed!
Bike owners apply:
${LANDING_BASE}/foodpanda

Registeration: Rs. 1,000
Easypaisa: 0345-XXXXXXX`
  },

  // ==================== PRIZE/LOTTERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Proccessing"
   * 2. Fake URL: "jeeto-pakistan-winner.pk" (not official ARY domain)
   * 3. Processing fee for prize - scam indicator
   * 4. Personal JazzCash number
   * 5. 72-hour deadline creates panic
   * 6. User never entered any lottery
   */
  {
    title: "Jeeto Pakistan Prize",
    description: "Simulate Jeeto Pakistan lottery scams.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    messageTemplate: `🎊 JEETO PAKISTAN!

Mubarak! You won Rs. 100,000!
Ticket: JP-2024-78456

Claim within 72 hours:
${LANDING_BASE}/jeeto-pakistan

Proccessing fee: Rs. 2,000
JazzCash: 0300-XXXXXXX`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "national-savings-prizebond.pk" (not official savings.gov.pk)
   * 2. Requests fee to claim prize - National Savings never charges
   * 3. Asks for CNIC copy via message
   * 4. Prize bonds are claimed in person at NS centers
   * 5. Unsolicited winning notification
   */
  {
    title: "Prize Bond Winner",
    description: "Simulate National Savings Prize Bond winning scams.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    messageTemplate: `🏆 Prize Bond Alert

Your bond #456789 won Rs. 750,000!

Claim your prize:
${LANDING_BASE}/prize-bonds

Fee: Rs. 5,000
Send CNIC copy to confirm.

Call: 051-9214284`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Congratulatons"
   * 2. Fake URL: "jazz-winners-claim.pk" (not official jazz.com.pk)
   * 3. Requests CNIC + JazzCash number - identity theft attempt
   * 4. Personal phone number for claims
   * 5. "Limited time" creates urgency
   */
  {
    title: "Jazz Lucky Draw",
    description: "Simulate Jazz lucky draw winning notifications.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    messageTemplate: `🎉 Jazz Lucky Draw

Congratulatons! You won Rs. 50,000!

Send CNIC + JazzCash number to claim:
0345-9876543

Or click:
${LANDING_BASE}/jazz

Limited time only!`
  },

  // ==================== FOOD DELIVERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "foodpanda-vouchers-pk.net" (.net not official)
   * 2. Claims unused voucher user may not have
   * 3. "Tonight" deadline creates urgency
   * 4. Asks for login through external link
   * 5. Bonus voucher claim is credential harvesting attempt
   */
  {
    title: "Foodpanda Free Voucher",
    description: "Simulate Foodpanda voucher scams for food delivery phishing.",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Food Delivery",
    messageTemplate: `🍔 Foodpanda Offer

Rs. 500 voucher expiring TONIGHT!

Claim Rs. 300 BONUS:
${LANDING_BASE}/foodpanda

Login to get FREE food!

Don't miss out - limited offer!`
  },

  // ==================== E-COMMERCE - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "Verificaton", "verifed"
   * 2. Fake URL: "olx-payments-verify.pk" (not official olx.com.pk)
   * 3. OLX doesn't hold payments - it's classifieds only
   * 4. Verification fee request is scam
   * 5. 48-hour refund threat creates panic
   */
  {
    title: "OLX Buyer Payment",
    description: "Simulate OLX payment verification scams targeting sellers.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "E-Commerce",
    messageTemplate: `💰 OLX Pakistan

Buyer paid Rs. 285,000 for your iPhone!

Release funds:
${LANDING_BASE}/olx

Verificaton fee: Rs. 500

Refund to buyer in 48 hours if not verifed!`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "its"
   * 2. Fake URL: "daraz-flash-deals.pk" (not official daraz.pk)
   * 3. Too-good-to-be-true price (iPhone 15 for Rs. 50,000)
   * 4. "3 left" creates scarcity panic
   * 5. Asks for payment via JazzCash directly
   */
  {
    title: "Daraz Flash Sale",
    description: "Simulate Daraz promotional flash sale phishing.",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "E-Commerce",
    messageTemplate: `🛒 Daraz Flash Sale

iPhone 15 at Rs. 50,000 ONLY!
Stock: 3 left!

Buy now before its gone:
${LANDING_BASE}/daraz

Pay via JazzCash for extra 10% off!`
  },

  // ==================== UTILITY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "Reconection"
   * 2. Fake URL: "ke-bills-payment.pk" (not official ke.com.pk)
   * 3. 24-hour disconnection threat creates panic
   * 4. K-Electric doesn't send payment links this way
   * 5. Mentions reconnection charges to increase fear
   */
  {
    title: "K-Electric Disconnection",
    description: "Simulate K-Electric disconnection notices for utility phishing.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Utility",
    messageTemplate: `⚡ K-Electric Notice

DISCONNECTION in 24 hours!

Outstanding: Rs. 15,780

Pay now to avoid:
${LANDING_BASE}/ke

Reconection fee: Rs. 2,500

Call 118 for queries`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "disconected", "immediatly"
   * 2. Fake URL: "ssgc-bills-online.pk" (not official ssgc.com.pk)
   * 3. Disconnection threat creates fear
   * 4. Generic consumer number
   * 5. SSGC bills are paid at official channels, not via WhatsApp links
   */
  {
    title: "SSGC Gas Bill",
    description: "Simulate SSGC gas bill overdue notices.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Utility",
    messageTemplate: `🔥 SSGC Alert

Gas supply will be disconected!

Overdue: Rs. 8,450
Consumer#: 12345678

Pay immediatly:
${LANDING_BASE}/ssgc

Call 1199 for help`
  },

  // ==================== SECURITY ====================

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "email-secure-verify.com" (generic domain)
   * 2. Vague "unknown location" and "unknown device"
   * 3. Claims access at 3:15 AM - creates fear
   * 4. Threatens data theft if ignored
   * 5. Generic security alert without specifying email provider
   */
  {
    title: "Email Compromised",
    description: "Simulate email account compromise alerts for security awareness.",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Security",
    messageTemplate: `🚨 Security Alert

Your email was accessed from unknown device!

Location: Unknown
Time: 3:15 AM

Secure account NOW:
${LANDING_BASE}/gogle

Ignore = Data theft risk!`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "registar", "comprimised"
   * 2. Fake URL: "whatsapp-verify-secure.pk" (not official whatsapp.com)
   * 3. WhatsApp doesn't send security alerts this way
   * 4. Claims someone registering number - creates panic
   * 5. Asks to click link instead of using WhatsApp's built-in security
   */
  {
    title: "WhatsApp Verification",
    description: "Simulate WhatsApp verification code scams.",
    image: "https://images.unsplash.com/photo-1633675254053-d96c7668c3b8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Security",
    messageTemplate: `WhatsApp Security

Someone is trying to registar your number on another device!

If this wasn't you, your account may be comprimised.

Verify identity:
${LANDING_BASE}/whatsapp

Do NOT share your code with anyone!`
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "proccessed"
   * 2. Requests OTP sharing - banks NEVER ask for OTP
   * 3. Personal phone number instead of official bank contact
   * 4. Creates panic with large transaction amount
   * 5. "Bank Fraud Dept" via WhatsApp is not legitimate
   * 6. Asks to reply with OTP - classic OTP scam
   */
  {
    title: "Bank OTP Request",
    description: "Simulate fake bank OTP request messages.",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Security",
    messageTemplate: `🏦 Bank Security

A transaction of Rs. 75,000 is being proccessed from your account.

If not you, cancel immediatly by sharing OTP sent to your number.

Reply with OTP or call: 0300-XXXXXXX

- Bank Fraud Dept`
  }
];

const seedTemplates = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybershield';
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB");

    const forceReseed = process.argv.includes('--force');
    
    if (forceReseed) {
      await WhatsAppTemplate.deleteMany({});
      console.log("🗑️ Cleared existing WhatsApp templates");
    }

    const existingCount = await WhatsAppTemplate.countDocuments();
    if (existingCount > 0 && !forceReseed) {
      console.log(`ℹ️ Found ${existingCount} existing templates. Skipping seed.`);
      console.log("💡 Use --force flag to delete existing and re-seed.");
      process.exit(0);
    }

    const inserted = await WhatsAppTemplate.insertMany(templates);
    console.log(`\n✅ Successfully seeded ${inserted.length} WhatsApp templates:\n`);
    
    const categories = {};
    inserted.forEach((template) => {
      if (!categories[template.category]) {
        categories[template.category] = [];
      }
      categories[template.category].push(template.title);
    });

    Object.keys(categories).sort().forEach(category => {
      console.log(`📁 ${category}:`);
      categories[category].forEach(title => {
        console.log(`   • ${title}`);
      });
    });

    console.log("\n✅ WhatsApp template seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding templates:", error);
    process.exit(1);
  }
};

seedTemplates();
