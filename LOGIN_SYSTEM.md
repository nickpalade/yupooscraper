# Admin Login System

This document describes the secure admin login system implemented for the Yupoo Scraper application.

## Overview

The application now has a secure authentication system that protects admin-only features, specifically the scraper functionality. Regular users can browse products without logging in, but only authenticated admin users can access the scraper page and its features.

## Security Features

- **Password Hashing**: Passwords are hashed using bcrypt before storage (never stored in plain text)
- **JWT Tokens**: Secure JSON Web Tokens (JWT) for stateless authentication
- **Bearer Authentication**: Industry-standard bearer token authentication
- **Protected Endpoints**: Scraper endpoints require valid admin authentication
- **Token Expiration**: Access tokens expire after 24 hours for security
- **Secure Headers**: CORS and security headers properly configured

## Setup Instructions

### 1. Install Dependencies

First, install the new security dependencies:

```bash
pip install -r requirements.txt
```

### 2. Create the First Admin Account

Run the provided script to create the initial admin account:

```bash
python add_admin.py
```

This will create an admin user with:
- **Username**: `admin`
- **Password**: `password123`

**IMPORTANT**: Change this password after your first login!

### 3. Start the Application

Start the backend as usual:

```bash
uvicorn backend.main:app --reload
```

## Using the Login System

### For End Users

1. Users can browse and search products without logging in
2. The "Scraper" tab in the navigation is only visible to authenticated admins
3. Click the "Admin" button in the navigation bar to log in
4. After successful login, the button changes to "Logout" and the Scraper tab appears

### For Administrators

1. Click the "Admin" button in the navigation bar
2. Enter your username and password in the login modal
3. Upon successful authentication, you'll have access to:
   - Scraper page
   - Clear database function
   - Color adjustment function
4. Your session persists across page refreshes (token stored in localStorage)
5. Click "Logout" to end your session

## API Endpoints

### Authentication Endpoints

#### POST `/api/auth/login`
Authenticate an admin user and receive a JWT token.

**Request Body**:
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### GET `/api/auth/verify`
Verify that a token is valid.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "username": "admin"
}
```

### Protected Endpoints

The following endpoints now require admin authentication:

- `POST /api/scrape` - Scrape Yupoo stores
- `DELETE /api/database/clear` - Clear the database
- `POST /api/colors/adjust` - Adjust color percentages

To access these endpoints, include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Database Schema

A new `admin_users` table has been added to the database:

```sql
CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Security Best Practices

1. **Change Default Password**: Always change the default password after first login
2. **Keep Token Secret**: Never share your JWT token
3. **Regular Password Updates**: Update passwords regularly
4. **Secure Connection**: Use HTTPS in production
5. **Token Storage**: Tokens are stored in localStorage - clear browser data when using shared computers

## Future Enhancements (Not Implemented Yet)

The system is designed to support future features:
- User accounts with product lists
- Multiple user roles (admin, regular user)
- Password reset functionality
- Account management page for admins

## Troubleshooting

### "Could not validate credentials" error
- Your token may have expired (24 hour limit)
- Try logging out and logging back in

### "Authentication required" error
- You need to log in to access this feature
- Click the "Admin" button to log in

### Can't create admin user - "already exists"
- The admin user already exists in the database
- Use the existing credentials or delete the database file to start fresh

## Technical Details

### Backend Architecture

- **auth.py**: Authentication utilities (password hashing, JWT tokens, dependency injection)
- **database.py**: Admin user CRUD operations
- **main.py**: Protected endpoints with `Depends(auth.get_current_admin)`

### Frontend Architecture

- **LoginModal.tsx**: Login form component
- **App.tsx**: Authentication state management
- **NavigationBar.tsx**: Dynamic navigation based on auth state

### Token Flow

1. User submits credentials → Backend validates → JWT token generated
2. Token stored in localStorage
3. Token included in Authorization header for protected requests
4. Backend verifies token on each protected endpoint
5. Token remains valid for 24 hours
6. Logout removes token from localStorage

## Adding New Admin Users

To add additional admin users, you can:

1. Modify the `add_admin.py` script to create different usernames
2. Create a database management interface (not implemented yet)
3. Directly insert into the database using SQL (not recommended - passwords must be hashed)

Example modified script for different username:

```python
username = "new_admin"  # Change this
password = "secure_password"  # Change this
```

Then run:
```bash
python add_admin.py
```
