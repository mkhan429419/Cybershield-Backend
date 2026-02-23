const mongoose = require("mongoose");
const EmailTemplate = require("../models/EmailTemplate");
require("dotenv").config();

// Landing base: deployed URL (https://www-website.vercel.app/login/). Links go directly to e.g. .../login/amazon.
const LANDING_BASE = process.env.LANDING_PAGES_BASE_URL || "https://www-website.vercel.app";
const link = (slug, displayUrl) => `<a href="${LANDING_BASE}/login/${slug}">${displayUrl}</a>`;
// Generic link text only (no URL in body) — better deliverability; filters can't match a suspicious domain string.
const linkGeneric = (slug, text) => `<a href="${LANDING_BASE}/login/${slug}">${text}</a>`;
// Neutral footer to add length and reduce spam score; hides the CTA among normal-looking boilerplate.
const footer = (company) => `

This message was sent in connection with your account or subscription. For help, visit our support page or contact customer service.

Privacy  |  Help Center  |  Unsubscribe
© ${company}. All rights reserved.`;

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
      subject: "Microsoft Account: Sign-in activity notification",
      bodyContent: `Dear User,

We regularly monitor sign-in activity on your Microsoft account to help keep it secure. When we notice a sign-in from a new device or an unfamiliar location, we send you a notification so you can confirm whether it was you. This is part of our ongoing effort to protect your data and prevent unauthorized access across Outlook, OneDrive, and other Microsoft services.

Sometimes these sign-ins are from a new phone, a different browser, or while you are traveling. Other times they can indicate that someone else has attempted to access your account. Either way, we want to make sure you are aware of the activity and have a chance to take action if needed. Our security team has seen a rise in account takeover attempts in recent months, and quick action from users has prevented many incidents. We also know that legitimate sign-ins from new devices are very common—for example after a software update, a new laptop, or using a hotel or café network. That’s why we ask you to confirm rather than block access automatically.

Below you will find the exact time, device, and location associated with this sign-in. If any of this looks unfamiliar, we strongly recommend securing your account right away by changing your password and reviewing recent activity. If everything looks correct, no action is required. Thank you for helping us keep your account safe.

We detected sign-in activity on your Microsoft account that we'd like you to confirm.

We noticed a recent sign-in to your Microsoft account. Details below for your reference.
Sign-in details:
Location: Unknown
Device: Windows PC
Time: Today at 3:42 AM

If this wasn't you, please secure your account by following the link below. We recommend you change your password and review recent activity after signing in.

${linkGeneric("mircosoft", "Secure your account")}

We may temporarily restrict access if we don't hear from you within a few days. If you have already taken action, you can disregard this message.

Thank you,
Microsoft Account Team
${footer("Microsoft")}`
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

When someone views your LinkedIn profile, we often send you a quick summary so you don't miss a potential connection or opportunity. Many of our members tell us these notifications help them follow up with recruiters and hiring managers at the right time. We're sharing this update with you for the same reason.

Your profile has been getting more visibility lately, and the viewers below include people from well-known companies. Profile views often lead to connection requests, InMail, or job referrals—especially when members act quickly. We've also found that members who engage with their viewers within a few days see better response rates. If you're open to new opportunities or simply want to grow your network, taking a look at who's interested can be a good next step.

Some of the viewers may be partially hidden unless you have a premium subscription; even so, you can see enough to decide whether to reach out. You can see full details and send connection requests from your notifications. We send these updates regularly so you don't miss potential opportunities.

Good news! Someone from a Fortune 500 company viewed your profile.

3 people viewed your profile:
- HR Manager at Google
- Recruiter at Amazon
- [Hidden - Upgrade to see]

You can see who's interested in your profile and get more details by visiting your notifications. We send these updates so you don't miss potential opportunities.

${linkGeneric("linkdin", "See who viewed your profile")}

Best regards,
LinkedIn Team
${footer("LinkedIn")}`
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
      subject: "Document shared with you via Dropbox",
      bodyContent: `Hello,

When someone shares a file with you on Dropbox, we send you an email so you can open it quickly without digging through your inbox. Shared folders and documents are a common way teams collaborate, and we want to make sure you don't miss anything that's been sent your way.

The document listed below has been shared with you with view and edit access. You can open it from this email or from your Dropbox account. If you have any trouble opening the file, make sure you're signed in and that you have a stable internet connection. Shared links from Dropbox are designed to work on both desktop and mobile.

We use time-limited links for security: after the expiry date, the link will no longer work and the sender would need to share again. If the file is large or you're on a slow connection, it may take a moment to load. You can also add it to your own Dropbox for offline access. If you did not expect this file, you may want to confirm with the sender before opening it.

A colleague has shared a document with you on Dropbox.

Document: Q4_Financial_Report_2024.xlsx
Access: View and Edit
Link valid for 7 days.

You can open the document using the link below. This link will expire in 7 days. If you have trouble opening it, make sure you're signed in to your Dropbox account.

${linkGeneric("dropbx", "View document")}

Thanks,
The Dropbox Team
${footer("Dropbox")}`
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

We take the security of your account seriously and use automated systems to detect unusual login patterns or transactions. When our systems flag something that doesn't match your normal activity, we may temporarily limit certain features until we can confirm that you are in control of your account. This helps protect your money and personal information from fraud.

You are receiving this message because we detected login attempts or activity that we'd like you to verify. Many of these alerts turn out to be from a new device or location—for example a new phone, a different country, or a new browser. We still ask that you confirm so we can restore full access quickly. In cases where the activity was not authorized, users who act quickly can often prevent any loss of funds. Our team is available if you need help or believe this is an error.

If you do not verify within the time frame we've set, we may need to keep the limitation in place for your protection. Verifying your identity is a short process and usually involves confirming a few details we already have on file. Once complete, you can use your account as usual.

We've noticed unusual activity in your PayPal account and have temporarily limited some features.

What happened?
We noticed some unusual login attempts from a new device.

What to do?
Please verify your identity to restore full access by clicking the link below. The process usually takes only a few minutes.

${linkGeneric("paypa1", "Verify my identity")}

If you don't verify within 48 hours, your account may be permanently limited. If you did not request this or believe this is an error, please contact our support team.

If you have questions, visit our Help Center or contact support.

PayPal Security Team
${footer("PayPal")}`
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
      subject: "Netflix: Payment reminder",
      bodyContent: `Hi,

From time to time, a payment on file may be declined because of an expired card, insufficient funds, or a change in billing details. When that happens, we try to process the charge again over the next few days, and we also send you a reminder so you can update your payment method and avoid any interruption to your subscription.

We were unable to charge your payment method for the current billing cycle. Your plan will remain active for a short period, but we need an updated payment method to keep your account in good standing. Declined payments are one of the most common reasons customers lose access temporarily—and it’s easy to fix. You can add a new card or update your existing billing information at any time. If you've already done so, you can disregard this message.

If your account is suspended, you will lose access to all profiles and content until payment is updated. We don’t want that to happen, so we send these reminders before taking any action. If you have questions about the amount due or need to change your plan, our billing support team can help.

We were unable to process your payment for the current billing cycle.

Account: Premium Plan
Amount Due: $15.99
Status: Payment Failed

To avoid interruption to your service, please update your payment information using the link below. You can add a new card or update the billing details for your existing payment method.

${linkGeneric("netflx", "Update payment method")}

If we don't receive payment within 24 hours, your account will be suspended. If you have already updated your payment method, you can ignore this email.

Thanks,

The Netflix Team
${footer("Netflix")}`
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
      subject: "Amazon: Your package is out for delivery",
      bodyContent: `Hello,

When your order ships and is out for delivery, we send you an update so you can track it and know when to expect it. Many of our customers like to follow their package in real time, especially for high-value or time-sensitive orders. You can use the tracking information in this email to see the current status and estimated delivery window.

Your package is on its way and is scheduled to arrive today. Delivery windows can sometimes shift by an hour or two depending on traffic and driver route, so we recommend checking the tracking page for the latest update. If you need to change the delivery address, leave instructions for the driver, or reschedule for another day, you can do that from the same page. We also recommend ensuring someone is available to receive the package or that a safe location is specified if you're not home.

If a delivery attempt fails—for example because no one was available—we will usually try again on the next business day. You can also authorize release at a safe spot or pick up from a nearby locker if that option is available in your area. Having trouble receiving your package? Update your delivery preferences or contact the driver from the tracking page.

Great news! Your Amazon package is out for delivery today.

Order #: 112-4567890-1234567
Estimated delivery: Today by 9 PM

You can track your package and see live updates using the link below. If you need to change the delivery address or time, you can do so from the same page.

${linkGeneric("amazn", "Track your package")}

Having trouble receiving your package? Update your delivery preferences or contact the driver from the tracking page.

Thanks for shopping with Amazon.

Amazon Customer Service
${footer("Amazon")}`
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
      subject: "Google Account: Recent sign-in",
      bodyContent: `Hi,

We send security alerts when we notice a sign-in to your Google Account from a new device or location. This helps you stay in control of your account and catch any unauthorized access early. Millions of users receive these notifications every month, and most of the time the sign-in is legitimate—for example, a new phone or logging in while traveling.

If you don't recognize the sign-in below, it's important to secure your account as soon as possible. You can change your password, review recent activity, and remove access from devices you don't recognize. We’ve seen cases where an attacker gained access to an account and changed the recovery options; acting quickly gives you the best chance to lock them out. If the sign-in was you, no action is needed and you can ignore this email.

Your Google Account is used for Gmail, Drive, Photos, and more—so keeping it secure matters. After you secure your account, we recommend turning on 2-Step Verification if you haven’t already. It adds an extra layer of protection even if someone learns your password.

Your Google Account was just signed in to from a new device.

New sign-in
Device: Windows Computer
Location: Unknown Location
Time: Just now

If this was you, you can ignore this message.

If this wasn't you, someone might have access to your account. We recommend you secure your account right away by following the link below. You can review recent activity and change your password there.

${linkGeneric("gogle", "Secure your account")}

Google Security Team
${footer("Google")}`
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

When an international shipment arrives in the destination country, it sometimes has to clear customs before it can be delivered. Customs authorities may assess duties or taxes depending on the contents and value of the package. As the carrier, we work with customs to get your shipment released as quickly as possible once any required payments or paperwork are complete.

You are receiving this message because your shipment is currently held at customs and a fee is due. The amount is based on the declared value and type of goods; you can see the breakdown on the payment page. Paying the fee allows us to release the package and schedule delivery to your address. If you have questions about the amount or the process, our customer service team can help.

Packages that are not cleared within the allowed time may be returned to the sender, which can mean extra cost and delay if you still want the items. In some cases, the sender may need to be involved in resolving customs issues. We recommend taking action soon so we can get your package to you without further delay.

Your DHL shipment is being held at customs and requires payment before delivery.

Tracking Number: DHL-7845612390
Origin: International
Status: Held at Customs
Customs Fee: $25.00

You can pay the customs fee and release your package using the secure link below. Payment is required before we can complete delivery.

${linkGeneric("dhl", "Pay customs fee and release package")}

Packages not cleared within 5 days will be returned to sender. If you have questions about the fee or your shipment, contact our customer service team.

DHL Express Customer Service
${footer("DHL")}`
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
      subject: "Facebook: Login from new device",
      bodyContent: `Hi,

We monitor your Facebook account for unusual login activity to help keep it secure. When someone tries to sign in from a device or location we haven't seen before, we send you an alert so you can confirm whether it was you. This is one of the ways we help protect your profile, photos, and messages from unauthorized access.

Login attempts from new devices are common—for example when you get a new phone or use a friend's computer. Sometimes they can also mean someone else has your password. Either way, we want you to be aware. If you don't recognize the attempt below, we recommend securing your account right away: change your password, review active sessions, and turn on login alerts so you’re notified of future sign-ins. If it was you, you can ignore this email.

We’ve included the device type and location reported for this attempt. If the location seems wrong—for example you’ve never been to that country—it’s a strong sign you should secure your account. Taking action quickly can prevent someone from posting, messaging, or changing your settings.

We noticed a login attempt to your Facebook account from a device we don't recognize.

Login Attempt Details:
Device: Unknown Device
Location: Moscow, Russia
Time: Today at 4:15 AM

Was this you?

If NOT, secure your account immediately by following the link below. You can change your password and review active sessions there.

${linkGeneric("faceb00k", "Secure my account")}

If this was you, you can ignore this email.

Facebook Security Team
${footer("Facebook")}`
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
    description: "Simulate HBL banking security alerts for verification reminders to test awareness of financial phishing in Pakistan.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "Financial",
    emailTemplate: {
      subject: "HBL: Account activity notice",
      bodyContent: `Dear Valued Customer,

At Habib Bank Limited we use automated systems to monitor account activity and detect anything that may be unusual or unauthorized. When our systems flag activity that doesn't match your normal pattern—such as logins from a new device or location—we may temporarily restrict access until we can confirm your identity. This is done to protect your funds and personal information.

You are receiving this message because we have detected activity on your account that we need you to verify. Many customers receive similar notices when they use online banking from a new phone or while traveling. Verifying your identity is a quick process and helps us restore full access to your account. Our fraud team has seen an increase in attempts to take over accounts using stolen or guessed credentials; prompt verification helps us protect you and other customers.

If you do not take action within the time frame below, we may need to keep the restriction in place for your security. This can affect ATM withdrawals, online transfers, and card payments until the matter is resolved. HBL will never ask for your full PIN or password in an email—only through our official channels. If you have any doubt about this message, please contact our helpline directly.

We have detected unusuall activity on your Habib Bank Limited (HBL) account.

If you do not take action within the time frame below, we may need to keep the restriction in place for your security. This can affect ATM withdrawals, online transfers, and card payments until the matter is resolved. HBL will never ask for your full PIN or password in an email—only through our official channels. If you have any doubt about this message, please contact our helpline directly.

To complete verification, use the link below. This process helps us keep your account safe.

${linkGeneric("hbl", "Verify account")}

${linkGeneric("hbl", "View account activity")}

Security Reminder:
- HBL will NEVER ask for your ATM PIN or full password
- Do not share OTP codes with anyone

For assistance, contact HBL Helpline: 111-111-425

Regards,
HBL Digital Banking Team
Habib Bank Limited
${footer("HBL")}`
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
      subject: "Meezan Bank: Account activity notice",
      bodyContent: `Assalam-o-Alaikum,

Dear Meezan Bank Customer,

Meezan Bank continuously monitors your account for transactions and login activity that may be unusual or unauthorized. When our systems detect something that doesn't match your normal pattern—such as a transaction from an unfamiliar device or location—we send you an alert so you can confirm whether it was you. This helps us protect your savings and maintain the security of your account in line with Islamic banking principles.

You are receiving this message because we have flagged a transaction or sign-in that we would like you to verify. Many such alerts are from legitimate activity, such as using a new phone or making a payment while traveling. If the activity below was not authorized by you, we urge you to secure your account immediately so we can block any further unauthorized transactions and, if needed, assist with dispute resolution. If it was you, you may disregard this email.

We take the security of your account seriously and work around the clock to detect fraud. Quick action from customers has helped us prevent losses in many cases. For 24/7 assistance you can reach us at the number below. JazakAllah for banking with Meezan.

We noticed a suspicious transection attempt on your Meezan Bank account from an unrecognized device.

Transaction Details:
Location: Karachi, Pakistan
Amount: Rs. 45,000
Time: Today at 2:30 AM (PKT)

If this was not you, please secure your account immediatly by using the link below. You can review recent transactions and update your security settings there.

${linkGeneric("meezan-bank", "Secure my account")}

If you authorize this transaction, please ignore this email.

For 24/7 assistance: 0800-00-786

JazakAllah,
Meezan Bank Securty Team
Pakistan's Leading Islamic Bank
${footer("Meezan Bank")}`
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
      subject: "JazzCash: Account verification reminder",
      bodyContent: `Dear JazzCash User,

JazzCash is required by regulation to keep our customers' accounts verified and up to date. From time to time we ask users to confirm their identity or provide updated CNIC details. When verification is incomplete or overdue, we may temporarily suspend an account until the customer completes the required steps. This helps us prevent fraud and keep the platform safe for everyone.

Your account has been flagged for incomplete CNIC verification. To restore full access to your wallet and avoid permanent closure, you need to complete the verification process. This usually involves uploading a clear image of your CNIC (front and back) and confirming your mobile number. Once verified, you can use your balance, send money, and pay bills as usual. If you have already submitted your documents, please allow us some time to process them.

Failure to verify within the given period can result in permanent closure of the account and, in line with our policy, forfeiture of any remaining balance. We send multiple reminders before taking that step. If you need help with the process—for example if you don’t have a smartphone or need assistance with the upload—you can visit a JazzCash agent or dial *786# for support.

Your JazzCash mobile account has been temporarly suspended due to incomplete CNIC verification.

Account: 03XX-XXXXXXX
Status: Pending verification

To complete verification:

1. Click the link below to verify your CNIC
2. Upload clear images of your CNIC (front & back)
3. Verify your mobile number

Use the link below to start verification. The process usually takes a few minutes.

${linkGeneric("jazzcash", "Verify now")}

${linkGeneric("jazzcash", "Complete verification")}

For support dial *786#

Regards,
JazzCash Team
Jazz Pakistan
${footer("JazzCash")}`
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
      subject: "Easypaisa: Reward notification",
      bodyContent: `Hello,

Dear Easypaisa Customer,

Easypaisa runs periodic promotions and lucky draws for our active users. Winners are selected at random from eligible participants, and we notify them by email and SMS so they can claim their reward. If you've been using Easypaisa for transfers, bills, or other services, you may have been automatically entered into one of these draws.

You have been selected as a winner in our Easypaisa Khushiyon Ki Barsaat Lucky Draw. To receive your prize, you need to complete a short claim process. This helps us verify your identity and ensure the reward is paid to the correct account. The process typically includes entering your account details, verifying with OTP, and in some cases a small processing fee as set out in the terms. Please follow the steps below and claim within the given time.

Prizes that are not claimed within the validity period may be forfeited. We send these notifications so you have enough time to complete the steps. If you have any questions about the prize or the claim process, you can reach our rewards team at the number below. Mubarak Ho from the entire Easypaisa team!

You have been selected as a WINNER in our Easypaisa Khushiyon Ki Barsaat Lucky Draw!

Prize Amount: Rs. 25,000

To claim your reward:
1. Click the link below
2. Enter your Easypaisa account number
3. Verify with OTP
4. Receive your reward.

To claim your reward, follow the link below and complete the simple verification steps.

${linkGeneric("easypaisa", "Claim my reward")}

${linkGeneric("easypaisa", "View reward details")}

Claim within the validity period.

Terms & Conditions:
- Winner must be an active Easypaisa user
- CNIC verification required
- Processing fee may apply as per terms

For queries: 0345-1234567

Mubarak Ho!
Easypaisa Rewards Team
Telenor Microfinance Bank
${footer("Easypaisa")}`
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
      subject: "UBL: Card activity notice",
      bodyContent: `Dear Valued UBL Customer,

United Bank Limited monitors card transactions and login activity to protect you from fraud. When we detect something unusual—such as multiple failed PIN attempts or transactions from an unfamiliar location—we may temporarily block your card until we can confirm that you are in control of the account. This is a standard security measure used by banks worldwide.

Your debit card ending in 4521 has been temporarily blocked due to activity that our systems flagged as suspicious. To unblock the card and resume normal use, you need to verify your identity through our secure process. This may include confirming your CNIC and answering a few security questions. If you did not authorize the activity that triggered this block, we strongly recommend completing the verification as soon as possible to prevent further unauthorized use.

Please note: UBL will never ask for your full card number, CVV, or PIN via email or phone. Our verification process uses only the details we already have on file. If anyone asks you for such information, do not share it and contact our helpline immediately. Thank you for banking with UBL.

We regret to infrom you that your UBL Debit Card ending in 4521 has been temporarly blocked due to suspicous activity detected on your account.

Card Details:
Card Number: XXXX-XXXX-XXXX-4521
Status: BLOCKED
Reason: Multiple failed PIN attempts

To unblock your card and restore full access:

Use the link below to unblock your card. You will need to verify your identity to complete the process.

${linkGeneric("ubl", "Unblock my card")}

${linkGeneric("ubl", "View card details")}

If you did not attempt these transactions, you can review and manage your card in your account.

For assistance: 111-825-888

Thank you for banking with UBL.

Regards,
UBL Card Services
United Bank Limited
${footer("UBL")}`
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
      subject: "Daraz: Delivery update for your order",
      bodyContent: `Dear Daraz Customer,

Sometimes a delivery cannot be completed because the address on the order is incomplete, incorrect, or the recipient could not be reached. When that happens, our logistics team gets in touch so you can confirm or update your delivery details. This helps us avoid returning your order to the seller and ensures you receive your package as soon as possible.

Your order could not be delivered on the last attempt due to an address or delivery issue. To prevent cancellation and get your order to you, we need you to confirm your address and, if needed, choose a preferred delivery time. A small re-delivery fee may apply in some cases. Once you confirm, we will schedule another delivery attempt. If you do not take action within the time frame below, the order may be returned and a refund processed according to our policy.

Returned orders can take several days to reach the seller, and refunds may take 7–10 business days depending on your payment method. We’d much rather deliver your item—so please take a moment to confirm your details. You can pay any re-delivery fee via Easypaisa, JazzCash, or card as indicated below.

Your Daraz order (Order ID: DPK-45892176) could not be deliverd due to an incomplete address.

Order Details:
Item: Samsung Galaxy Earbuds
Amount: Rs. 8,999
Status: Delivery Failed

To avoid order cancellation, please confirm your delivery details within 48 hours using the link below. You can update your address and choose a preferred delivery time.

${linkGeneric("daraz", "Confirm my address")}

${linkGeneric("daraz", "Update delivery details")}

Payment Methods Accepted:
- Easypaisa
- JazzCash
- Debit/Credit Card

If no action is taken, your order will be returned to the seller and refund will take 7-10 business days.

Thank you for shopping with Daraz!

Daraz Pakistan Logistics Team
${footer("Daraz")}`
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
      subject: "TCS: Parcel customs update",
      bodyContent: `Dear Customer,

International parcels entering Pakistan are subject to customs clearance. Depending on the contents and value, customs duty may be applicable. TCS works with customs authorities to get your parcel released once any required payments and documents are completed. We send notifications like this so you can take action and avoid delays or return of the shipment.

Your parcel is currently held at our customs clearance center. To release it and schedule delivery to your address, you need to pay the assessed customs duty and, if required, upload the customs declaration form. You can do this through the link below. Payment can be made via bank transfer, JazzCash, Easypaisa, or card. The amount is based on the declared value and category of goods; our team can explain the breakdown if you have questions.

Parcels that are not cleared within the allowed period may be returned to the sender. That can mean extra cost, delay, and the need to re-ship. We recommend completing the process as soon as you can. For assistance with the payment or paperwork, you can contact the number below.

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

Use the link below to pay customs duty and release your parcel. You can also upload the required declaration form there.

${linkGeneric("tcs", "Pay and release parcel")}

Payment Methods:
- Bank Transfer (HBL, UBL, MCB)
- JazzCash / Easypaisa
- Credit/Debit Card

Parcels not cleared within 7 days will be returned to sender.

For assistance: 021-111-123-456

Regards,
TCS Express Pakistan
${footer("TCS")}`
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
      subject: "Leopards: Payment reminder for your delivery",
      bodyContent: `Dear Customer,

With Cash on Delivery orders, the payment is collected when the parcel is delivered. Sometimes a delivery attempt fails because the recipient was not available or payment could not be collected at that time. When that happens, we get in touch so you can confirm your availability and payment method, and we can schedule another attempt.

Your COD parcel is awaiting confirmation of payment and delivery details. Our rider attempted delivery but could not complete it. To reschedule delivery and confirm how you would like to pay, please use the link below. We will process your request and arrange another delivery attempt. You can choose a preferred date or time window if that option is available for your area.

Please note that undelivered parcels may be returned after a limited number of attempts. Once returned, you may need to contact the seller for a refund or re-order. We encourage you to respond soon so we can get your package to you. For any issue with the consignment, you can reach Leopards Courier at the number below.

Your Cash on Delivery (COD) parcel is awaiting payment confimation.

Consignment Details:
CN#: LEO-2024-567890
From: Lahore
To: Your Address
COD Amount: Rs. 3,450

Our rider attempted delivery but payment could not be proccessed.

To reschedule delivery and confirm payment, use the link below. Our team will process your request and schedule a new delivery attempt.

${linkGeneric("leopards", "Confirm payment and reschedule")}

Note: Undelivered parcels will be returned after 3 attemps.

Leopards Courier Services
0800-11786
${footer("Leopards Courier")}`
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
      subject: "Jazz: Offer for you",
      bodyContent: `Dear Jazz Customer,

Jazz runs regular promotions and loyalty offers for our customers. From time to time we send exclusive deals on minutes, data, and value-added services to thank you for being with us. These offers are often limited by time or eligibility, so we notify you as soon as they are available.

You have been selected for a special loyalty reward. To activate it, you need to follow the link below and verify your Jazz number with an OTP. Once activated, the benefits will be added to your account and will be valid for the period stated in the terms. Some offers may have a one-time activation fee as described in the terms and conditions. If you have any questions about the offer or how to use it, our customer service team is available at 111.

Offers like this are available for a limited time and may not be combined with certain other promotions. We recommend activating before the expiry so you don’t miss out. Enjoy seamless connectivity with Jazz—Dunya Ko Batao.

EXCLUSIVE OFFER JUST FOR YOU! 🎉

As a valued Jazz customer, you've been selected for our special loyality reward:

- 5000 FREE On-net Minutes
- 10GB FREE Internet
- Valid for 30 Days

To activate your FREE package, follow the link below. Enter your Jazz number and verify with OTP to claim instantly.

${linkGeneric("jazz", "Activate my offer")}

Offer expires in 12 hours!

Terms & Conditions:
- Available for prepaid customers only
- One-time activation fee of Rs. 50 applys
- Cannot be combined with other offers

For queries: 111

Enjoy seamless connectivity!
Jazz - Dunya Ko Batao
${footer("Jazz")}`
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
      subject: "Telenor: SIM verification reminder",
      bodyContent: `Dear Telenor Customer,

The Pakistan Telecommunication Authority (PTA) requires all mobile operators to maintain verified subscriber records, including biometric verification. From time to time, subscribers may be asked to re-verify their SIMs to comply with these regulations. This helps ensure that mobile services are used responsibly and that each SIM is linked to a verified identity.

Your SIM has been flagged for biometric re-verification. To avoid service interruption or deactivation, you need to complete the verification process within the deadline. You can do this online using the link below by providing your CNIC and a selfie. If you prefer to visit in person, you can go to any Telenor franchise with your original CNIC. The process usually takes only a few minutes and helps protect your number from misuse.

Failure to verify may result in SIM deactivation and loss of your number. Once deactivated, recovering the same number may not be possible. We send multiple reminders before taking that step. For the nearest franchise or help with the process, you can dial 345 or visit our website.

As per PTA (Pakistan Telecommunication Authority) regulations, your SIM requires immidiate biometric re-verification.

SIM Number: 034X-XXXXXXX
Status: VERIFICATION PENDING
You can complete this at any time.

You can complete verification using the link below:
- SIM Deactivation
- Loss of mobile number
- Service interuption

To verify your SIM online, use the link below. You will need to provide the required documents to complete the process.

${linkGeneric("telenor", "Verify my SIM")}

Required Documents:
- CNIC (Original)
- Selfie with CNIC

For nearest franchise: 345

Note: This is a mandatory PTA requirment.

Regards,
Telenor Pakistan
${footer("Telenor")}`
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
      subject: "PTCL: Career opportunity update",
      bodyContent: `Dear Applicant,

Pakistan Telecommunication Company Limited (PTCL) regularly hires for technical and non-technical positions. When your application is shortlisted, our HR team contacts you to schedule an interview and to share any next steps, such as document submission or registration. We aim to keep the process transparent and efficient for all candidates.

Your application for the position of Network Engineer has been shortlisted. To confirm your interview slot and complete the registration process, you need to pay the registration fee and fill out the form via the link below. Please also prepare the required documents listed in this email—CV, CNIC, educational certificates, and experience letters. Slots are limited and fill quickly, so we encourage you to complete the steps within the given time.

After you submit the form and payment proof, our team will confirm your interview date and time. Interviews are held at PTCL Headquarters in Islamabad. If you have any questions about the role, the process, or the documents required, you can reach the HR team at the contact details provided below.

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

2. Complete registeration form using the link below:
   ${linkGeneric("ptcl", "Complete registration form")}

3. Email payment screenshot to: hr@ptcl-jobs.pk

Required Documents:
- Updated CV
- CNIC Copy
- Educational Certificates
- Experience Letters

You can register using the link below when ready.

Best Regards,
HR Recruitement Team
Pakistan Telecommunication Company Limited (PTCL)
${footer("PTCL")}`
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
      subject: "Careem: Captain opportunity",
      bodyContent: `Assalam-o-Alaikum!

Careem offers flexible earning opportunities for drivers and captains across Pakistan. Many people join as a side income or full-time gig, and we provide support for registration, vehicle verification, and getting started on the app. If you have a valid license and a car or bike, you can apply to become a Captain and start accepting rides.

We are currently welcoming new Captains and would like to invite you to register. The process includes a one-time registration fee and submission of your documents—driving license, CNIC, and vehicle details. After you complete the steps, our team will get in touch for vehicle inspection and onboarding. Once approved, you can start earning according to your availability. Payment is made weekly, and we offer various incentives for active Captains.

Earnings depend on hours worked, area, and demand; the figures we mention are illustrative. If you're interested, please use the link below to begin your registration. Payment of the registration fee can be made via JazzCash or Easypaisa to the numbers provided. Our team aims to respond within 24 hours after your submission.

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

Use the link below to complete your registration. After submitting the form, you can proceed with the registration fee payment.

${linkGeneric("careem", "Register now")}

Payment Methods:
- JazzCash: 0333-XXXXXXX
- Easypaisa: 0345-XXXXXXX

After payment, our team will contact you to arrange the next steps.

Start your journey today!
Careem Pakistan
${footer("Careem")}`
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
      subject: "Jeeto Pakistan: Draw result notification",
      bodyContent: `MUBARAK HO! 🎉

Dear Lucky Winner,

Jeeto Pakistan is a popular show on ARY Digital where viewers can participate in lucky draws and win cash prizes. Winners are selected at random and notified by the program team. If you have watched the show or participated through any of the advertised channels, you may have been entered into the draw without realizing it.

You have been selected as a grand prize winner in Jeeto Pakistan Lucky Draw Season 5. To claim your prize, you need to complete the claim process: provide your CNIC and bank account details, and pay the processing fee as described below. The fee helps cover administrative and transfer costs. Payment can be made via JazzCash, Easypaisa, or bank transfer to the numbers and details we provide.

Prizes that are not claimed within the validity period may be forfeited. We recommend completing the steps as soon as possible. If you have any questions about the prize or the process, you can contact the verification number below. Congratulations once again from the entire Jeeto Pakistan team and ARY Digital.

You have been selected as a GRAND PRIZE WINNER in Jeeto Pakistan Lucky Draw Season 5!

Prize: Rs. 100,000 Cash
Ticket Number: JP-2024-78456
Show: Jeeto Pakistan (ARY Digital)

To claim your prize:

1. Click the link below
2. Enter your CNIC number
3. Provide bank account details
4. Pay proccessing fee: Rs. 2,000

To claim your prize, use the link below and follow the steps. You will need to provide your details and complete the verification process.

${linkGeneric("jeeto-pakistan", "Claim my prize")}

Prize must be claimed within 72 hours!

Payment of processing fee via:
- JazzCash: 0300-1234567
- Easypaisa: 0345-9876543
- Bank Transfer

For verification: 0321-XXXXXXX

Congratulations once again!
Jeeto Pakistan Team
ARY Digital
${footer("Jeeto Pakistan")}`
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
      subject: "National Savings: Prize bond update",
      bodyContent: `Dear Prize Bond Holder,

National Savings conducts regular prize bond draws across different denominations. Winning bond numbers are published and bond holders can claim their prizes at designated offices. If you hold a prize bond, it is important to check draw results and claim any winnings within the allowed period, as unclaimed prizes may be forfeited after a number of years as per government rules.

Your prize bond has been selected as a winner in the latest draw. To claim your prize money, you need to submit the required documents—original bond, CNIC copy, and bank account details—and pay the processing fee as described below. The fee and process are set by the Central Directorate. Please ensure you have your original bond and CNIC ready before you start.

Claims are processed at National Savings offices. For assistance or to confirm the claim process and the exact fee, you can contact the number provided in this email. Congratulations on your win.

CONGRATULATIONS! 🎉

Your Prize Bond has won in the National Savings Prize Bond Draw!

Bond Details:
Bond Number: 456789
Denomination: Rs. 40,000
Prize Won: Rs. 750,000 (2nd Prize)
Draw Date: 15th January 2024
Draw Location: Lahore

To claim your prize money, follow the link below and submit the required documents. Our team will verify and process your claim.

${linkGeneric("prize-bonds", "Claim prize")}

Required for Claim:
- Original Prize Bond
- CNIC Copy
- Bank Account Details
- Proccessing Fee: Rs. 5,000

Note: Unclaimed prizes after 6 years will be forfeited as per goverment rules.

For assistance: 051-9214284

Congratulations!
National Savings Pakistan
Central Directorate
${footer("National Savings")}`
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
      subject: "Foodpanda: Voucher reminder",
      bodyContent: `Hey Foodie! 🍔

Foodpanda often sends vouchers and promotional credits to users who have ordered before or who have an account with us. These can be applied at checkout to get a discount on your next order. From time to time we also run campaigns where you can claim an extra bonus voucher by verifying your account or completing a simple step.

You have an unused voucher worth Rs. 500 that is valid for a limited time. In addition, you can claim an extra bonus voucher by following the link below and logging in with your Foodpanda account. After you verify your phone number, the bonus will be added to your wallet and you can use it along with your existing voucher on orders from thousands of restaurants. The minimum order value and validity are stated in the voucher terms.

Vouchers that are not used before the expiry date will no longer be valid. We send these reminders so you have time to order. You can use your voucher on the Foodpanda app or website across a wide range of restaurants—McDonald's, Pizza Hut, KFC, and many more. Don't miss out; claim your bonus before it expires.

You have an UNUSED voucher worth Rs. 500!

Voucher Code: FP500SPECIAL
Valid Until: Tonight 11:59 PM
Min. Order: Rs. 199

But wait... there's MORE!

You can claim an ADDITIONAL Rs. 300 bonus voucher by following the link below. Login with your Foodpanda account and verify your phone to add it to your wallet.

${linkGeneric("foodpanda", "Claim bonus voucher")}

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
Foodpanda Pakistan
${footer("Foodpanda")}`
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
      subject: "OLX: Payment update for your listing",
      bodyContent: `Dear OLX Seller,

When a buyer is interested in your listing, they may contact you to arrange payment and delivery. In some cases, buyers use payment methods that require the seller to confirm their account or complete a verification step before funds are released. We send notifications like this so you can take the required action and receive your payment without delay.

A buyer has made payment for your listing and the funds are currently held pending verification. To release the funds to your account, you need to complete the verification steps described below. This may include confirming your bank account, verifying with an OTP sent to your mobile, and paying a small verification fee. Once verified, the amount will be transferred to you within the stated time.

If you do not complete verification within the given period, the funds may be returned to the buyer. That can mean a cancelled sale and a disappointed buyer. We recommend acting soon. For any issue with the payment or verification process, you can contact our support team at the number below.

Good news! A buyer has made payment for your listing.

Listing Details:
Item: iPhone 14 Pro Max
Sale Price: Rs. 285,000
Buyer: Ahmed K.
Location: Karachi

Payment Status: RECEIVED
Funds Status: HELD (Pending Verificaton)

To release funds to your account, use the link below. You will need to confirm your bank details and complete the verification steps.

${linkGeneric("olx", "Verify and release funds")}

Verification Steps:
1. Confirm your bank account
2. Verify OTP sent to your mobile
3. Pay verificaton fee: Rs. 500
4. Funds are transferred after verification

Funds will be returned to the buyer if verification is not completed.

For support: 021-111-222-333

Happy Selling!
OLX Pakistan
${footer("OLX")}`
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
      subject: "K-Electric: Bill reminder",
      bodyContent: `Bill reminder ⚠️

Dear K-Electric Consumer,

K-Electric sends reminders when a bill is overdue and when a connection is at risk of disconnection. Paying your bill on time helps avoid interruption to your power supply and prevents reconnection charges. We understand that sometimes bills are missed due to travel or oversight, so we send multiple notices before taking action.

Your account has an outstanding balance and your connection is scheduled for disconnection due to non-payment. To avoid disconnection, please pay the outstanding amount as soon as possible using the link below or through any of the payment channels we support—JazzCash, Easypaisa, bank transfer, or card. If your connection is already disconnected, payment of the bill and the reconnection fee will be required before we can restore supply.

Disconnection can affect your home or business without warning once the deadline passes. Reconnection charges apply after disconnection, so paying before the due date saves you money and hassle. For billing inquiries or payment issues, our customer service team is available at 118.

Your electricity connection is schedued for DISCONNECTION due to non-payment.

Account Details:
Reference No: KE-7845612390
Name: Valued Customer
Area: Karachi
Outstanding Amount: Rs. 15,780
Due Date: OVERDUE

To avoid disconnection, pay your outstanding amount using the link below. You can pay via JazzCash, Easypaisa, or card.

${linkGeneric("ke", "Pay my bill")}

Pay immediatly via:
- JazzCash / Easypaisa
- Bank Transfer
- Credit/Debit Card

After payment, electricity will remain connected.

Reconnection charges of Rs. 2,500 will apply after disconnection.

For billing inquiries: 118

Pay now to avoid interuption!

K-Electric
Powering Karachi
${footer("K-Electric")}`
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
      subject: "SSGC: Bill reminder",
      bodyContent: `Dear SSGC Consumer,

Sui Southern Gas Company sends notices when a gas bill is overdue. Paying on time helps avoid disconnection of your gas supply and additional reconnection charges. We send reminders so you have a chance to clear the outstanding amount before any action is taken against your connection.

Your account has an outstanding balance and your gas supply is scheduled for disconnection. To avoid disconnection, please pay the amount due using the link below or through your bank, JazzCash, Easypaisa, or any SSGC-designated channel. If you do not pay within the given period, your supply may be disconnected and a reconnection fee will apply when you pay later.

Gas disconnection can affect cooking, heating, and in some cases water heating. We recommend clearing the balance before the deadline so your supply continues without interruption. For assistance or to confirm your balance and consumer number, please contact our customer service at 1199.

Your gas supply is schedued for disconnection due to outstanding payment.

Consumer Details:
Consumer No: 12345678
Name: Valued Customer
Outstanding Amount: Rs. 8,450
Status: OVERDUE

To avoid disconnection, pay your outstanding amount using the link below. Payment is quick and secure.

${linkGeneric("ssgc", "Pay my bill")}

Pay through:
- Online Banking
- JazzCash/Easypaisa
- Any Bank Branch

You can view your balance and pay online when convenient.

Reconnection fee: Rs. 1,500

For assistance: 1199

SSGC Customer Service
${footer("SSGC")}`
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
      subject: "Account: Sign-in notification",
      bodyContent: `Security Alert ⚠️

Email providers monitor accounts for signs of compromise, such as password changes from unknown locations or unusual login activity. When something like this is detected, we send an alert so you can secure your account quickly. Many users receive such notifications when they forget they changed their password or signed in from a new device, but it is important to confirm.

Your email account has shown activity that suggests it may have been compromised. A password change was detected from an unknown location and device. If you did not make this change, you should secure your account immediately by following the link below. You can reset your password, enable two-factor authentication, and review recent activity. Compromised email accounts are often used to send spam, steal more credentials, or access other services linked to that email—so acting quickly matters.

If you did make the change, you can ignore this message. If not, we also recommend checking your sent folder and recovery options once you regain access, and notifying your contacts if any suspicious emails were sent. For further help, contact your IT department or email provider.

Your email account has been compromised from an unknown location.

Detected Activity:
Location: Unknown
Device: Windows PC
Time: 3:15 AM (PKT)
Action: Password changed

If this wasn't you, secure your account immediatly by following the link below. You can reset your password and review recent activity there.

${linkGeneric("gogle", "Secure my account")}

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
Security Team
${footer("Security")}`
    }
  },

  /*
   * PHISHING INDICATORS (subtle - train users to spot):
   * 1. One typo: "tomorow" (missing 'r') so users can detect
   * 2. Fake URL in link text: "microsoft365-renew-subscription.com" (not official microsoft.com)
   * 3. Generic placeholder: "user@company.com"
   * 4. Slight urgency but not extreme; discount as bait
   * 5. Microsoft renewal is done via account.microsoft.com, not external links
   */
  {
    title: "Microsoft 365 Subscription",
    description: "Simulate Microsoft 365 subscription expiry notices.",
    image: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    category: "IT Support",
    emailTemplate: {
      subject: "Microsoft 365: Subscription renewal reminder",
      bodyContent: `Dear Microsoft 365 User,

Microsoft 365 subscriptions renew automatically when payment is on file, but if a payment fails or a subscription is set to expire without renewal, we send reminders so you can update your payment method or renew manually. This helps avoid losing access to Outlook, Word, Excel, and other apps that you rely on for work or personal use.

Your Microsoft 365 subscription is due to expire soon. To continue using your apps and services without interruption, please renew your subscription using the link below. We are currently offering a discount on the annual plan, which can save you money compared to paying monthly. After expiration you may lose access to email, documents, and Teams until the subscription is renewed.

If you have already renewed or updated your payment details, you can disregard this email. For assistance with renewal or billing, our support team is available at 1-800-MICROSOFT. We look forward to continuing to serve you.

Your Microsoft 365 subscription will expire tomorow.

Subscription Details:
Plan: Microsoft 365 Business
Expiry: Tomorrow
Account: user@company.com

After expiration you may lose access to Outlook, Word, Excel, PowerPoint, and OneDrive. Teams meetings may be disabled.

Renew now to continue uninterrupted access:
${linkGeneric("mircosoft", "Renew my subscription")}

We're offering 20% off the annual plan for a limited time.

For assistance: 1-800-MICROSOFT

Microsoft 365 Team
${footer("Microsoft 365")}`
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
