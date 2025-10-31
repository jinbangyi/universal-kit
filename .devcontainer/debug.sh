#!/bin/bash
set -e

# start docker compose
docker compose -f .devcontainer/docker-compose.yaml -f .devcontainer/docker-compose.signoz.yaml up -d
