from django.core.cache.backends.redis import RedisCache
from django.core.cache.backends.locmem import LocMemCache

class FallbackRedisCache(RedisCache):
    def __init__(self, server, params):
        super().__init__(server, params)
        # Create a backup local memory cache instance using the same params
        self._locmem = LocMemCache("fallback_locmem", params)
        self._fallback_active = False

    def _call_with_fallback(self, method_name, *args, **kwargs):
        try:
            # If fallback is active, we don't try Redis to avoid connection timeout delays
            if self._fallback_active:
                fallback_func = getattr(self._locmem, method_name)
                return fallback_func(*args, **kwargs)

            func = getattr(super(), method_name)
            res = func(*args, **kwargs)
            return res
        except Exception as e:
            # Catch Redis connection errors and switch to local memory cache
            from redis.exceptions import RedisError
            if isinstance(e, RedisError) or "connection" in str(e).lower() or "refused" in str(e).lower():
                if not self._fallback_active:
                    print(f"\n[FallbackRedisCache] WARNING: Redis connection failed ({e}). Falling back to LocMemCache.\n")
                    self._fallback_active = True
                fallback_func = getattr(self._locmem, method_name)
                return fallback_func(*args, **kwargs)
            raise e

    def add(self, *args, **kwargs):
        return self._call_with_fallback("add", *args, **kwargs)

    def get(self, *args, **kwargs):
        return self._call_with_fallback("get", *args, **kwargs)

    def set(self, *args, **kwargs):
        return self._call_with_fallback("set", *args, **kwargs)

    def touch(self, *args, **kwargs):
        return self._call_with_fallback("touch", *args, **kwargs)

    def delete(self, *args, **kwargs):
        return self._call_with_fallback("delete", *args, **kwargs)

    def get_many(self, *args, **kwargs):
        return self._call_with_fallback("get_many", *args, **kwargs)

    def set_many(self, *args, **kwargs):
        return self._call_with_fallback("set_many", *args, **kwargs)

    def delete_many(self, *args, **kwargs):
        return self._call_with_fallback("delete_many", *args, **kwargs)

    def clear(self, *args, **kwargs):
        return self._call_with_fallback("clear", *args, **kwargs)

    def has_key(self, *args, **kwargs):
        return self._call_with_fallback("has_key", *args, **kwargs)

    def incr(self, *args, **kwargs):
        return self._call_with_fallback("incr", *args, **kwargs)

    def decr(self, *args, **kwargs):
        return self._call_with_fallback("decr", *args, **kwargs)
