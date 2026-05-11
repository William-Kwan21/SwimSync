# SwimSync

A full-stack swim team management platform built to help swimmers, coaches, and teams stay connected.

## Overview

SwimSync is a web application designed to simplify communication, scheduling, performance tracking, and team management for competitive swimming programs. The platform provides tools for swimmers and coaches to manage workouts, meets, attendance, and team coordination in one place.

## Features

* User authentication and account management
* Coach and swimmer dashboards
* Meet and event management
* Workout and training tracking
* Team communication tools
* Performance analytics and progress tracking
* Responsive design for desktop and mobile
* Database-backed data storage

## Tech Stack

### Frontend

* HTML
* CSS
* JavaScript
* React (if applicable)

### Backend

* Node.js
* Express.js

### Database

* MySQL

### Deployment

* AWS EC2
* Nginx
* PM2

## Project Structure

```bash
SwimSync/
├── client/          # Frontend application
├── server/          # Backend API and server logic
├── routes/          # API routes
├── models/          # Database models
├── middleware/      # Express middleware
├── public/          # Static assets
├── uploads/         # Uploaded files
├── .env             # Environment variables
└── README.md
```

## Installation

### Clone the Repository

```bash
git clone https://github.com/William-Kwan21/SwimSync.git
cd SwimSync
```

### Install Dependencies

```bash
npm install
```

If the project uses separate frontend and backend folders:

```bash
cd client
npm install

cd ../server
npm install
```

## Environment Variables

Create a `.env` file in the root directory and configure the following:

```env
PORT=5000
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=swimsync
JWT_SECRET=your_secret
```

## Running the Project

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

## Deployment

SwimSync is configured for deployment using:

* AWS EC2
* Nginx reverse proxy
* PM2 process manager

### PM2 Example

```bash
pm2 start server.js --name swimsync
pm2 save
pm2 startup
```

## API Endpoints

Example API routes:

```http
GET /api/users
POST /api/auth/login
GET /api/meets
POST /api/workouts
```

## Screenshots

Add screenshots or GIF demos here.

```md
![Dashboard Screenshot](./screenshots/dashboard.png)
```

## Future Improvements

* Real-time notifications
* Mobile app support
* Swim time prediction analytics
* Coach attendance tracking
* AI-powered workout recommendations
* Video analysis integration

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a new branch
3. Commit your changes
4. Push to your branch
5. Open a pull request

## License

This project is licensed under the MIT License.

## Author

William Kwan

GitHub: [https://github.com/William-Kwan21](https://github.com/William-Kwan21)
