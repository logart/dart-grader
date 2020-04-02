FROM adoptopenjdk/openjdk11:jdk-11.0.6_10-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache git nodejs npm

RUN mkdir /grader
WORKDIR /grader

COPY node_modules node_modules
COPY analizer.js analizer.js
COPY git.js git.js
COPY grader.js grader.js
COPY gradle.js gradle.js
COPY util.js util.js
COPY package-lock.json package-lock.json
COPY package.json package.json

ENTRYPOINT npm run grader -- -repoUrl ${REPO_URL} -baseDir ${BASE_DIR} -jsDir ${BASE_JS_DIR} -mrUrl ${MR_URL} -projectId ${PROJECT_ID} -gitlabToken ${GITLAB_TOKEN}