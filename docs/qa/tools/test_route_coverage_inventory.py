import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("inventory", Path(__file__).with_name("route-coverage-inventory.py"))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class RouteInventoryTests(unittest.TestCase):
    def test_groups_are_not_url_segments(self):
        row = inventory.describe("apps/web/app/[locale]/(app)/pets/[id]/page.tsx")
        self.assertEqual(row["routeTemplate"], "/[locale]/pets/[id]")
        self.assertTrue(row["dynamic"])
        self.assertEqual(row["roleHint"], "app")
        self.assertEqual(row["permissions"], "NOT_INSPECTED")

    def test_interception_is_not_an_independent_url(self):
        for marker in ["(.)", "(..)", "(..)(..)", "(...)"]:
            row = inventory.describe(f"apps/web/app/[locale]/@modal/{marker}auth/page.tsx")
            self.assertEqual(row["kind"], "intercepted")
            self.assertIsNone(row["routeTemplate"])
            self.assertEqual(row["parallelSlots"], ["@modal"])

    def test_parallel_catchall_is_not_a_public_route(self):
        row = inventory.describe("apps/web/app/[locale]/@modal/[...rest]/page.tsx")
        self.assertEqual(row["kind"], "parallel-slot")
        self.assertIsNone(row["routeTemplate"])

    def test_optional_catchall_preserved(self):
        row = inventory.describe("apps/web/app/[locale]/(public)/help/[[...slug]]/page.tsx")
        self.assertEqual(row["routeTemplate"], "/[locale]/help/[[...slug]]")

    def test_source_presence_never_becomes_acceptance(self):
        row = inventory.describe("apps/web/app/[locale]/page.tsx")
        self.assertEqual(row["functional"], "NOT_TESTED")
        self.assertEqual(set(row["localization"].values()), {"NOT_TESTED"})
        self.assertEqual(row["evidence"], [])
        self.assertEqual(row["roleHint"], "unspecified")
        self.assertFalse(row["dynamic"])
        self.assertTrue(row["localized"])

    def test_invalid_source_rejected(self):
        for path in ["outside/page.tsx", "apps/web/app/[locale]/layout.tsx", "apps/web/app/api/route.ts"]:
            with self.assertRaises(ValueError):
                inventory.describe(path)

    def test_wrong_sha_rejected_before_reading_sources(self):
        with patch.object(inventory.subprocess, "check_output", return_value="actual\n"):
            with self.assertRaisesRegex(ValueError, "differs"):
                inventory.build(Path("."), "different")

    def test_dirty_app_cannot_be_stamped_as_clean_sha(self):
        with patch.object(inventory.subprocess, "check_output", side_effect=["actual\n", " M apps/web/app/page.tsx\n"]):
            with self.assertRaisesRegex(ValueError, "local changes"):
                inventory.build(Path("."), "actual")


if __name__ == "__main__":
    unittest.main()
