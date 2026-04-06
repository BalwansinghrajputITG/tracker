from bson import ObjectId
from fastapi import HTTPException


def parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    """Parse a string to ObjectId, raising a 400 HTTPException on invalid format."""
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} format")
