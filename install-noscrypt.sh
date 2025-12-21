#!/usr/bin/env bash
set -euo pipefail

# Install noscrypt dependencies and library
# Based on containers/deno.Dockerfile build process
# Installs to /usr/local/lib/libnoscrypt.so as expected by grchat.yaml

echo "Installing prerequisites..."

# Check if running with sudo/root
if [ "$EUID" -ne 0 ]; then
  echo "This script requires root privileges. Please run with sudo."
  exit 1
fi

# Update package list
apt update

# Install build dependencies
apt install -y sudo cmake wget

# Install Task (Taskfile runner)
curl -1sLf 'https://dl.cloudsmith.io/public/task/task/setup.deb.sh' | sudo -E bash
apt install -y task

echo "Downloading noscrypt source..."

# Create temporary build directory
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"

# Download and extract noscrypt source
NOSCRYPT_URL="https://www.vaughnnugent.com/public/resources/software/builds/noscrypt/711a22c569d1ae06ae2f454ece57ad7a2152aaa3/noscrypt/noscrypt-src.tgz"
wget "$NOSCRYPT_URL"
tar -xzf noscrypt-src.tgz

echo "Building noscrypt..."

# Build noscrypt
task
task -- -DNC_ENABLE_UTILS=ON

echo "Installing noscrypt to /usr/local/lib..."

# Install to system (requires root)
task install

echo "Verifying installation..."

# Verify the library was installed to the expected path
if [ -f "/usr/local/lib/libnoscrypt.so" ]; then
  echo "✓ libnoscrypt.so installed to /usr/local/lib/"
else
  echo "✗ Installation failed: /usr/local/lib/libnoscrypt.so not found"
  exit 1
fi

if [ -f "/usr/local/include/noscrypt/noscrypt.h" ]; then
  echo "✓ Headers installed to /usr/local/include/noscrypt/"
else
  echo "✗ Installation failed: headers not found"
  exit 1
fi

# Cleanup
cd /
rm -rf "$WORK_DIR"

echo "noscrypt installation complete!"
echo "Library path: /usr/local/lib/libnoscrypt.so"
