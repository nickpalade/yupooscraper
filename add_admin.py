"""
Script to create an admin user.

This script creates a user with admin privileges. Admin users look like
regular users but have access to the scraper functionality.

Usage:
    python add_admin.py
"""

import sys
import os

# Add the parent directory to the path so we can import the backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database
from backend import auth

def main():
    """Create an admin user."""
    username = "admin"
    password = "password123"
    
    print(f"Creating admin user '{username}'...")
    
    # Initialize the database to ensure tables exist
    database.init_db()
    
    # Check if user already exists
    existing_user = database.get_user_by_username(username)
    if existing_user:
        print(f"Error: User '{username}' already exists!")
        print("If you need to reset the password, delete the user first or use a different username.")
        return 1
    
    # Hash the password
    hashed_password = auth.get_password_hash(password)
    
    # Create the admin user (note the is_admin=True flag)
    try:
        user_id = database.create_user(
            username=username,
            hashed_password=hashed_password,
            email=None,
            is_admin=True  # This is what makes them an admin
        )
        print(f"Success! Admin user created with ID: {user_id}")
        print(f"Username: {username}")
        print(f"Password: {password}")
        print("\nThis user has admin privileges and can access the scraper.")
        print("IMPORTANT: Change the password after first login!")
        return 0
    except Exception as e:
        print(f"Error creating admin user: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
