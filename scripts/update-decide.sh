#!/bin/bash
cd /root/decide
git checkout master
git pull --rebase
npm install
echo decide update complete on $(hostname)
