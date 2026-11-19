import unittest

from voiceforge_inference.conditioning import ConditioningCache


class ConditioningCacheTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.loads = []
        self.cache = ConditioningCache[object](byte_limit=8, ttl=10, clock=lambda: self.now)

    def load(self, voice):
        self.loads.append(voice)
        return object(), 4

    def test_lru_is_bounded_by_bytes(self):
        heart = self.cache.get("heart", self.load)
        self.cache.get("bella", self.load)
        self.assertIs(self.cache.get("heart", self.load), heart)
        self.cache.get("sarah", self.load)
        self.assertIs(self.cache.get("heart", self.load), heart)
        self.assertEqual(self.cache.stats()["resident_bytes"], 8)
        self.assertEqual(self.cache.stats()["evictions"], 1)
        self.cache.get("bella", self.load)
        self.assertEqual(self.loads, ["heart", "bella", "sarah", "bella"])

    def test_expiration_reloads_the_pack(self):
        original = self.cache.get("heart", self.load)
        self.now = 9
        self.assertIs(self.cache.get("heart", self.load), original)
        self.now = 10
        self.assertIsNot(self.cache.get("heart", self.load), original)
        self.assertEqual(self.cache.stats()["expirations"], 1)
        self.assertEqual(self.cache.stats()["hits"], 1)
        self.assertEqual(self.cache.stats()["misses"], 2)

    def test_oversize_bypasses_without_evicting_valid_entries(self):
        heart = self.cache.get("heart", self.load)
        for _ in range(2):
            self.cache.get("large", lambda _: (object(), 9))
        self.assertIs(self.cache.get("heart", self.load), heart)
        self.assertEqual(self.cache.stats()["bypasses"], 2)
        self.assertEqual(self.cache.stats()["evictions"], 0)

    def test_failed_load_can_be_retried(self):
        def fail(_):
            raise RuntimeError("Voice unavailable.")

        with self.assertRaisesRegex(RuntimeError, "Voice unavailable"):
            self.cache.get("heart", fail)
        self.assertEqual(self.cache.stats()["entries"], 0)
        self.cache.get("heart", self.load)
        self.assertEqual(self.cache.stats()["misses"], 2)
        self.assertEqual(self.cache.stats()["entries"], 1)


if __name__ == "__main__":
    unittest.main()
