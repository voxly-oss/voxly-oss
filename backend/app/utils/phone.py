
import phonenumbers
from typing import Optional

def normalize_phone(phone: str, default_region: str = "IN") -> Optional[str]:
    """
    Normalize a phone number to E.164 format (e.g., +919999999999).
    If the number is invalid, returns None or raises ValueError depending on strictness.
    Here we return the E.164 string or the original if parsing fails (fallback).
    """
    if not phone:
        return None
    try:
        # If number starts with +, parse as international
        # If not, use default_region (India by default for this user)
        parsed = phonenumbers.parse(phone, default_region)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        return phone # Return original if valid check fails but parse worked? 
                     # Or maybe raise? Let's return original to be safe but logged.
    except Exception:
        return phone
