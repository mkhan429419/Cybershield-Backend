# CyberShield Backend

**CyberShield: Cybersecurity Awareness & Incident Reporting Portal - Backend API**

A comprehensive cybersecurity awareness platform backend built with Node.js and Express, designed for educational institutions and the general public in Pakistan.

## 🚀 Features

- **Learning Management System (LMS)** - Courses, quizzes, and certificates
- **Multi-Vector Phishing Simulations** - Email, WhatsApp, and Voice phishing
- **AI-Powered Content Generation** - Using Gemini API for quizzes and phishing content
- **Unified Risk Analysis** - Combining LMS and phishing performance
- **Role-Based Access Control** - System Admin, Client Admin, Affiliated/Non-Affiliated Users
- **Multilingual Support** - English and Urdu via Google Translate API
- **Gamification** - Points, badges, leaderboards
- **Real-time Analytics** - Dashboards and reporting

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT with bcrypt
- **AI Services:** Gemini API, ElevenLabs, Google Translate
- **Communication:** Twilio (WhatsApp), Dialogflow ES (Chatbot)
- **File Storage:** Cloudinary
- **Security:** Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB (v5.0 or higher)
- npm or yarn

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mkhan429419/Cybershield-Backend.git
   cd Cybershield-Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys and configuration
   ```

4. **Start MongoDB**
   ```bash
   # Make sure MongoDB is running on your system
   mongod
   ```

5. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📁 Project Structure

```
src/
├── controllers/     # Route controllers
├── models/         # Database models
├── routes/         # API routes
├── middleware/     # Custom middleware
├── services/       # External API services
├── utils/          # Utility functions
├── app.js          # Express app configuration
└── server.js       # Server entry point

config/
├── database.js     # Database configuration
└── auth.js         # Authentication configuration

tests/
├── unit/           # Unit tests
└── integration/    # Integration tests
```

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure the following:

- **Database:** MongoDB connection string
- **JWT:** Secret keys for authentication
- **AI APIs:** Gemini, ElevenLabs, Google Translate
- **Communication:** Twilio for WhatsApp
- **Storage:** Cloudinary credentials
- **Email:** SMTP configuration

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token

### Course Management
- `GET /api/courses` - Get courses
- `POST /api/courses` - Create course (Admin only)
- `PUT /api/courses/:id` - Update course
- `DELETE /api/courses/:id` - Delete course

### Phishing Simulations
- `POST /api/phishing/campaigns` - Create phishing campaign
- `GET /api/phishing/campaigns` - Get campaigns
- `POST /api/phishing/report` - Report phishing incident

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/progress` - Get learning progress

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 🚀 Deployment

The application is designed to be deployed on:
- **Frontend & Backend:** Vercel
- **Database:** MongoDB Atlas
- **File Storage:** Cloudinary

## 👥 Team

- **Maheen Akhtar Khan** - Backend Development, AI Integration
- **Aimen Munawar** - Frontend Development, Phishing Engine
- **Hadia Ali** - Frontend Development, LMS Features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions, please contact the development team or create an issue in the repository.

---

**Final Year Project - National University of Sciences and Technology (NUST)**  
**Advisor:** Ms. Ayesha Kanwal | **Co-Advisor:** Ms. Sana Qadir
