#!/usr/bin/env bash
# exit on error
set -o errexit

# Use sudo to grant administrator privileges for the installation
sudo apt-get install -y --no-install-recommends graphviz