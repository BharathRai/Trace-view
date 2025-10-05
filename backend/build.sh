#!/usr/bin/env bash
# exit on error
set -o errexit

# Go straight to installing the package, skipping the update command.
apt-get install -y --no-install-recommends graphviz