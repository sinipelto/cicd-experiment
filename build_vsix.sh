#!/bin/bash

set -eu

# shellcheck disable=SC1091
source .env || { echo "ERROR: Could not read .env file."; exit 1; }

archs=("win32-x64" "win32-arm64" "linux-x64" "linux-arm64" "linux-armhf" "alpine-x64" "alpine-arm64" "darwin-x64" "web")

help() {
	echo "USAGE: $0 <TARGET_OS-ARCH>"
	echo -e "Supported VSIX target architectures:\n\t${archs[*]}"
}

# Input not empty
[[ "${1:-}" == "" ]] && help && exit 1

# Check input value in array
ok=0
for v in "${archs[@]}"; do
	[[ ${v} == "${1}" ]] && ok=1 && break
done
! (( ok )) && help && exit 1

echo "Starting build.."

export DOCKER_BUILDKIT=1

docker build -f build.Dockerfile \
--build-arg NODE_VER="${NODE_VER}" \
--build-arg TARCH="$1" \
--output build .
