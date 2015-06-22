#!/bin/bash
PID=$(curl -s http://localhost:8000/state/experiment | jq '.pid?')
if [ -n $PID ]; then
    echo killing experiment process $PID
    kill $PID
    sleep 1
fi
echo killing main process
killall node
