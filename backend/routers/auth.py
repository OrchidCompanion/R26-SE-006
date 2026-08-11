from enum import Enum
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr

from database import supabase
from utils.auth import hash_password, verify_password, create_access_token, get_current_user


class RoleEnum(str, Enum):
    admin = "admin"
    user = "user"


class StatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"


# Schemas
class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.user
    status: StatusEnum = StatusEnum.active


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserRegister):
    """Endpoint to register a new user or admin."""
    # Check if user already exists
    existing_user = supabase.table("users").select("id").eq("email", user.email).execute()
    if existing_user.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists."
        )

    hashed_pwd = hash_password(user.password)

    response = supabase.table("users").insert({
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "password_hash": hashed_pwd,
        "role": user.role.value,
        "status": user.status.value
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create user.")

    created_user = response.data[0]
    del created_user["password_hash"]
    return created_user


@router.post("/login", response_model=TokenResponse)
def login_user(credentials: UserLogin):
    """Authenticate user and return JWT access token."""
    response = supabase.table("users").select("*").eq("email", credentials.email).execute()
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    user = response.data[0]

    if user["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive. Please contact system admin."
        )

    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = create_access_token(data={
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"]
    })

    user_info = {
        "id": user["id"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"]
    }

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_info
    }


@router.get("/me")
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Fetch profile of currently authenticated user."""
    return current_user