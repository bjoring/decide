#!/bin/bash
set -o pipefail
PID=$(curl -s http://localhost:8000/state/experiment | jq '.pid?')
STATUS=$?

if [ -n "$PID" -a "$PID" != "null" ]; then
    echo killing experiment process $PID
    kill $PID
    sleep 1
fi

if [ $STATUS -eq 0 ]; then
    echo killing main process
    killall node
fi
