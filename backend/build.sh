#!/usr/bin/env bash
# exit on error
set -o errexit

# Render's environment is already root, so we run the command directly.
apt-get install -y --no-install-recommends graphviz