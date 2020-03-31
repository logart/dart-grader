const fs = require('fs').promises;
const { firstTrue } = require('./util');
const delimiter = '/';

const findDependencyFiles = async (filename, dir, skipDirs) => {
    const asyncFilesInDir = await fs.readdir(dir)
        .then(files => files.map(file => ({
            name: file,
            path: dir + delimiter + file,
        }))
            .map(file => fs.lstat(file.path).then(f => ({
                ...file,
                dir: f.isDirectory(),
            }))));
    const files = await Promise.all(asyncFilesInDir);

    const regularFiles = files.filter(file => !file.dir);
    const directories = files.filter(file => file.dir);

    const reducedFiles = regularFiles.reduce((acc, file) => file.name === filename ? [...acc, file] : acc, []);

    return Promise.all(directories
        .filter(({ name }) => skipDirs && !skipDirs.includes(name))
        .reduce((acc, { path }) => {
            return [...acc, path];
        }, [])
        .map(folder => findDependencyFiles(filename, folder, skipDirs)))
        .then(recursiveResults => {
            return recursiveResults.length !== 0 ? [...recursiveResults.flatMap(a => a), ...reducedFiles] : [...reducedFiles]
        });
};

const raceFindingProcess = async (dependenciesFiles, outdatedDependenciesChecker) => {
    const prmises = dependenciesFiles.map(async dependencyFile => {
        //stop execution if we know what dependency to update
        console.log(`Processing ${dependencyFile.path}`);
        return outdatedDependenciesChecker(dependencyFile);
    });
    console.log(`promises ${prmises}`);
    const race = await firstTrue(prmises);
    console.log(`race ${JSON.stringify(race)}`);
    return race;
};

const updatePackageFiles = (dependency, packageFiles, dependencyUpdater) => {
    const dependencyName = dependency.name;
    const updatedVersion = dependency.version;
    console.log(`Dependency ${dependencyName} is going to be updated to version ${updatedVersion}`);
    console.log(`This files [\n${packageFiles.map(f => `\t${f.path}`).join(',\n')}\n] will be analized to update`);
    return packageFiles.map(file => fs.readFile(file.path, { encoding: 'utf8' })
        .then((data, err) => {
            if (err) {
                console.log(`Error ${err}`);
                return err;
            }
            console.log(data);
            const result = dependencyUpdater(data, dependencyName, updatedVersion);
            if (data !== result) {
                console.log(`File ${file.path} will be updated from ${data} to ${result}`)
                return fs.writeFile(file.path, result, { encoding: 'utf8', flag: 'w' })
                    .then(() => file);
            }
            console.log(`File ${JSON.stringify(file)} was not patched`);
            return Promise.resolve();
        }),
    );
};

module.exports.findDependencyFiles = findDependencyFiles;
module.exports.raceFindingProcess = raceFindingProcess;
module.exports.updatePackageFiles = updatePackageFiles;
