#!/bin/bash
# =============================================================================
# MetalHive API Test Script
# =============================================================================
# Usage: ./test-api.sh [server_ip]
# Example: ./test-api.sh 65.109.200.75
# =============================================================================

set -e

SERVER="${1:-localhost}"
CONTROLLER_PORT="8080"
AI_PORT="8082"
BASE_URL="http://${SERVER}:${CONTROLLER_PORT}"
AI_URL="http://${SERVER}:${AI_PORT}"

echo "=============================================="
echo "MetalHive API Test Suite"
echo "Server: $SERVER"
echo "=============================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
warn() { echo -e "${YELLOW}⚠ WARN${NC}: $1"; }

# Test function
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local description="$4"
    
    echo -n "Testing: $description... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${endpoint}" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "${BASE_URL}${endpoint}" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        pass "$endpoint ($http_code)"
        echo "   Response: ${body:0:100}..."
    elif [ "$http_code" -ge 400 ]; then
        fail "$endpoint ($http_code)"
        echo "   Error: $body"
    else
        warn "$endpoint ($http_code)"
    fi
    echo ""
}

echo "=============================================="
echo "1. HEALTH CHECKS"
echo "=============================================="

# Controller Health
test_endpoint "GET" "/health" "" "Controller Health"

# AI Health (direct)
echo -n "Testing: AI Service Health (direct)... "
ai_response=$(curl -s -w "\n%{http_code}" "${AI_URL}/health" 2>/dev/null)
ai_code=$(echo "$ai_response" | tail -n1)
if [ "$ai_code" == "200" ]; then
    pass "AI Health ($ai_code)"
else
    fail "AI Health ($ai_code)"
fi
echo ""

echo "=============================================="
echo "2. NODES API"
echo "=============================================="

test_endpoint "GET" "/api/v1/nodes" "" "List Nodes"

# Register a test node
test_endpoint "POST" "/api/v1/nodes" '{"hostname":"test-node","ip":"192.168.1.100","labels":{"role":"worker"}}' "Register Node"

echo "=============================================="
echo "3. CONTAINERS API"
echo "=============================================="

test_endpoint "GET" "/api/v1/containers" "" "List Containers"

echo "=============================================="
echo "4. AI / METALMIND API"
echo "=============================================="

test_endpoint "POST" "/api/v1/ai/ask" '{"query":"What is the health status of my fleet?"}' "Ask AI"
test_endpoint "GET" "/api/v1/ai/reports" "" "Get AI Reports"

echo "=============================================="
echo "5. HIVESHELL (EXEC) API"
echo "=============================================="

test_endpoint "POST" "/api/v1/exec/run" '{"command":"echo hello","target":"all"}' "Run Command"
test_endpoint "GET" "/api/v1/exec/history" "" "Execution History"

echo "=============================================="
echo "6. HIVEVAULT (CONFIG) API"
echo "=============================================="

test_endpoint "GET" "/api/v1/config/app/database" "" "Get Config"
test_endpoint "POST" "/api/v1/config" '{"key":"app/test","value":"hello","environment":"dev"}' "Set Config"

echo "=============================================="
echo "7. METRICS API"
echo "=============================================="

test_endpoint "GET" "/api/v1/metrics/system/test-node" "" "System Metrics"

echo "=============================================="
echo "SUMMARY"
echo "=============================================="
echo "All tests completed. Check results above for any failures."
echo ""
echo "Common Issues:"
echo "- 404: Endpoint not implemented"
echo "- 503: Backend service unavailable" 
echo "- 429: Rate limit exceeded (Gemini AI)"
echo "- Empty arrays: No agents deployed to report data"
