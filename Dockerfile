############################
# Build container
############################
FROM node:12-alpine AS dep

WORKDIR /ops

ADD package.json package-lock.json ./
RUN npm install --production && npx modclean -release && rm modclean*.log

ADD . .

RUN npm run build && mv /ops/node_modules /ops/lib/

############################
# Final container
############################
FROM registry.cto.ai/official_images/node:2-12.13.1-stretch-slim AS final

ENV CLOUD_SDK_VERSION=274.0.1
ENV PATH /usr/local/bin/google-cloud-sdk/bin:$PATH
RUN apt update && apt install -y curl python \
  && curl -Os https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-${CLOUD_SDK_VERSION}-linux-x86_64.tar.gz \
    && tar xzf google-cloud-sdk-${CLOUD_SDK_VERSION}-linux-x86_64.tar.gz \
    && rm google-cloud-sdk-${CLOUD_SDK_VERSION}-linux-x86_64.tar.gz \
    && mv google-cloud-sdk/ /usr/local/bin \
    && gcloud components install beta \
    && cd /usr/local/bin/google-cloud-sdk/bin \
    && gcloud config set core/disable_usage_reporting true \
    && gcloud config set component_manager/disable_update_check true

WORKDIR /ops

ENV GOOGLE_APPLICATION_CREDENTIALS="/ops/gcp.json"
ENV EDITOR=nano

COPY --from=dep /ops/lib .

USER 9999:9999