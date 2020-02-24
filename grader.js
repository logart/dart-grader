const escapeBranchName = name => name.replace(/[.:]/g, '-');

const firstTrue = promises => {
    const newPromises = promises.map(p => new Promise(
        (resolve, reject) => p.then(v => v && resolve(v), reject)
    ));
    newPromises.push(Promise.all(promises).then(() => false));
    return Promise.race(newPromises);
};

const convertToGradle = (path, baseDir) => {
    console.log(path);
    //13 is length of /build.gradle ending
    return path.slice(baseDir.length, path.length - 13).replace(/\//g, ':');
};

const args = process.argv.slice(2);

const params = args.reduce((res, v, index, array) => (index % 2 === 0)
    ? ({...res, [array[index].slice(1)]: array[index + 1],})
    : res,
    {});

console.log(`Running Dart Grader with arguments ${JSON.stringify(params)}`);

const cwd = process.cwd();
console.log(`Working dir is ${cwd}`);

const projectDir = cwd + '/' + params['baseDir'];
const baseJsDir = projectDir + '/' + params['jsDir'];
const baseJavaDir = projectDir;
const remote = params['repoUrl'];

(async () => {
    const fs = require('fs').promises;
    const ncu = require('npm-check-updates');
    const git = require('simple-git/promise');
    const axios = require('axios').default;
    const {execSync} = require("child_process");

    console.log(`Cloning repo ${params['baseDir']}`);
    const simpleGit = await fs.stat(projectDir)
        .catch(e => {
            console.log(e);
            if (e.code === 'ENOENT') {
                return git().clone(remote);
            }
        })
        .then(() => git(projectDir));

    const delimiter = '/';
    const skipDirs = ['node_modules', 'out', 'etc'];
    console.log(`Base dir is ${baseJsDir}`);

    const findDependencyFile = async (filename, dir, skipDirs) => {
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
            .filter(({name}) => skipDirs && !skipDirs.includes(name))
            .reduce((acc, {path}) => {
                return [...acc, path];
            }, [])
            .map(folder => findDependencyFile(filename, folder, skipDirs)))
            .then(recursiveResults => [...recursiveResults.flatMap(a => a), ...reducedFiles]);
    };

    const updatePackageFiles = (dependencies, packageFiles, dependencyUpdater) => {
        const deps = Object.keys(dependencies);
        const dependencyName = deps[0];
        const updatedVersion = dependencies[dependencyName];
        if (!dependencyName) {
            console.log('No dependencies should be updated.');
            return;
        }
        //take only one dependency
        console.log(`Dependency ${dependencyName} is going to be updated to version ${updatedVersion}`);
        const branchName = `dart-grader-${escapeBranchName(dependencyName)}`;
        return simpleGit.checkout('.').then(
            () => simpleGit.branch({}).then(({current, branches}) => {
                if (!Object.keys(branches).includes(branchName)) {
                    return simpleGit.checkoutBranch(branchName, 'master').then(() => {
                        console.log(`Checked out branch ${branchName} from master`);
                    });
                } else if (current !== branchName) {
                    return simpleGit.checkout(branchName).then(() => console.log(`Checked out existing branch ${branchName}`));
                }
            }).then(() => {
                console.log(`This files [\n${packageFiles.map(f => `\t${f.path}`).join(',\n')}\n] will be analized to update`);
                const allFileOperationsFinished = Promise.all(packageFiles.map(file => fs.readFile(file.path, {encoding: 'utf8'})
                    .then((data, err) => {
                        if (err) {
                            console.log(`Error ${err}`);
                            return err;
                        }
                        const result = dependencyUpdater(dependencyName, updatedVersion)(data);
                        if (data !== result) {
                            console.log(`File ${file.path} will be updated from ${data} to ${result}`)
                            return fs.writeFile(file.path, result, {encoding: 'utf8', flag: 'w'})
                                .then(() => {
                                    console.log(`Adding file ${file.path} to commit.`);
                                    simpleGit.add(file.path);
                                    return file.path;
                                });
                        }
                        return Promise.resolve();
                    }),
                ));
                //wait for all file writes to finish
                return allFileOperationsFinished.then(updatedFiles => {
                    const changedFiled = updatedFiles.filter(a => a);
                    console.log(changedFiled);
                    const commitMessage = `Update ${dependencyName} to ${updatedVersion}`;
                    if (changedFiled.length !== 0) {
                        console.log(`Commiting with message '${commitMessage}'`);
                        return simpleGit.commit(commitMessage)
                            .then(() => ({branchName, commitMessage}));
                    } else {
                        console.log('Seems like branch already has all required changes. Processing to push and creating MR...');
                    }
                    return {branchName, commitMessage};
                });
            }));
    };

    simpleGit.branch({}).then(({current}) => {
        if (current !== 'master') {
            console.log(`Current branch ${current} differs from master`);
            return simpleGit.checkout('master').then(() => {
                console.log('Switching to master to update dependencies');
            });
        }
        console.log('We are on master. Continuing...');
    }).then(() => {
        // process js dependencies
        const jsPromise = findDependencyFile('package.json', baseJsDir, skipDirs)
            .then(jsDependencyFiles => {
                console.log(`Found [\n${jsDependencyFiles.map(f => `\t${f.path}`).join(',\n')}\n] files with js dependencies`);
                firstTrue(jsDependencyFiles.map(f => {
                    return ncu.run({
                        packageData: fs.readFile(`${f.path}`, 'utf-8'),
                        jsonUpgraded: true,
                        // silent: true,
                        // upgrade: true,
                    }).then(upgraded => {
                        if (Object.keys(upgraded).length === 0) {
                            //process next file
                            console.log(`File ${f.path} is up to date alredy.`);
                            return false;
                        }
                        return upgraded;
                    });
                }))
                    .then(upgraded => updatePackageFiles(upgraded, jsDependencyFiles))
                    .then(pushInfo => {
                        if (pushInfo) {
                            console.log(`Pushing ${pushInfo.branchName} to origin`);
                            return simpleGit.push('origin', pushInfo.branchName).then(() => pushInfo);
                        }
                    })
                    .then(pushInfo => {
                        if (pushInfo) {
                            return axios.post(params['mrUrl'], {
                                "id": params['projectId'],
                                "source_branch": pushInfo.branchName,
                                "target_branch": "master",
                                "title": pushInfo.commitMessage,

                            }, {
                                headers: {
                                    'Private-Token': params['gitlabToken'],
                                },
                            })
                                .then(() => console.log('MR created'));
                        }
                    });
            });
        const javaPromise = findDependencyFile('build.gradle', baseJavaDir, skipDirs)
            .then(javaDependencyFiles => {
                console.log(`Found [\n${javaDependencyFiles.map(f => `\t${f.path}`).join(',\n')}\n] files with java dependencies`);
                const updatedPaths = javaDependencyFiles.map(file => {
                    return fs.readFile(file.path, {encoding: 'utf-8'})
                        .then(content => {
                            //do not include version for child projects
                            const basePluginDefinition = 'plugins {\n'
                                + '    id \'name.remal.check-dependency-updates\'';
                            const pluginDefinition = (file.path === (projectDir + '/build.gradle'))
                                ? basePluginDefinition + ' version \'1.0.165\''
                                : basePluginDefinition;

                            if (!content.match(/\'name.remal.check-dependency-updates\'/g)) {
                                const pathedFileContent = content.replace(/plugins\s*{/g, pluginDefinition);
                                const res = fs.writeFile(file.path, pathedFileContent, {encoding: 'utf-8'})
                                    .then(() => file.path);
                                console.log('w' + res);
                                return res;
                            }
                            console.log('p' + file.path);
                            return file.path;
                        });
                });
                Promise.all(updatedPaths)
                    .then(() => updatedPaths.reduce((result, pathPromise) => {
                        //stop execution if we know what dependency to update
                        if (result) {
                            return result;
                        }
                        return pathPromise.then(path => {
                            console.log(`i ${path}`);
                            const gradleProject = convertToGradle(path, projectDir);
                            console.log(`i ${path} ${gradleProject}`);
                            const res = execSync(projectDir + `/gradlew ${gradleProject}:clean ${gradleProject}:checkDependencyUpdates`, {cwd: projectDir});
                            const dependencyToUpdate = res.toString('utf-8').split('\n')
                                .filter(line => line.startsWith('New dependency'))
                                .filter(line => !line.match(/gradle.plugin/g))
                                .map(line => line.replace(/New dependency version: ([a-zA-Z.:\-0-9]+) ([0-9.A-Z]+) -> ([0-9.A-Z]+)/g, '$1#$3'))
                                .map(line => line.split('#'))
                                .map(array => ({[array[0].substring(0, array[0].length - 1)]: array[1]}));
                            console.log(dependencyToUpdate);
                            return dependencyToUpdate[0];
                        });
                    }, false))
                    .then(upgraded => {
                        if (Object.keys(upgraded).length === 0) {
                            //process next file
                            // todo fix log message
                            // console.log(`File ${f.path} is up to date alredy.`);
                            return false;
                        }
                        return upgraded;
                    })
                    .then(upgraded => updatePackageFiles(upgraded, javaDependencyFiles, (dependencyName, updatedVersion) => data => {
                        const regex = new RegExp(`'${dependencyName}:[0-9.^a-zA-Z]+'`, 'g');
                        const result = data.replace(regex, `'${dependencyName}:${updatedVersion}'`);
                        return result;
                    }))
                    .then(pushInfo => {
                        if (pushInfo) {
                            console.log(`Pushing ${pushInfo.branchName} to origin`);
                            return simpleGit.push('origin', pushInfo.branchName).then(() => pushInfo);
                        }
                    })
                    .then(pushInfo => {
                        if (pushInfo) {
                            return axios.post(params['mrUrl'], {
                                "id": params['projectId'],
                                "source_branch": pushInfo.branchName,
                                "target_branch": "master",
                                "title": pushInfo.commitMessage,

                            }, {
                                headers: {
                                    'Private-Token': params['gitlabToken'],
                                },
                            })
                                .then(() => console.log('MR created'));
                        }
                    });
            });
        return Promise.all([/*jsPromise,*/ javaPromise]);
    });
})();