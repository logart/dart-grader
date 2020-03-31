const fs = require('fs').promises;
const ncu = require('npm-check-updates');
const axios = require('axios').default;
const {
    findDependencyFiles,
    raceFindingProcess,
    updatePackageFiles,
} = require('./analizer');
const {
    findOutdatedDependencies,
    patchDependencyFilesWithPlugin,
    upgradeDependency,
} = require('./gradle');
const {
    escapeBranchName,
    checkout,
    pull,
    currentBranch,
    checkoutExistingBranch,
    checkoutNewBranch,
    addToGit,
    commitFiles,
    push,
    createMR,
} = require('./git');

const args = process.argv.slice(2);

const params = args.reduce((res, v, index, array) => (index % 2 === 0)
    ? ({ ...res, [array[index].slice(1)]: array[index + 1], })
    : res,
    {});

console.log(`Running Dart Grader with arguments ${JSON.stringify(params)}`);

const cwd = process.cwd();
console.log(`Working dir is ${cwd}`);

const projectDir = cwd + '/' + params['baseDir'];
const baseJsDir = projectDir + '/' + params['jsDir'];
const baseJavaDir = projectDir;
const remote = params['repoUrl'];
const remoteWithAuth = `https://oauth2:${params['gitlabToken']}@${remote.substring(8)}`;

console.log(`Checking repo ${params['baseDir']}`);

const skipDirs = ['node_modules', 'out', 'etc', 'build', 'tests'];

console.log(`Base dir is ${projectDir}`);
(async () => {
    const gitClient = await checkout(projectDir, remoteWithAuth);
    const currentBranchName = await currentBranch(gitClient);
    if (currentBranchName !== 'master') {
        console.log(`Current branch ${JSON.stringify(currentBranchName)} differs from master. Switching to master to update dependencies.`);
        await checkoutExistingBranch(gitClient, 'master');
    }
    await pull(gitClient);
    console.log('We are on master. Continuing...');

    console.log('Processing java dependencies');

    const dependencyFiles = await findDependencyFiles("build.gradle", baseJavaDir, skipDirs);
    await Promise.all(dependencyFiles.map(dependencyFiles => patchDependencyFilesWithPlugin(dependencyFiles, baseJavaDir)));
    console.log(`df ${JSON.stringify(dependencyFiles)}`);
    console.log('\n\n');
    const outdatedDependency = await raceFindingProcess(
        dependencyFiles,
        async (dependencyFile) => {
            console.log(`dep file ${JSON.stringify(dependencyFile)}`);
            const dependencyToUpdate = await findOutdatedDependencies(dependencyFile, projectDir);
            return dependencyToUpdate && dependencyToUpdate.length > 0 ? ({
                dependencyFile,
                dependencyToUpdate,
            }) : false;
        });
    console.log('\n\n');
    console.log(`Going to update ${JSON.stringify(outdatedDependency.dependencyToUpdate)} at ${JSON.stringify(outdatedDependency.dependencyFile.path)}`);
    const dependencyToUpdate = outdatedDependency.dependencyToUpdate[0];
    const branchName = `dart-grader-${escapeBranchName(dependencyToUpdate.name)}`;
    await checkoutNewBranch(gitClient, branchName, 'master');
    console.log(`We are on ${branchName}`);
    const updatedFiles = (await Promise.all(updatePackageFiles(dependencyToUpdate, dependencyFiles, upgradeDependency)))
        .filter(file => file != null);
    console.log(`Files ${JSON.stringify(updatedFiles)} were updated`);
    const commitMessage = `Update ${dependencyToUpdate.name} to ${dependencyToUpdate.version}`;
    await addToGit(gitClient, updatedFiles)
        .then(() => commitFiles(gitClient, commitMessage))
        .then(() => push(gitClient, branchName))
        .then(() => createMR(params['mrUrl'], params['projectId'], branchName, commitMessage, params['gitlabToken']));
})();