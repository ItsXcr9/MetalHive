#!/bin/bash
# Quick Test Script for MetalHive APIs
# Run: ./quick-test.sh 65.109.200.75

SERVER="${1:-localhost}"
echo "Testing MetalHive at $SERVER..."
echo ""

echo "1. Health Check"
curl -s "http://${SERVER}:8080/health" | jq '.'
echo ""

echo "2. Containers (count)"
curl -s "http://${SERVER}:8080/api/v1/containers" | jq '.total'
echo ""

echo "3. Nodes"
curl -s "http://${SERVER}:8080/api/v1/nodes" | jq '.'
echo ""

echo "4. AI Ask"
curl -s -X POST "http://${SERVER}:8080/api/v1/ai/ask" \
  -H "Content-Type: application/json" \
  -d '{"query":"hello"}' | jq '.response[:80]'
echo ""

echo "5. HiveShell (exec history)"
curl -s "http://${SERVER}:8080/api/v1/exec/history" | jq '.'
echo ""

echo "6. HiveVault (get config)"
curl -s "http://${SERVER}:8080/api/v1/config/test" | jq '.'
echo ""

echo "Done!"
