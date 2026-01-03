"""
Authentication and authorization utilities for the Yupoo scraper application.

This module provides secure password hashing, JWT token generation and validation,
and user authentication functions. It uses industry-standard security practices
including bcrypt for password hashing and JWT for token-based authentication.
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import secrets

# Security configuration
SECRET_KEY = secrets.token_urlsafe(32)  # Generate a secure random secret key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Bearer token security scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password.
    
    Args:
        plain_password: The plain text password to verify
        hashed_password: The hashed password to compare against
        
    Returns:
        True if the password is correct, False otherwise
    """
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """Hash a password for secure storage.
    
    Args:
        password: The plain text password to hash
        
    Returns:
        The hashed password as a string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token.
    
    Args:
        data: The data to encode in the token (typically contains username/user_id)
        expires_delta: Optional custom expiration time
        
    Returns:
        The encoded JWT token
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token.
    
    Args:
        token: The JWT token to verify
        
    Returns:
        The decoded token payload if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Dependency to get the current authenticated user.
    
    This function is used as a FastAPI dependency to protect endpoints
    that require authentication. It verifies the JWT token and checks
    that the user exists.
    
    Args:
        credentials: The HTTP bearer token credentials
        
    Returns:
        A dict containing the authenticated user's data
        
    Raises:
        HTTPException: If the token is invalid or the user doesn't exist
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    payload = verify_token(token)
    
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    # Verify the user exists in the database
    from . import database
    user = database.get_user_by_username(username)
    if user is None:
        raise credentials_exception
    
    user_id, username, email, hashed_password, is_admin = user
    return {
        "user_id": user_id,
        "username": username,
        "email": email,
        "is_admin": bool(is_admin)
    }


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency to get the current authenticated admin user.
    
    This function is used as a FastAPI dependency to protect endpoints
    that require admin authentication.
    
    Args:
        current_user: The authenticated user (injected by dependency)
        
    Returns:
        A dict containing the authenticated admin user's data
        
    Raises:
        HTTPException: If the user is not an admin
    """
    if not current_user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return current_user


# Optional authentication - returns None if not authenticated
async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))) -> Optional[dict]:
    """Optional dependency to get the current authenticated user.
    
    Returns None if no valid token is provided instead of raising an exception.
    Useful for endpoints that work differently for authenticated vs unauthenticated users.
    
    Args:
        credentials: The HTTP bearer token credentials (optional)
        
    Returns:
        A dict containing the authenticated user's data, or None if not authenticated
    """
    if credentials is None:
        return None
    
    try:
        token = credentials.credentials
        payload = verify_token(token)
        
        if payload is None:
            return None
        
        username: str = payload.get("sub")
        if username is None:
            return None
        
        from . import database
        user = database.get_user_by_username(username)
        if user is None:
            return None
        
        user_id, username, email, hashed_password, is_admin = user
        return {
            "user_id": user_id,
            "username": username,
            "email": email,
            "is_admin": bool(is_admin)
        }
    except Exception:
        return None
