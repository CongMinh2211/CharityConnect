import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://donation:donation@localhost:5432/donation")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
JWT_SECRET = os.getenv("JWT_SECRET", "local-charityconnect-secret")
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "local-internal-token")
CAMPAIGN_SERVICE_URL = os.getenv("CAMPAIGN_SERVICE_URL", "http://localhost:3002")
# Ngưỡng duyệt 2 bước: donation >= ngưỡng phải qua admin duyệt trước khi cộng tiền.
APPROVAL_THRESHOLD_VND = int(os.getenv("DONATION_APPROVAL_THRESHOLD_VND", "50000000"))
ANCHOR_RPC_URL = os.getenv("ANCHOR_RPC_URL", "")
ANCHOR_PRIVATE_KEY = os.getenv("ANCHOR_PRIVATE_KEY", "")
ANCHOR_CHAIN_ID = int(os.getenv("ANCHOR_CHAIN_ID", "11155111"))
ANCHOR_EXPLORER_URL = os.getenv("ANCHOR_EXPLORER_URL", "https://sepolia.etherscan.io/tx")
