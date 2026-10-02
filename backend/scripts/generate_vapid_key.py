"""Generate the VAPID key that turns on notifications for the client chat.

    python scripts/generate_vapid_key.py

Set the printed VAPID_PRIVATE_KEY on the backend (Render → Environment) and
redeploy. The public key is derived from it at runtime; it's printed only so
you can recognise it. Keep the private key secret, and keep it stable:
replacing it means every device has to turn notifications on again (the chat
re-subscribes devices automatically the next time it's opened).
"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def main() -> None:
    vapid = Vapid()
    vapid.generate_keys()
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    print(f"VAPID_PRIVATE_KEY={_b64(private)}")
    print(f"# public key (derived, nothing to set): {_b64(public)}")


if __name__ == "__main__":
    main()
