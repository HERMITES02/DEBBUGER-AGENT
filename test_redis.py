import os
from redis import Redis
from dotenv import load_dotenv

load_dotenv()

redis_client = Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=True
)

def test_redis():
    try:
        # Test 1 — ping
        pong = redis_client.ping()
        print(f"✅ Ping: {pong}")

        # Test 2 — set and get
        redis_client.set("test_key", "hello from redis")
        value = redis_client.get("test_key")
        print(f"✅ Set/Get: {value}")

        # Test 3 — publish (like your vision agent does)
        result = redis_client.publish("agent_messages", '{"test": "message"}')
        print(f"✅ Publish: sent to {result} subscribers")

        # Test 4 — delete cleanup
        redis_client.delete("test_key")
        print(f"✅ Cleanup done")

        print("\n🎉 Redis is working perfectly!")

    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        print("\nPossible reasons:")
        print("  - Redis server not running")
        print("  - Wrong host/port in .env")
        print("  - Wrong password in .env")

if __name__ == "__main__":
    print(f"Connecting to Redis at {os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}")
    test_redis()