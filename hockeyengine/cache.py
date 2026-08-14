import asyncio
import time
from typing import Any, Callable, Coroutine, Dict, Optional, Tuple

class AsyncTTLCache:
    def __init__(self, default_ttl: int = 60):
        self._default_ttl = default_ttl
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            expires_at, val = self._cache[key]
            if time.time() < expires_at:
                return val
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        duration = ttl if ttl is not None else self._default_ttl
        self._cache[key] = (time.time() + duration, value)

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)

    def clear(self) -> None:
        self._cache.clear()

    def _get_lock(self, key: str) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    async def get_or_set(
        self,
        key: str,
        fetcher: Callable[[], Coroutine[Any, Any, Any]],
        ttl: Optional[int] = None
    ) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached

        key_lock = self._get_lock(key)
        async with key_lock:
            # Double check after acquiring the lock
            cached = self.get(key)
            if cached is not None:
                return cached

            # Fetch fresh value
            result = await fetcher()
            if result is not None:
                self.set(key, result, ttl)
            return result

# Global in-memory cache instance
cache = AsyncTTLCache(default_ttl=60)
