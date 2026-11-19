import threading
import time
import unittest

from voiceforge_inference.scheduler import (
    QueueFull, QueueTimeout, RequestCancelled, Scheduler, WaitingRequest,
)


class SchedulerTests(unittest.TestCase):
    def wait_for_depth(self, scheduler, depth):
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            with scheduler.condition:
                if len(scheduler.waiting) == depth:
                    return
            time.sleep(0.005)
        self.fail(f"Queue never reached depth {depth}")

    def test_fifo_admission_and_overflow(self):
        scheduler = Scheduler(limit=2)
        self.assertEqual(scheduler.acquire(10, lambda: False), 0)
        completed = []

        def submit(size):
            scheduler.acquire(size, lambda: False)
            completed.append(size)
            scheduler.release()

        first = threading.Thread(target=submit, args=(100,), daemon=True)
        second = threading.Thread(target=submit, args=(10,), daemon=True)
        first.start()
        self.wait_for_depth(scheduler, 1)
        second.start()
        self.wait_for_depth(scheduler, 2)
        with self.assertRaises(QueueFull):
            scheduler.acquire(1, lambda: False)
        scheduler.release()
        first.join(1)
        second.join(1)
        self.assertEqual(completed, [100, 10])

    def test_zero_waiting_slots_reproduce_busy_rejection(self):
        scheduler = Scheduler(limit=0)
        scheduler.acquire(10, lambda: False)
        with self.assertRaises(QueueFull):
            scheduler.acquire(1, lambda: False)
        scheduler.release()
        self.assertEqual(scheduler.acquire(1, lambda: False), 0)

    def test_wait_timeout_releases_queue_capacity(self):
        scheduler = Scheduler(limit=1, timeout=0.025)
        scheduler.acquire(10, lambda: False)
        with self.assertRaises(QueueTimeout):
            scheduler.acquire(1, lambda: False)
        self.assertFalse(scheduler.waiting)
        self.assertTrue(scheduler.active)
        scheduler.release()

    def test_queued_disconnect_removes_only_the_pending_request(self):
        scheduler = Scheduler(limit=1)
        scheduler.acquire(10, lambda: False)
        disconnected = threading.Event()
        removed = threading.Event()

        def submit():
            try:
                scheduler.acquire(1, disconnected.is_set)
            except RequestCancelled:
                removed.set()

        thread = threading.Thread(target=submit, daemon=True)
        thread.start()
        self.wait_for_depth(scheduler, 1)
        disconnected.set()
        self.assertTrue(removed.wait(1))
        self.assertFalse(scheduler.waiting)
        self.assertTrue(scheduler.active)
        scheduler.release()

    def test_shortest_prefers_shorter_requests_until_oldest_ages(self):
        scheduler = Scheduler(policy="shortest")
        older = WaitingRequest(200, 0)
        newer = WaitingRequest(20, 1)
        scheduler.waiting.extend([older, newer])
        self.assertIs(scheduler.next_request(1.5), newer)
        self.assertIs(scheduler.next_request(2.0), older)


if __name__ == "__main__":
    unittest.main()
