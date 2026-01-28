#!/bin/bash
# MCP Server Connection Check Script (Cross-platform)

echo ""
echo "=== MCP Server Status ==="
echo ""

ALL_OK=true

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
else
    PLATFORM="windows"
fi

# Check Codex server
if command -v codex &> /dev/null; then
    if [[ "$PLATFORM" == "windows" ]]; then
        CODEX_PID=$(tasklist //FI "IMAGENAME eq codex.exe" //FO CSV //NH 2>/dev/null | head -1 | tr -d '"' | awk -F',' '{print $2}')
        if [[ -n "$CODEX_PID" ]]; then
            echo "[OK] Codex MCP server running"
        else
            echo "[FAIL] Codex MCP server not running"
            echo "  -> Run 'codex -m gpt-5.2-codex mcp-server'"
            ALL_OK=false
        fi
    else
        # macOS/Linux
        if pgrep -x "codex" > /dev/null; then
            CODEX_PID=$(pgrep -x "codex" | head -1)
            echo "[OK] Codex MCP server running (PID: $CODEX_PID)"
        else
            echo "[FAIL] Codex MCP server not running"
            echo "  -> Run 'codex -m gpt-5.2-codex mcp-server'"
            ALL_OK=false
        fi
    fi
else
    echo "[WARN] Codex command not found in PATH"
    ALL_OK=false
fi

# Check Memory server
if [[ "$PLATFORM" == "windows" ]]; then
    # Windows: Check for node processes with server-memory
    MEMORY_CHECK=$(tasklist //FI "IMAGENAME eq node.exe" //FO CSV //NH 2>/dev/null | grep -i "server-memory" | head -1)
    if [[ -n "$MEMORY_CHECK" ]]; then
        echo "[OK] Memory MCP server running"
    else
        echo "[WARN] Memory MCP server status unknown (may lazy start)"
        echo "  -> Will auto-start on first use"
    fi
else
    # macOS/Linux
    if ps aux | grep -v grep | grep -q "@modelcontextprotocol/server-memory"; then
        MEMORY_PID=$(ps aux | grep -v grep | grep "@modelcontextprotocol/server-memory" | awk '{print $2}' | head -1)
        echo "[OK] Memory MCP server running (PID: $MEMORY_PID)"
    else
        echo "[WARN] Memory MCP server status unknown (may lazy start)"
        echo "  -> Will auto-start on first use"
    fi
fi

echo ""
if [[ "$ALL_OK" == "true" ]]; then
    echo "=== All MCP servers OK ==="
else
    echo "=== Some MCP servers have issues ==="
fi
echo ""
