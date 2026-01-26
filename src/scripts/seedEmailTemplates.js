const mongoose = require("mongoose");
const EmailTemplate = require("../models/EmailTemplate");
require("dotenv").config();

const templates = [
  // ==================== INTERNATIONAL TEMPLATES ====================

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "microsoft-secure.com" (not official microsoft.com)
   * 2. Generic greeting: "Dear User" instead of actual name
   * 3. Creates urgency: "24 hours" deadline
   * 4. Threatens account closure
   * 5. Requests password via link
   */
  {
    title: "Microsoft Account Alert",
    description: "Simulate Microsoft account security alerts to test awareness of tech company phishing.",
    image: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    emailTemplate: {
      subject: "⚠️ Microsoft Account: Unusual Sign-in Activity Detected",
      bodyContent: `Dear User,

We detected unusual sign-in activity on your Microsoft account.

Sign-in Details:
Location: Unknown
Device: Windows PC
Time: Today at 3:42 AM

If this wasn't you, your account may be compromised. Please secure your account immediately:

https://microsoft-secure.com/verify-account

If you don't verify within 24 hours, your account will be temporarily locked for security purposes.

Thank you for helping us keep your account safe.

Microsoft Account Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "linkedln-security.com" (misspelled "linkedin" as "linkedln")
   * 2. Vague "someone" viewed profile - creates curiosity
   * 3. Generic greeting
   * 4. Login through external link instead of app
   * 5. Creates FOMO (fear of missing out)
   */
  {
    title: "LinkedIn Profile View",
    description: "Simulate LinkedIn notifications about profile views to test professional network phishing awareness.",
    image: "https://images.unsplash.com/photo-1611944212129-29977ae1398c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Social Media",
    emailTemplate: {
      subject: "Someone viewed your LinkedIn profile",
      bodyContent: `Hi there,

Good news! Someone from a Fortune 500 company viewed your profile.

3 people viewed your profile this week:
- HR Manager at Google
- Recruiter at Amazon  
- [Hidden - Upgrade to see]

See who's interested in your profile:
https://linkedln-security.com/profile-views

Don't miss potential opportunities!

Best regards,
LinkedIn Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "dropbox-share.net" (.net instead of dropbox.com)
   * 2. Vague sender "A colleague"
   * 3. Creates curiosity about shared document
   * 4. Login prompt via external link
   * 5. No specific document name mentioned
   */
  {
    title: "Dropbox Shared Document",
    description: "Simulate Dropbox document sharing notifications for cloud storage phishing awareness.",
    image: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Cloud Storage",
    emailTemplate: {
      subject: "📄 Document shared with you via Dropbox",
      bodyContent: `Hello,

A colleague has shared a document with you on Dropbox.

Document: Q4_Financial_Report_2024.xlsx
Shared by: A colleague
Access: View and Edit

Click below to view the document:
https://dropbox-share.net/view-document

This link will expire in 7 days.

Thanks,
The Dropbox Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "paypa1-secure.com" (number "1" instead of letter "l")
   * 2. Creates panic with "unusual activity"
   * 3. Threatens account limitation
   * 4. Requests financial verification
   * 5. Generic greeting without name
   */
  {
    title: "PayPal Security Notice",
    description: "Simulate PayPal security alerts for financial phishing awareness training.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "🔒 PayPal: Your account has been limited",
      bodyContent: `Dear PayPal Customer,

We've noticed unusual activity in your PayPal account and have temporarily limited some features.

What happened?
We noticed some unusual login attempts from a new device.

What to do?
Please verify your identity to restore full access:

https://paypa1-secure.com/restore-account

If you don't verify within 48 hours, your account may be permanently limited.

Thanks for being a PayPal customer.

PayPal Security Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "netflix-billing.com" (not official netflix.com)
   * 2. Payment failure creates urgency
   * 3. Threatens account suspension
   * 4. Requests credit card update
   * 5. 24-hour deadline
   */
  {
    title: "Netflix Payment Failed",
    description: "Simulate Netflix billing issues for subscription service phishing awareness.",
    image: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Entertainment",
    emailTemplate: {
      subject: "Netflix: Payment declined - Update your payment method",
      bodyContent: `Hi,

We were unable to process your payment for the current billing cycle.

Account: Premium Plan
Amount Due: $15.99
Status: Payment Failed

To avoid interruption to your service, please update your payment information:

https://netflix-billing.com/update-payment

If we don't receive payment within 24 hours, your account will be suspended.

Thanks for being part of Netflix.

The Netflix Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "amazn-delivery.com" (misspelled "amazon")
   * 2. Creates curiosity about unordered package
   * 3. Address confirmation via link
   * 4. Generic order number
   * 5. Urgency with delivery date
   */
  {
    title: "Amazon Delivery Notice",
    description: "Simulate Amazon delivery notifications for e-commerce phishing awareness.",
    image: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "E-Commerce",
    emailTemplate: {
      subject: "📦 Amazon: Your package is out for delivery",
      bodyContent: `Hello,

Great news! Your Amazon package is out for delivery today.

Order #: 112-4567890-1234567
Estimated Delivery: Today by 9 PM

Track your package:
https://amazn-delivery.com/track

Having trouble receiving your package? Update your delivery preferences here.

Thanks for shopping with Amazon!

Amazon Customer Service`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "apple-icloud.net" (.net instead of apple.com)
   * 2. Storage full creates urgency
   * 3. Threatens data loss
   * 4. Free storage offer is bait
   * 5. Login through external link
   */
  {
    title: "Apple iCloud Storage",
    description: "Simulate Apple iCloud storage alerts for tech phishing awareness.",
    image: "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Cloud Storage",
    emailTemplate: {
      subject: "⚠️ Your iCloud storage is almost full",
      bodyContent: `Dear Apple Customer,

Your iCloud storage is 95% full. You may not be able to back up your devices or sync your data.

Current Usage: 4.75 GB of 5 GB

To avoid losing your photos, documents, and backups, please upgrade your storage:

https://apple-icloud.net/upgrade-storage

As a valued customer, get 50GB FREE for the first month!

Apple Support`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "google-security-alert.com" (not official google.com)
   * 2. Password change notification creates panic
   * 3. "Wasn't you?" link is the phishing vector
   * 4. Vague location details
   * 5. Creates urgency to act immediately
   */
  {
    title: "Google Security Alert",
    description: "Simulate Google security notifications for account phishing awareness.",
    image: "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    emailTemplate: {
      subject: "🔔 Security alert: New sign-in to your Google Account",
      bodyContent: `Hi,

Your Google Account was just signed in to from a new device.

New sign-in
Device: Windows Computer
Location: Unknown Location
Time: Just now

If this was you, you can ignore this message.

If this wasn't you, someone might have access to your account. Secure your account now:

https://google-security-alert.com/secure

Google Security Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "dhl-tracking.net" (.net instead of dhl.com)
   * 2. Customs fee payment via link
   * 3. Package hold creates urgency
   * 4. Return threat adds pressure
   * 5. Generic tracking number format
   */
  {
    title: "DHL Customs Notice",
    description: "Simulate DHL customs payment requests for delivery phishing awareness.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    emailTemplate: {
      subject: "DHL: Customs clearance required for your shipment",
      bodyContent: `Dear Customer,

Your DHL shipment is being held at customs and requires payment before delivery.

Tracking Number: DHL-7845612390
Origin: International
Status: Held at Customs
Customs Fee: $25.00

Pay customs fee to release your package:
https://dhl-tracking.net/customs-payment

Packages not cleared within 5 days will be returned to sender.

DHL Express Customer Service`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Fake URL: "faceb00k-security.com" (zeros instead of "o")
   * 2. Login attempt notification creates panic
   * 3. "Wasn't you?" is the phishing link
   * 4. Threatens account lock
   * 5. Creates urgency to verify
   */
  {
    title: "Facebook Login Alert",
    description: "Simulate Facebook security alerts for social media phishing awareness.",
    image: "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Social Media",
    emailTemplate: {
      subject: "Someone tried to log into your Facebook account",
      bodyContent: `Hi,

We noticed a login attempt to your Facebook account from a device we don't recognize.

Login Attempt Details:
Device: Unknown Device
Location: Moscow, Russia
Time: Today at 4:15 AM

Was this you?

If NOT, secure your account immediately:
https://faceb00k-security.com/secure-account

If this was you, you can ignore this email.

Facebook Security Team`
    }
  },

  // ==================== BANKING/FINANCIAL - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "unusuall", "permanant", "immediatly"
   * 2. Fake URL: "hbl-securty-pk.com" (misspelled "security", not official hbl.com.pk)
   * 3. URL has "loign" instead of "login"
   * 4. Generic greeting: "Dear Valued Customer" instead of actual name
   * 5. Creates urgency: "24 hours" deadline
   * 6. Threatens account suspension
   */
  {
    title: "HBL Account Verification",
    description: "Simulate HBL banking security alerts requesting urgent verification to test awareness of financial phishing in Pakistan.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "⚠️ URGENT: HBL Account Verification Required Within 24 Hours",
      bodyContent: `Dear Valued Customer,

We have detected unusuall activity on your Habib Bank Limited (HBL) account.

For your security, your account access has been temporarily restricted. To avoid permanant suspension, please verify your account information immediatly.

Verify Account: https://hbl-securty-pk.com/loign

Failure to verify within 24 hours may result in:
- Temporary account freeze
- Restricted online banking access
- ATM transaction limitations

Security Reminder:
- HBL will NEVER ask for your ATM PIN or full password
- Do not share OTP codes with anyone

For assistance, contact HBL Helpline: 111-111-425

Regards,
HBL Digital Banking Team
Habib Bank Limited`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "transection", "immediatly"
   * 2. Fake URL: "meezan-banking-secure.pk" (not official meezanbank.com)
   * 3. URL has "verfiy" instead of "verify"
   * 4. Misspelled "Securty Team"
   * 5. Vague transaction details without account specifics
   * 6. Creates fear with suspicious activity claim
   */
  {
    title: "Meezan Bank Islamic Alert",
    description: "Simulate Meezan Bank security alerts for Islamic banking customers in Pakistan.",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "🏦 Meezan Bank: Suspicious Transaction Detected on Your Account",
      bodyContent: `Assalam-o-Alaikum,

Dear Meezan Bank Customer,

We noticed a suspicious transection attempt on your Meezan Bank account from an unrecognized device.

Transaction Details:
Location: Karachi, Pakistan
Amount: Rs. 45,000
Time: Today at 2:30 AM (PKT)

If this was not you, please secure your account immediatly by clicking below:

https://meezan-banking-secure.pk/verfiy

If you authorize this transaction, please ignore this email.

For 24/7 assistance: 0800-00-786

JazakAllah,
Meezan Bank Securty Team
Pakistan's Leading Islamic Bank`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "temporarly", "permanant", "ballance"
   * 2. Fake URL: "jazz-cash-verfiy.pk" (not official jazzcash.com.pk)
   * 3. Masked phone number doesn't match user's actual number
   * 4. Threatens forfeiture of balance - extreme pressure tactic
   * 5. Requests CNIC upload through unofficial channel
   * 6. 48-hour deadline creates urgency
   */
  {
    title: "JazzCash Account Suspended",
    description: "Simulate JazzCash mobile wallet suspension notices to test awareness of mobile banking phishing.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "📱 JazzCash: Your Account Has Been Temporarily Suspended",
      bodyContent: `Dear JazzCash User,

Your JazzCash mobile account has been temporarly suspended due to incomplete CNIC verification.

Account: 03XX-XXXXXXX
Status: SUSPENDED

To restore your account and avoid permanant deactivation:

1. Click the link below to verify your CNIC
2. Upload clear images of your CNIC (front & back)
3. Verify your mobile number

Verify Now: https://jazz-cash-verfiy.pk/restore

Note: Failure to verify within 48 hours will result in:
- Permanent account closure
- Forfeiture of remaining ballance
- Inability to receive money transfers

For support dial *786#

Regards,
JazzCash Team
Jazz Pakistan`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "Recieve", "Proccessing"
   * 2. Fake URL: "easypaisa-rewards-pk.net" (.net instead of official .com.pk)
   * 3. Requests processing fee for a "prize" - classic scam tactic
   * 4. Uses personal phone number for "queries" instead of official helpline
   * 5. Too-good-to-be-true prize amount
   * 6. 24-hour expiry creates false urgency
   */
  {
    title: "Easypaisa Reward Claim",
    description: "Simulate Easypaisa reward notifications to test response to prize-based phishing in Pakistan.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "🎉 Congratulations! You've Won Rs. 25,000 Easypaisa Reward",
      bodyContent: `CONGRATULATIONS! 🎊

Dear Easypaisa Customer,

You have been selected as a WINNER in our Easypaisa Khushiyon Ki Barsaat Lucky Draw!

Prize Amount: Rs. 25,000

To claim your reward:
1. Click the link below
2. Enter your Easypaisa account number
3. Verify with OTP
4. Recieve instant transfer!

Claim Now: https://easypaisa-rewards-pk.net/claim

This offer expires in 24 hours!

Terms & Conditions:
- Winner must be an active Easypaisa user
- CNIC verification required
- Proccessing fee of Rs. 500 may apply

For queries: 0345-1234567

Mubarak Ho!
Easypaisa Rewards Team
Telenor Microfinance Bank`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "infrom", "temporarly", "suspicous", "immediatly"
   * 2. Fake URL: "ubl-cards-securty.com" (misspelled, .com instead of .pk)
   * 3. Requests CVV and PIN - banks NEVER ask for these
   * 4. Generic greeting without customer name
   * 5. Creates panic with card block notification
   * 6. URL doesn't match official UBL domain
   */
  {
    title: "UBL Card Blocked",
    description: "Simulate UBL card blocking alerts for banking phishing awareness.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "🚫 UBL: Your Debit Card Has Been Blocked - Immediate Action Required",
      bodyContent: `Dear Valued UBL Customer,

We regret to infrom you that your UBL Debit Card ending in 4521 has been temporarly blocked due to suspicous activity detected on your account.

Card Details:
Card Number: XXXX-XXXX-XXXX-4521
Status: BLOCKED
Reason: Multiple failed PIN attempts

To unblock your card and restore full access:

Click Here to Unblock: https://ubl-cards-securty.com/unblock

You will need to verify:
- Your CNIC number
- Card CVV number
- Current PIN

If you did not attempt these transactions, please unblock your card immediatly to prevent unauthorized access.

For assistance: 111-825-888

Thank you for banking with UBL.

Regards,
UBL Card Services
United Bank Limited`
    }
  },

  // ==================== DELIVERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "deliverd", "reschedual", "buisness"
   * 2. Fake URL: "daraz-logistics-support.com" (not official daraz.pk)
   * 3. Requests payment for re-delivery - Daraz doesn't charge this way
   * 4. Order ID format may not match actual Daraz format
   * 5. Uses fear of order cancellation
   * 6. Accepts mobile wallets for "fees" - unusual for legitimate delivery issues
   */
  {
    title: "Daraz Delivery Issue",
    description: "Simulate Daraz delivery notifications requesting address confirmation to assess phishing awareness.",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    emailTemplate: {
      subject: "📦 Daraz: Your Order Could Not Be Delivered - Action Required",
      bodyContent: `Dear Daraz Customer,

Your Daraz order (Order ID: DPK-45892176) could not be deliverd due to an incomplete address.

Order Details:
Item: Samsung Galaxy Earbuds
Amount: Rs. 8,999
Status: Delivery Failed

To avoid order cancellation, please confirm your delivery details within 48 hours:

Confirm Address: https://daraz-logistics-support.com/confirm

A small re-delivery fee of Rs. 149 may be required to reschedual.

Payment Methods Accepted:
- Easypaisa
- JazzCash
- Debit/Credit Card

If no action is taken, your order will be returned to the seller and refund will take 7-10 buisness days.

Thank you for shopping with Daraz!

Daraz Pakistan Logistics Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "Clearence", "Schedual"
   * 2. Fake URL: "tcs-customs-clearence.pk" (misspelled, not official tcs.com.pk)
   * 3. Requests customs payment through link - not how customs works
   * 4. Tracking number format may not be authentic
   * 5. Creates urgency with 7-day return threat
   * 6. Customs duty should be paid at official channels, not via link
   */
  {
    title: "TCS Parcel Held",
    description: "Simulate TCS courier notifications about held parcels requiring customs payment.",
    image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    emailTemplate: {
      subject: "TCS: Your Parcel is Held at Customs - Payment Required",
      bodyContent: `Dear Customer,

Your international parcel is being held at TCS Customs Clearence Center.

Tracking Number: TCS-PK-78456123
Origin: Dubai, UAE
Contents: Electronics
Status: HELD AT CUSTOMS

Customs Duty Required: Rs. 2,500

To release your parcel:
1. Pay customs duty online
2. Upload customs declaration form
3. Schedual delivery

Pay & Release: https://tcs-customs-clearence.pk/pay

Payment Methods:
- Bank Transfer (HBL, UBL, MCB)
- JazzCash / Easypaisa
- Credit/Debit Card

Parcels not cleared within 7 days will be returned to sender.

For assistance: 021-111-123-456

Regards,
TCS Express Pakistan`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "confimation", "proccessed", "attemps"
   * 2. Fake URL: "leopards-courier-cod.net" (.net instead of official domain)
   * 3. COD confirmation via website link is unusual
   * 4. Generic "Dear Customer" greeting
   * 5. Pressure tactic with return threat
   * 6. Official COD issues are handled by rider, not online links
   */
  {
    title: "Leopards COD Collection",
    description: "Simulate Leopards Courier COD collection notices for delivery phishing awareness.",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Delivery",
    emailTemplate: {
      subject: "Leopards: COD Payment Pending - Delivery on Hold",
      bodyContent: `Dear Customer,

Your Cash on Delivery (COD) parcel is awaiting payment confimation.

Consignment Details:
CN#: LEO-2024-567890
From: Lahore
To: Your Address
COD Amount: Rs. 3,450

Our rider attempted delivery but payment could not be proccessed.

To reschedule delivery and confirm payment:
https://leopards-courier-cod.net/pay

Note: Undelivered parcels will be returned after 3 attemps.

Leopards Courier Services
0800-11786`
    }
  },

  // ==================== TELECOM - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "loyality", "applys"
   * 2. Fake URL: "jazz-rewards-offer.pk" (not official jazz.com.pk)
   * 3. Too-good-to-be-true offer (5000 minutes + 10GB free)
   * 4. Requires "activation fee" for free offer - contradiction
   * 5. 12-hour expiry creates false urgency
   * 6. OTP verification through unofficial link is suspicious
   */
  {
    title: "Jazz Free Minutes Offer",
    description: "Simulate Jazz promotional offers to test response to telecom-based phishing.",
    image: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Telecom",
    emailTemplate: {
      subject: "🎁 Jazz: Claim Your 5000 FREE Minutes - Limited Time Offer!",
      bodyContent: `Dear Jazz Customer,

EXCLUSIVE OFFER JUST FOR YOU! 🎉

As a valued Jazz customer, you've been selected for our special loyality reward:

- 5000 FREE On-net Minutes
- 10GB FREE Internet
- Valid for 30 Days

To activate your FREE package:
https://jazz-rewards-offer.pk/activate

Enter your Jazz number and verify with OTP to claim instantly!

Offer expires in 12 hours! ⏰

Terms & Conditions:
- Available for prepaid customers only
- One-time activation fee of Rs. 50 applys
- Cannot be combined with other offers

For queries: 111

Enjoy seamless connectivity!
Jazz - Dunya Ko Batao`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "immidiate", "interuption", "requirment"
   * 2. Fake URL: "telenor-pta-verify.net" (.net, not official telenor.com.pk)
   * 3. PTA doesn't send verification requests via email/SMS
   * 4. Requests CNIC and selfie upload through link
   * 5. Threatens SIM deactivation - fear tactic
   * 6. 48-hour deadline creates panic
   */
  {
    title: "Telenor SIM Verification",
    description: "Simulate Telenor biometric verification notices for telecom phishing awareness.",
    image: "https://images.unsplash.com/photo-1556656793-08538906a9f8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Telecom",
    emailTemplate: {
      subject: "⚠️ URGENT: Telenor SIM Re-verification Required by PTA",
      bodyContent: `Dear Telenor Customer,

As per PTA (Pakistan Telecommunication Authority) regulations, your SIM requires immidiate biometric re-verification.

SIM Number: 034X-XXXXXXX
Status: VERIFICATION PENDING
Deadline: 48 Hours

Failure to verify will result in:
- SIM Deactivation
- Loss of mobile number
- Service interuption

To verify your SIM online:
https://telenor-pta-verify.net/biometric

Required Documents:
- CNIC (Original)
- Selfie with CNIC

For nearest franchise: 345

Note: This is a mandatory PTA requirment.

Regards,
Telenor Pakistan`
    }
  },

  // ==================== EMPLOYMENT - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "registeration", "Recruitement"
   * 2. Fake URL: "ptcl-careers-apply.pk" (not official ptcl.com.pk/careers)
   * 3. Requests payment for job interview - legitimate companies don't charge
   * 4. Personal JazzCash/Easypaisa numbers instead of official payment channels
   * 5. Uses unofficial email domain "ptcl-jobs.pk"
   * 6. "Limited slots" creates false urgency
   */
  {
    title: "PTCL Job Interview",
    description: "Simulate PTCL job interview invitations to test employment-related phishing awareness.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    emailTemplate: {
      subject: "💼 PTCL Interview Invitation - Network Engineer Position",
      bodyContent: `Dear Applicant,

Congratulations! Your application for the position of Network Engineer at PTCL has been shortlisted.

Interview Details:
Location: PTCL Headquarters, Islamabad
Date: To be confirmed after registeration
Position: Network Engineer (Grade 17)
Salary: Rs. 85,000 - 120,000/month

To confirm your interview slot:

1. Pay registration/processing fee: Rs. 2,500
   JazzCash: 0301-9876543
   Easypaisa: 0345-1234567

2. Complete registeration form:
   https://ptcl-careers-apply.pk/register

3. Email payment screenshot to: hr@ptcl-jobs.pk

Required Documents:
- Updated CV
- CNIC Copy
- Educational Certificates
- Experience Letters

Limited slots available - Register within 24 hours!

Best Regards,
HR Recruitement Team
Pakistan Telecommunication Company Limited (PTCL)`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "payements", "insurence", "vehical"
   * 2. Fake URL: "careem-captain-join.pk" (not official careem.com)
   * 3. Requests registration fee - Careem doesn't charge to register
   * 4. Personal mobile wallet numbers for payment
   * 5. Too-good-to-be-true earnings claim (Rs. 80,000+)
   * 6. "Zero commission for first month" - unrealistic offer
   */
  {
    title: "Careem Captain Registration",
    description: "Simulate Careem captain/driver registration scams targeting job seekers.",
    image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Employment",
    emailTemplate: {
      subject: "🚗 Careem: Start Earning Rs. 80,000+/Month as Captain!",
      bodyContent: `Assalam-o-Alaikum!

Want to earn Rs. 80,000+ per month?

Join Careem as a Captain and enjoy:
- Flexible working hours
- Weekly payements
- Fuel discounts
- Health insurence
- Zero commission for first month!

Requirements:
- Valid driving license
- Own car/bike
- Smartphone with internet
- CNIC

Registration Fee: Rs. 1,500 (One-time)

Register Now: https://careem-captain-join.pk/apply

Payment Methods:
- JazzCash: 0333-XXXXXXX
- Easypaisa: 0345-XXXXXXX

After payment, our team will contact you within 24 hours for vehical inspection.

Start your journey today!
Careem Pakistan`
    }
  },

  // ==================== PRIZE/LOTTERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "proccessing"
   * 2. Fake URL: "jeeto-pakistan-winner.pk" (not official ARY domain)
   * 3. Requests processing fee to claim prize - legitimate shows don't charge
   * 4. Personal mobile numbers for payment
   * 5. Unsolicited prize notification - user didn't enter any draw
   * 6. 72-hour deadline creates panic
   * 7. Requests bank account details
   */
  {
    title: "Jeeto Pakistan Winner",
    description: "Simulate Jeeto Pakistan lottery scams to test awareness of prize-based phishing.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    emailTemplate: {
      subject: "🎊 JEETO PAKISTAN: You've Won Rs. 100,000! Claim Now",
      bodyContent: `MUBARAK HO! 🎉

Dear Lucky Winner,

You have been selected as a GRAND PRIZE WINNER in Jeeto Pakistan Lucky Draw Season 5!

Prize: Rs. 100,000 Cash
Ticket Number: JP-2024-78456
Show: Jeeto Pakistan (ARY Digital)

To claim your prize:

1. Click the link below
2. Enter your CNIC number
3. Provide bank account details
4. Pay proccessing fee: Rs. 2,000

Claim Prize: https://jeeto-pakistan-winner.pk/claim

Prize must be claimed within 72 hours!

Payment of processing fee via:
- JazzCash: 0300-1234567
- Easypaisa: 0345-9876543
- Bank Transfer

For verification: 0321-XXXXXXX

Congratulations once again!
Jeeto Pakistan Team
ARY Digital`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "Proccessing", "goverment"
   * 2. Fake URL: "national-savings-prizebond.pk" (not official savings.gov.pk)
   * 3. Requests processing fee - National Savings doesn't charge fees
   * 4. Asks for bank account details via link
   * 5. Unsolicited winning notification
   * 6. Prize bonds are claimed at National Savings centers, not online
   */
  {
    title: "Prize Bond Result",
    description: "Simulate National Savings Prize Bond winning notifications.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Prize",
    emailTemplate: {
      subject: "🏆 National Savings: Your Prize Bond Has Won Rs. 750,000!",
      bodyContent: `Dear Prize Bond Holder,

CONGRATULATIONS! 🎉

Your Prize Bond has won in the National Savings Prize Bond Draw!

Bond Details:
Bond Number: 456789
Denomination: Rs. 40,000
Prize Won: Rs. 750,000 (2nd Prize)
Draw Date: 15th January 2024
Draw Location: Lahore

To claim your prize money:
https://national-savings-prizebond.pk/claim

Required for Claim:
- Original Prize Bond
- CNIC Copy
- Bank Account Details
- Proccessing Fee: Rs. 5,000

Note: Unclaimed prizes after 6 years will be forfeited as per goverment rules.

For assistance: 051-9214284

Congratulations!
National Savings Pakistan
Central Directorate`
    }
  },

  // ==================== FOOD DELIVERY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled word: "resturants"
   * 2. Fake URL: "foodpanda-vouchers-pk.net" (.net, not official foodpanda.pk)
   * 3. Claims unused voucher that user may not have
   * 4. Asks for phone verification through external link
   * 5. "Tonight" deadline creates false urgency
   * 6. Bonus voucher claim is bait to get login credentials
   */
  {
    title: "Foodpanda Voucher",
    description: "Simulate Foodpanda promotional voucher scams for food delivery phishing awareness.",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Food Delivery",
    emailTemplate: {
      subject: "🍕 Foodpanda: Your Rs. 500 Voucher is Expiring Tonight!",
      bodyContent: `Hey Foodie! 🍔

You have an UNUSED voucher worth Rs. 500!

Voucher Code: FP500SPECIAL
Valid Until: Tonight 11:59 PM
Min. Order: Rs. 199

But wait... there's MORE!

Claim an ADDITIONAL Rs. 300 bonus voucher:
https://foodpanda-vouchers-pk.net/claim

How to claim:
1. Click the link above
2. Login with your Foodpanda account
3. Verify your phone number
4. Voucher auto-applied to wallet!

Don't miss out on FREE food!

Order from 50,000+ resturants:
- McDonald's
- Pizza Hut
- KFC
- And many more!

Craving something? Order NOW!

Bon Appétit!
Foodpanda Pakistan`
    }
  },

  // ==================== E-COMMERCE - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "Verificaton", "verifed"
   * 2. Fake URL: "olx-payments-verify.pk" (not official olx.com.pk)
   * 3. OLX doesn't hold payments - it's a classifieds site, not escrow
   * 4. Requests verification fee - OLX doesn't charge sellers this way
   * 5. Pressure tactic: funds returned to buyer in 48 hours
   * 6. Targets sellers who may have active listings
   */
  {
    title: "OLX Payment Verification",
    description: "Simulate OLX payment verification scams targeting online sellers.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "E-Commerce",
    emailTemplate: {
      subject: "💰 OLX: Buyer Payment Received - Verify to Release Funds",
      bodyContent: `Dear OLX Seller,

Good news! A buyer has made payment for your listing.

Listing Details:
Item: iPhone 14 Pro Max
Sale Price: Rs. 285,000
Buyer: Ahmed K.
Location: Karachi

Payment Status: RECEIVED
Funds Status: HELD (Pending Verificaton)

To release funds to your account:
https://olx-payments-verify.pk/release

Verification Steps:
1. Confirm your bank account
2. Verify OTP sent to your mobile
3. Pay verificaton fee: Rs. 500
4. Funds transferred within 24 hours

Funds will be returned to buyer if not verified within 48 hours.

For support: 021-111-222-333

Happy Selling!
OLX Pakistan`
    }
  },

  // ==================== UTILITY - PAKISTANI ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "schedued", "immediatly", "interuption"
   * 2. Fake URL: "ke-bills-payment.pk" (not official ke.com.pk)
   * 3. Threatens disconnection in 24 hours - extreme pressure
   * 4. K-Electric doesn't send payment links via email this way
   * 5. Generic "Valued Customer" instead of actual account holder name
   * 6. Mentions reconnection charges to increase fear
   */
  {
    title: "K-Electric Bill Overdue",
    description: "Simulate K-Electric overdue bill notices for utility phishing awareness.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Utility",
    emailTemplate: {
      subject: "⚡ K-Electric: Final Notice - Disconnection in 24 Hours",
      bodyContent: `URGENT: DISCONNECTION NOTICE ⚠️

Dear K-Electric Consumer,

Your electricity connection is schedued for DISCONNECTION due to non-payment.

Account Details:
Reference No: KE-7845612390
Name: Valued Customer
Area: Karachi
Outstanding Amount: Rs. 15,780
Due Date: OVERDUE

To avoid disconnection:
https://ke-bills-payment.pk/pay-now

Pay immediatly via:
- JazzCash / Easypaisa
- Bank Transfer
- Credit/Debit Card

After payment, electricity will remain connected.

Reconnection charges of Rs. 2,500 will apply after disconnection.

For billing inquiries: 118

Pay now to avoid interuption!

K-Electric
Powering Karachi`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "schedued", "recieved"
   * 2. Fake URL: "ssgc-bills-online.pk" (not official ssgc.com.pk)
   * 3. Threatens disconnection - fear tactic
   * 4. Generic greeting without actual consumer name
   * 5. SSGC bills are paid at official channels, not through emailed links
   * 6. 48-hour deadline creates panic
   */
  {
    title: "Sui Gas Bill Warning",
    description: "Simulate SSGC/SNGPL gas bill overdue notices.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Utility",
    emailTemplate: {
      subject: "🔥 SSGC: Gas Supply Disconnection Warning - Pay Immediately",
      bodyContent: `Dear SSGC Consumer,

Your gas supply is schedued for disconnection due to outstanding payment.

Consumer Details:
Consumer No: 12345678
Name: Valued Customer
Outstanding Amount: Rs. 8,450
Status: OVERDUE

To avoid disconnection:
https://ssgc-bills-online.pk/pay

Pay through:
- Online Banking
- JazzCash/Easypaisa
- Any Bank Branch

Gas supply will be disconnected if payment is not recieved within 48 hours.

Reconnection fee: Rs. 1,500

For assistance: 1199

SSGC Customer Service`
    }
  },

  // ==================== SECURITY/IT ====================

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "immediatly", "authentification"
   * 2. Fake URL: "email-secure-verify.com" (generic domain, not company-specific)
   * 3. Vague "unknown location" without specifics
   * 4. Claims password was changed - creates panic
   * 5. Generic security alert without identifying which email service
   * 6. Threatens data theft if ignored
   */
  {
    title: "Email Account Compromised",
    description: "Simulate email account compromise notifications for security awareness.",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Security",
    emailTemplate: {
      subject: "🚨 URGENT: Your Email Account Has Been Compromised",
      bodyContent: `Security Alert ⚠️

Your email account has been compromised from an unknown location.

Detected Activity:
Location: Unknown
Device: Windows PC
Time: 3:15 AM (PKT)
Action: Password changed

If this wasn't you, secure your account immediatly:
https://email-secure-verify.com/protect

Steps to protect your account:
1. Reset your password
2. Enable 2-factor authentification
3. Review recent activity
4. Update recovery options

Ignoring this alert may result in:
- Data theft
- Identity fraud
- Unauthorized access

For support contact your IT department.

Stay Safe Online!
Security Team`
    }
  },

  /*
   * PHISHING INDICATORS:
   * 1. Misspelled words: "tommorow", "uninterupted", "dissabled"
   * 2. Fake URL: "microsoft365-renew-subscription.com" (not official microsoft.com)
   * 3. Creates urgency with "expires tomorrow"
   * 4. Threatens loss of access to all Microsoft services
   * 5. Offers discount to make link more tempting
   * 6. Microsoft renewal happens through official Microsoft account
   */
  {
    title: "Microsoft 365 Subscription",
    description: "Simulate Microsoft 365 subscription expiry notices.",
    image: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    emailTemplate: {
      subject: "⏰ Microsoft 365: Your Subscription Expires Tomorrow",
      bodyContent: `Dear Microsoft 365 User,

Your Microsoft 365 subscription is expiring tommorow!

Subscription Details:
Plan: Microsoft 365 Business
Expiry: Tomorrow
Account: user@company.com

After expiration:
- No access to Outlook
- No access to Word, Excel, PowerPoint
- OneDrive files become read-only
- Teams meetings dissabled

Renew now to continue uninterupted access:
https://microsoft365-renew-subscription.com/pay

Special Offer: 20% discount on annual plan! 🎉

For assistance: 1-800-MICROSOFT

Don't lose your files and productivity!

Microsoft 365 Team`
    }
  }
];

const seedTemplates = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybershield';
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB");

    const forceReseed = process.argv.includes('--force');
    
    if (forceReseed) {
      await EmailTemplate.deleteMany({});
      console.log("🗑️ Cleared existing email templates");
    }

    const existingCount = await EmailTemplate.countDocuments();
    if (existingCount > 0 && !forceReseed) {
      console.log(`ℹ️ Found ${existingCount} existing templates. Skipping seed.`);
      console.log("💡 Use --force flag to delete existing and re-seed.");
      process.exit(0);
    }

    const inserted = await EmailTemplate.insertMany(templates);
    console.log(`\n✅ Successfully seeded ${inserted.length} email templates:\n`);
    
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

    console.log("\n✅ Email template seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding templates:", error);
    process.exit(1);
  }
};

seedTemplates();
