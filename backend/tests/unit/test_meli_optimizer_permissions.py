import unittest
from fastapi import HTTPException
from src.api.auth import require_permission
from src import database


class TestMeliOptimizerPermission(unittest.TestCase):
    def test_require_permission_allows_when_inventory_in_list(self):
        dep = require_permission("inventory")
        current_user = {"username": "testuser", "permissions": "dashboard,inventory"}
        # Should not raise
        dep(current_user=current_user)

    def test_require_permission_blocks_when_not_granted(self):
        dep = require_permission("inventory")
        current_user = {"username": "restricted_user", "permissions": "dashboard,sales"}
        with self.assertRaises(HTTPException) as ctx:
            dep(current_user=current_user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("inventory", ctx.exception.detail)

    def test_require_permission_allows_legacy_empty(self):
        dep = require_permission("inventory")
        current_user = {"username": "legacy_user", "permissions": ""}
        # Empty string means legacy safety -> allowed
        dep(current_user=current_user)

    def test_meli_optimizer_alias_allows_inventory(self):
        # Backwards compatibility: checking meli_optimizer allows if user has inventory
        dep = require_permission("meli_optimizer")
        current_user = {"username": "user", "permissions": "dashboard,inventory"}
        dep(current_user=current_user)

    def test_meli_optimizer_alias_allows_settings(self):
        # Backwards compatibility: checking meli_optimizer allows if user has settings
        dep = require_permission("meli_optimizer")
        current_user = {"username": "admin", "permissions": "dashboard,settings"}
        dep(current_user=current_user)


if __name__ == "__main__":
    unittest.main()
