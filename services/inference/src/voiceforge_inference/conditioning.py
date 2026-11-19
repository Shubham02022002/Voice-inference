"""Byte-bounded LRU for reusable voice conditioning packs."""

from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from math import isfinite
from threading import Lock
from time import monotonic
from typing import Generic, TypeVar

Pack = TypeVar("Pack")
DEFAULT_CACHE_BYTES = 4 * 1024 * 1024
DEFAULT_TTL_SECONDS = 600.0


@dataclass
class Entry(Generic[Pack]):
    pack: Pack
    size: int
    expires_at: float


class ConditioningCache(Generic[Pack]):
    """Each model adapter owns a cache scoped to its loaded model and device."""

    def __init__(self, byte_limit: int, ttl: float, *, clock=monotonic):
        if byte_limit < 0 or not isfinite(ttl) or ttl <= 0:
            raise ValueError("Cache byte limit must be nonnegative and TTL must be positive and finite.")
        self.byte_limit = byte_limit
        self.ttl = ttl
        self.clock = clock
        self.lock = Lock()
        self.entries: OrderedDict[str, Entry[Pack]] = OrderedDict()
        self.bytes = 0
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.expirations = 0
        self.bypasses = 0

    def _remove(self, voice: str) -> None:
        self.bytes -= self.entries.pop(voice).size

    def _expire(self, now: float) -> None:
        for voice in [key for key, entry in self.entries.items() if entry.expires_at <= now]:
            self._remove(voice)
            self.expirations += 1

    def get(self, voice: str, load: Callable[[str], tuple[Pack, int]]) -> Pack:
        with self.lock:
            self._expire(self.clock())
            if voice in self.entries:
                self.hits += 1
                self.entries.move_to_end(voice)
                return self.entries[voice].pack
            self.misses += 1

        pack, size = load(voice)
        with self.lock:
            now = self.clock()
            self._expire(now)
            if not 0 < size <= self.byte_limit:
                self.bypasses += 1
                return pack
            if voice in self.entries:
                self._remove(voice)
            while self.bytes + size > self.byte_limit:
                self._remove(next(iter(self.entries)))
                self.evictions += 1
            self.entries[voice] = Entry(pack, size, now + self.ttl)
            self.bytes += size
        return pack

    def stats(self) -> dict[str, int | float]:
        with self.lock:
            self._expire(self.clock())
            return {
                "hits": self.hits,
                "misses": self.misses,
                "evictions": self.evictions,
                "expirations": self.expirations,
                "bypasses": self.bypasses,
                "entries": len(self.entries),
                "resident_bytes": self.bytes,
                "byte_limit": self.byte_limit,
                "ttl_seconds": self.ttl,
            }
