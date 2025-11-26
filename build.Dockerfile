ARG NODE_VER

# Base stage to prepare the static generic stuff
FROM node:${NODE_VER:-node_ver_missing} AS base

WORKDIR /app

RUN npm install -g @vscode/vsce

# Stage to run customizations, volatile operations
FROM base AS cust

COPY package.json ./

RUN npm install

# 2024-01-09: TEMPORARY HACK PATCH FOR LANGIUM TO WORK
#RUN ls -la
#RUN ls -la node_modules/langium-cli/lib/generator
COPY ./patch/ast-generator.js ./node_modules/langium-cli/lib/generator/

COPY . .

RUN npm run langium:generate

# npm run build executed with vsce package

# Build stage to compile the vsix extension file
FROM cust AS vsix

ARG TARCH

# Build VSIX to target arch
RUN vsce package --target ${TARCH:-target_arch_missing}

# Scratch stage to exclude only the vsix package and necessary build artifacts
FROM scratch AS exporter

# Build artefacts not needed
#COPY --from=vsix /app/out .

# Copy only vsix package files out to --output
COPY --from=vsix /app/*.vsix .
