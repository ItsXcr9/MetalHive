
import asyncio
import json
import os
from datetime import datetime
import clickhouse_connect
import redis.asyncio as redis

# Configuration
CH_HOST = os.getenv("METALMIND_CLICKHOUSE_URL", "http://clickhouse:8123")
REDIS_URL = os.getenv("METALMIND_REDIS_URL", "redis://dragonfly:6379")

# Parse CH URL to host/port/db
# Assumes http://host:port format
ch_host_clean = CH_HOST.replace("http://", "").split(":")[0]
ch_port = int(CH_HOST.replace("http://", "").split(":")[1])

print(f"Connecting to ClickHouse at {ch_host_clean}:{ch_port}...")
client = clickhouse_connect.get_client(host=ch_host_clean, port=ch_port, database="metalhive")

print(f"Connecting to Redis at {REDIS_URL}...")
r = redis.from_url(REDIS_URL)

async def restore():
    print("Fetching config history from ClickHouse...")
    # Get latest value and is_secret for each namespace+key
    query = """
    SELECT 
        namespace, 
        key, 
        argMax(value, timestamp) as value,
        argMax(is_secret, timestamp) as is_secret
    FROM config_history 
    GROUP BY namespace, key
    """
    
    result = client.query(query)
    rows = result.result_rows
    print(f"Found {len(rows)} config entries to restore.")
    
    restored_count = 0
    for namespace, key, value, is_secret in rows:
        # Construct path
        if namespace == "/":
            path = f"/{key}"
        elif namespace.endswith("/"):
             path = f"{namespace}{key}"
        else:
             path = f"{namespace}/{key}"
        
        # Normalize path: ensure single leading slash, no double slashes
        path = "/" + path.strip("/")
        
        redis_key = f"metalhive:config:{path}"
        
        # Create entry object matching Vault structure
        entry = {
            "path": path,
            "value": value,
            "is_secret": bool(is_secret),
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "updated_by": "system-restore"
        }
        
        json_val = json.dumps(entry)
        
        # Write to Redis
        await r.set(redis_key, json_val)
        print(f"Restored: {path}")
        restored_count += 1
        
    print(f"Restore complete. {restored_count} keys restored.")
    await r.close()

if __name__ == "__main__":
    asyncio.run(restore())
