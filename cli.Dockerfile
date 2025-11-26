ARG NODE_VER

# Base stage to prepare the static generic stuff
FROM node:${NODE_VER:-node_ver_missing} AS base

WORKDIR /app

# Stage to run customizations, volatile operations
FROM base AS npm

COPY package.json ./

RUN npm install

FROM npm AS patch

# 2024-01-09: TEMPORARY HACK PATCH FOR LANGIUM TO WORK
#RUN ls -la
#RUN ls -la node_modules/langium-cli/lib/generator
COPY ./patch/ast-generator.js ./node_modules/langium-cli/lib/generator/

FROM patch AS nodejs

COPY . .

RUN npm run langium:generate

RUN npm run build

FROM nodejs AS cli

RUN mkdir -p ./generated

RUN chmod +x ./bin/grismo-cli.js

# Pass any arguments to the grismo-cli
ENTRYPOINT [ "node", "./bin/grismo-cli.js" ]

# Feed the model into nodeJS
#node ./bin/grismo-cli.js projectIoTPML ./examples/D7_CICD/cicd_multiplatform.ipm

# Run the generator to generate the outputs from the model(s)
#node ./bin/grismo-cli.js projectCICDConf -t gitlab cicdRoot ./out/gitlab.yaml

# Scratch stage to exclude only the necessary build artifacts
#FROM scratch AS exporter

#COPY --from=cli /app/generated/* .
