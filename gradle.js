const fs = require('fs').promises;
const { execSync } = require('child_process');

const convertToGradle = (path, baseDir) => {
    console.log(`Converting ${path} to gradle`);
    //13 is length of /build.gradle ending
    return path.slice(baseDir.length, path.length - 13).replace(/\//g, ':');
};

const patchDependencyFilesWithPlugin = (dependencyFile, projectDir) => {
    //do not include version for child projects
    const basePluginDefinition = 'plugins {\n'
        + '    id \'name.remal.check-dependency-updates\'';
    const pluginDefinition = (dependencyFile.path === (projectDir + '/build.gradle'))
        ? basePluginDefinition + ' version \'1.0.178\''
        : basePluginDefinition;

    return fs.readFile(`${dependencyFile.path}`, 'utf-8')
        .then(content => {
            if (!content.match(/\'name.remal.check-dependency-updates\'/g)) {
                const pathedFileContent = content.replace(/plugins\s*{/g, pluginDefinition);
                console.log(`Patched dependency file content for ${dependencyFile.path} is ${pathedFileContent}`);
                return pathedFileContent;
            }
        })
        .then(patchedContent => patchedContent && fs.writeFile(dependencyFile.path, patchedContent, { encoding: 'utf-8' }));
};

const findPotentialOutdatedDependencies = dependencyFile => fs.readFile(`${dependencyFile.path}`, 'utf-8')
    .then(content => {
        const exec = /dependencies\s*\{(.*?)\}/s.exec(content);
        const dependencies = exec[1].split('\n');
        const dependenciesToCheck = dependencies
            .filter(dep => !dep.match(/^\s*$/s))
            .filter(dep => !dep.match(/.*\/\/\s*dart-grader\s*ignore/))
            // annotationProcessor 'org.projectlombok:lombok'" ]
            .map(dep => {
                const parsedDependency = /\w+\s+['"]([a-zA-Z0-9.-]+:[a-zA-Z0-9.-]+):[a-zA-Z$0-9.-]+['"]/.exec(dep);
                return parsedDependency && parsedDependency[1];
            })
            .filter(dep => !!dep);
        console.log(`exec ${exec[1]}, ${dependenciesToCheck}`);
        return dependenciesToCheck;
    });

const findOutdatedDependencies = async (dependencyFile, projectDir) => {
    const gradleProject = convertToGradle(dependencyFile.path, projectDir);
    const potentialDependencies = await findPotentialOutdatedDependencies(dependencyFile);

    const res = execSync(projectDir + `/gradlew ${gradleProject}:clean ${gradleProject}:checkDependencyUpdates`, { cwd: projectDir });
    return res.toString('utf-8').split('\n')
        .filter(line => line.startsWith('New dependency'))
        .filter(line => !line.match(/gradle.plugin/g))
        .map(line => line.replace(/New dependency version: ([a-zA-Z.:\-0-9]+): ([0-9.A-Z]+) -> ([0-9.A-Z]+)/g, '$1#$3'))
        .map(line => line.split('#'))
        .filter(line => potentialDependencies.includes(line[0]))
        .map(array => ({
            name: array[0].substring(0, array[0].length),
            version: array[1]
        }));
};

const upgradeDependency = (data, dependencyName, updatedVersion) => {
    const regex = new RegExp(`'${dependencyName}:[0-9.^a-zA-Z]+'`, 'g');
    const result = data.replace(regex, `'${dependencyName}:${updatedVersion}'`);
    return result;
};

module.exports.convertToGradle = convertToGradle;
module.exports.findPotentialOutdatedDependencies = findPotentialOutdatedDependencies;
module.exports.findOutdatedDependencies = findOutdatedDependencies;
module.exports.patchDependencyFilesWithPlugin = patchDependencyFilesWithPlugin;
module.exports.upgradeDependency = upgradeDependency;