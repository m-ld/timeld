#!/bin/bash
# Build script for Gateway image executed from Dockerfile
echo Getting latest container image updates...
apt-get update && apt-get upgrade -y > /var/log/build.log

echo Creating system user for timeld...
useradd --create-home --system --comment "User for timeld Gateway" timeld  >> /var/log/build.log
# This permissions change isn't yet working for the underlying data directory:
chown --recursive --verbose timeld:timeld /opt/timeld  >> /var/log/build.log
echo Installing timeld-gateway...
su --login timeld --command "npm install timeld-gateway" >> /var/log/build.log