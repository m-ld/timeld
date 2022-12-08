#!/bin/bash
# Build script for CLI image executed from Dockerfile
echo Getting latest container image updates...
apt-get update && apt-get upgrade -y > /var/log/build.log

# The following two steps will be removed from the final build script:
apt-get install mlocate -y >> /var/log/build.log

echo Creating user for timeld...
useradd --create-home --comment "User for timeld CLI" timeld >> /var/log/build.log
echo
echo Current directory is $(pwd)
ls -l
echo
echo Installing timeld-cli...
# npm install --global timeld-cli >> /var/log/build.log
npm install --global *.tgz >> /var/log/build.log