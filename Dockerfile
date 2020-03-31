FROM adoptopenjdk/openjdk11:jdk-11.0.6_10-alpine

# RUN git clone https://gitlab.audienzz.ch/audienzz/audienzz.git
RUN apk update && apk upgrade && \
    apk add --no-cache git nodejs npm

RUN mkdir /grader
WORKDIR /grader

COPY node_modules node_modules
COPY grader.js grader.js
COPY package-lock.json package-lock.json
COPY package.json package.json

ENTRYPOINT npm run grader -- -repoUrl ${REPO_URL} -baseDir ${BASE_DIR} -jsDir ${BASE_JS_DIR} -mrUrl ${MR_URL} -projectId ${PROJECT_ID} -gitlabToken ${GITLAB_TOKEN}