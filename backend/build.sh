#!/usr/bin/env bash
# exit on error
set -o errexit

# Set a retry limit
MAX_RETRIES=5
COUNT=0

# Try to run the install command. If it fails, wait and retry.
until apt-get install -y --no-install-recommends graphviz
do
  COUNT=$((COUNT+1))
  # If we've tried too many times, exit with an error
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "Failed to install graphviz after $MAX_RETRIES attempts."
    exit 1
  fi
  # Wait 5 seconds before trying again
  echo "Failed to acquire lock, retrying in 5 seconds... (Attempt ${COUNT} of ${MAX_RETRIES})"
  sleep 5
done

echo "Graphviz installed successfully."