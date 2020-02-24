# dart-grader
This is the tool to keep java/js dependencies up to date.

## Usage:

### Preconditions:
nodejs should be installed

### Install needed dependency
`$ npm install`
### Run the script
`$ npm run grader -- -repoUrl https://github.com/logart/dart-grader -baseDir dart-grader -jsDir .`
#### Keys description
```
repoUrl     - the url of the repo to analyze
baseDir     - the root of the project
jsDir       - the root of the js content
mrUrl       - endpoint to create gitlab MR
projectId   - id of the project to create MR to
gitlabToken - token to access API(It is recommended to push grader MR from the separate user)
```