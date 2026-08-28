#!/usr/bin/env python3
"""
CLI tool to manage Chel Statz admin accounts.
Usage:
    python make_admin.py <username_or_email>           # Grant admin access
    python make_admin.py <username_or_email> --revoke  # Revoke admin access
    python make_admin.py --list                        # List all admins
"""
import sys
from db import set_user_admin, get_all_users_admin

def main():
    if len(sys.argv) < 2:
        print("Chel Statz Admin Manager")
        print("Usage:")
        print("  python make_admin.py <username_or_email>           (grant admin)")
        print("  python make_admin.py <username_or_email> --revoke  (revoke admin)")
        print("  python make_admin.py --list                        (list all users & admin status)")
        sys.exit(1)

    arg = sys.argv[1].strip()

    if arg == "--list":
        users = get_all_users_admin(limit=100)
        print("\nRegistered Users:")
        print("-" * 60)
        print(f"{'ID':<5} {'Username':<20} {'Email':<25} {'Admin?'}")
        print("-" * 60)
        for u in users:
            admin_badge = "YES (Admin)" if u.get("is_admin") else "No"
            print(f"{u['id']:<5} {u['username']:<20} {u['email']:<25} {admin_badge}")
        print("-" * 60)
        return

    is_revoke = "--revoke" in sys.argv
    is_admin = not is_revoke

    user = set_user_admin(arg, is_admin=is_admin)
    if user:
        action = "revoked from" if is_revoke else "granted to"
        print(f"Success! Admin permissions {action} '{user.username}' ({user.email}).")
    else:
        print(f"Error: User with username or email '{arg}' was not found.")
        sys.exit(1)

if __name__ == "__main__":
    main()
