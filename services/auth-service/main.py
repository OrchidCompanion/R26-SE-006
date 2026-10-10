import os
from enum import Enum
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

from database import (
    get_user_by_email,
    get_user_by_id,
    create_user,
    get_all_users,
    update_user_profile,
    soft_delete_user,
)

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "orchid_super_secret_jwt_key_2026_orchidcompanion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 Hours

security = HTTPBearer()

app = FastAPI(
    title="OrchidCompanion Authentication Service",
    description="Dedicated microservice managing user accounts, authentication, and JWT tokens",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security Helpers
def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception as e:
        print(f"[Auth] Password verification error: {e}")
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        email: str = payload.get("email")
        if user_id is None:
            raise credentials_exception
        return {"user_id": str(user_id), "email": email, "role": role}
    except JWTError:
        raise credentials_exception


# Models
class RoleEnum(str, Enum):
    admin = "admin"
    user = "user"


class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.user


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# Auth Router
router = APIRouter(tags=["Authentication"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserRegister):
    """Public: Register a new user."""
    existing = get_user_by_email(user.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists.",
        )

    hashed_pwd = hash_password(user.password)
    created = create_user(
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        hashed_password=hashed_pwd,
        role=user.role.value,
    )

    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user record in database.",
        )

    return {
        "user_id": str(created["user_id"]),
        "first_name": created["first_name"],
        "last_name": created["last_name"],
        "email": created["email"],
        "role": created["role"],
        "created_at": str(created.get("created_at")),
    }


@router.post("/login", response_model=TokenResponse)
def login_user(credentials: UserLogin):
    """Public: Authenticate user and return JWT token."""
    user = get_user_by_email(credentials.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user_id_str = str(user["user_id"])
    token = create_access_token(
        data={"sub": user_id_str, "email": user["email"], "role": user["role"]}
    )

    user_info = {
        "user_id": user_id_str,
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "email": user["email"],
        "role": user["role"],
    }

    return {"access_token": token, "token_type": "bearer", "user": user_info}


@router.get("/me")
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Protected: Fetch profile of current authenticated user."""
    user = get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user["user_id"] = str(user["user_id"])
    return user


@router.get("/users")
def get_users_list(current_user: dict = Depends(get_current_user)):
    """Admin: Fetch all active users with role 'user'."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    users = get_all_users()
    for u in users:
        u["user_id"] = str(u["user_id"])
    return users


@router.put("/users/{user_id}")
def update_user_by_admin(
    user_id: str, data: dict, current_user: dict = Depends(get_current_user)
):
    """Admin: Update user details."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    updated = update_user_profile(user_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found or update failed.")
    updated["user_id"] = str(updated["user_id"])
    return updated


@router.delete("/users/{user_id}")
def soft_delete_user_by_admin(
    user_id: str, current_user: dict = Depends(get_current_user)
):
    """Admin: Soft delete a user."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    success = soft_delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "User deleted successfully."}


# Mount routes both directly and under prefix
app.include_router(router)
app.include_router(router, prefix="/api/auth")


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
@app.get("/api/auth/health", tags=["Health"])
def health_check():
    return {
        "service": "Orchid Authentication Service",
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
