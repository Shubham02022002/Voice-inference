"""Bounded admission for a single inference slot."""

from dataclasses import dataclass
from math import isfinite
from threading import Condition
from time import monotonic
from typing import Callable


class QueueFull(Exception):
    pass


class QueueTimeout(Exception):
    pass


class RequestCancelled(Exception):
    pass


@dataclass(eq=False)
class WaitingRequest:
    size: int
    queued_at: float


class Scheduler:
    def __init__(self, limit: int = 4, timeout: float = 15, policy: str = "fifo"):
        if limit < 0 or not isfinite(timeout) or timeout <= 0 or policy not in ("fifo", "shortest"):
            raise ValueError("Invalid scheduler configuration.")
        self.limit = limit
        self.timeout = timeout
        self.policy = policy
        self.condition = Condition()
        self.active = False
        self.waiting: list[WaitingRequest] = []

    def next_request(self, now: float) -> WaitingRequest:
        oldest = self.waiting[0]
        if self.policy == "fifo" or now - oldest.queued_at >= 2:
            return oldest
        return min(self.waiting, key=lambda request: request.size)

    def acquire(self, size: int, cancelled: Callable[[], bool]) -> float:
        """Claim the worker and return time spent waiting, in seconds."""
        with self.condition:
            if cancelled():
                raise RequestCancelled()
            if not self.active and not self.waiting:
                self.active = True
                return 0.0
            if len(self.waiting) >= self.limit:
                raise QueueFull()

            request = WaitingRequest(size, monotonic())
            self.waiting.append(request)
            try:
                while True:
                    now = monotonic()
                    if cancelled():
                        raise RequestCancelled()
                    elapsed = now - request.queued_at
                    if elapsed >= self.timeout:
                        raise QueueTimeout()
                    if not self.active and self.next_request(now) is request:
                        self.active = True
                        return elapsed
                    self.condition.wait(min(self.timeout - elapsed, 0.1))
            finally:
                self.waiting.remove(request)
                self.condition.notify_all()

    def release(self) -> None:
        with self.condition:
            self.active = False
            self.condition.notify_all()
