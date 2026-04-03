from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from bson import ObjectId
import hashlib

from config import settings
from database import get_db

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password with SHA256 normalization (64-char hex < 72-byte bcrypt limit)"""
    # Normalize password with SHA256 to get consistent 64-char hash under bcrypt's 72-byte limit
    normalized = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return pwd_context.hash(normalized)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password using SHA256 normalization"""
    normalized = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return pwd_context.verify(normalized, hashed_password)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    department: str
    roles: list[str] = ["employee"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    roles: list[str]
    full_name: str


def create_token(subject: str, expires_delta: timedelta) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db=Depends(get_db)):
    user = await db.users.find_one({"email": body.email, "is_active": True})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_token(str(user["_id"]), timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh_token = create_token(str(user["_id"]) + ":refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen": datetime.now(timezone.utc)}})

    return TokenResponse(
        access_token=access_token,
        user_id=str(user["_id"]),
        roles=user.get("roles", []),
        full_name=user["full_name"],
    )


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db=Depends(get_db)):
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": body.email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "department": body.department,
        "roles": body.roles,
        "primary_role": body.roles[0] if body.roles else "employee",
        "team_ids": [],
        "project_ids": [],
        "manager_id": None,
        "is_active": True,
        "last_seen": datetime.now(timezone.utc),
        "notification_preferences": {"email": True, "in_app": True, "daily_digest": False},
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    return {"user_id": str(result.inserted_id), "message": "User registered successfully"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}
