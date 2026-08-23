"""
Phase 1 Milestone 3: in-process metrics for tenant resolution and shadow
reads.

Deliberately dependency-free (no Prometheus/OTel client) — that's Phase 0/20
observability infrastructure and not part of this migration. A later phase
can wire these same counters into a real metrics backend without changing
any call site here; this module is the seam.

Process-local, in-memory state. Good enough for a single-instance/dogfooding
stage; aggregating across multiple instances is a Phase 20 concern, not
solved here.
"""
import logging
import threading

logger = logging.getLogger(__name__)


class TenantMetrics:
    """Counters for tenant resolution and shadow-read verification."""

    def __init__(self):
        # RLock, not Lock: snapshot() holds the lock while reading the
        # resolution_time_avg_seconds property, which also acquires it. A
        # plain Lock self-deadlocks in that case (not reentrant); RLock
        # tracks the owning thread and permits the nested acquire.
        self._lock = threading.RLock()
        self.resolution_count = 0
        self.resolution_time_total_seconds = 0.0
        self.resolution_time_max_seconds = 0.0
        self.self_heal_count = 0
        self.resolution_failure_count = 0
        self.shadow_read_count = 0
        self.shadow_read_mismatch_count = 0

    def record_resolution_time(self, seconds: float) -> None:
        with self._lock:
            self.resolution_count += 1
            self.resolution_time_total_seconds += seconds
            if seconds > self.resolution_time_max_seconds:
                self.resolution_time_max_seconds = seconds
        logger.debug("tenant_resolution_time_seconds=%.6f", seconds)

    def record_self_heal(self) -> None:
        with self._lock:
            self.self_heal_count += 1
        logger.info("tenant_self_heal_count incremented (total=%d)", self.self_heal_count)

    def record_resolution_failure(self) -> None:
        with self._lock:
            self.resolution_failure_count += 1
        logger.warning("tenant_resolution_failure_count incremented (total=%d)", self.resolution_failure_count)

    def record_shadow_read(self, mismatch: bool) -> None:
        with self._lock:
            self.shadow_read_count += 1
            if mismatch:
                self.shadow_read_mismatch_count += 1
        if mismatch:
            logger.warning("shadow_read_mismatch_count incremented (total=%d)", self.shadow_read_mismatch_count)

    @property
    def resolution_time_avg_seconds(self) -> float:
        with self._lock:
            if self.resolution_count == 0:
                return 0.0
            return self.resolution_time_total_seconds / self.resolution_count

    def snapshot(self) -> dict:
        """Point-in-time read of all counters, for tests and ops introspection."""
        with self._lock:
            return {
                "resolution_count": self.resolution_count,
                "resolution_time_avg_seconds": self.resolution_time_avg_seconds,
                "resolution_time_max_seconds": self.resolution_time_max_seconds,
                "self_heal_count": self.self_heal_count,
                "resolution_failure_count": self.resolution_failure_count,
                "shadow_read_count": self.shadow_read_count,
                "shadow_read_mismatch_count": self.shadow_read_mismatch_count,
            }

    def reset(self) -> None:
        """Test-only: reset all counters to zero."""
        with self._lock:
            self.resolution_count = 0
            self.resolution_time_total_seconds = 0.0
            self.resolution_time_max_seconds = 0.0
            self.self_heal_count = 0
            self.resolution_failure_count = 0
            self.shadow_read_count = 0
            self.shadow_read_mismatch_count = 0


# Module-level singleton.
metrics = TenantMetrics()


def record_resolution_time(seconds: float) -> None:
    metrics.record_resolution_time(seconds)


def record_self_heal() -> None:
    metrics.record_self_heal()


def record_resolution_failure() -> None:
    metrics.record_resolution_failure()


def record_shadow_read(mismatch: bool) -> None:
    metrics.record_shadow_read(mismatch)
