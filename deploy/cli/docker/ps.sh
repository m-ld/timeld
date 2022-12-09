#!/bin/bash
# Script to emulate ps utility, not included in lightweight base image 
for proc in /proc/[0-9]*/cmdline; do
    echo $(cat $proc | tr "\0" " ");
done
