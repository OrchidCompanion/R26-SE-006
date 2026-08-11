from enum import Enum
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr

from database import supabase
from utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

class RoleEnum(str, Enum):
    admin = "admin"
    user = "user"

# Schemas
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

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserRegister):
    """Public: Register a new user."""
    existing_user = (
        supabase.table("users")
        .select("user_id")
        .eq("email", user.email)
        .is_("deleted_at", "null")
        .execute()
    )
    if existing_user.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists.",
        )

    hashed_pwd = hash_password(user.password)

    response = (
        supabase.table("users")
        .insert(
            {
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "password": hashed_pwd,
                "role": user.role.value,
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create user.")

    created_user = response.data[0]
    del created_user["password"]
    return created_user


@router.post("/login", response_model=TokenResponse)
def login_user(credentials: UserLogin):
    """Public: Authenticate user and return JWT token."""
    response = (
        supabase.table("users")
        .select("*")
        .eq("email", credentials.email)
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user = response.data[0]

    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token(
        data={"sub": str(user["user_id"]), "email": user["email"], "role": user["role"]}
    )

    user_info = {
        "user_id": user["user_id"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "email": user["email"],
        "role": user["role"],
    }

    return {"access_token": token, "token_type": "bearer", "user": user_info}


@router.get("/me")
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Protected: Fetch profile of current user."""
    response = (
        supabase.table("users")
        .select("user_id, first_name, last_name, email, role, created_at")
        .eq("user_id", current_user["user_id"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found.")
    return response.data[0]
