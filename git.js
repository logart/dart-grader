const git = require('simple-git/promise');
const fs = require('fs').promises;
const axios = require('axios').default;

const escapeBranchName = name => name.replace(/[.:]/g, '-');

const checkout = (projectDir, remote) => fs.stat(projectDir)
    .catch(e => {
        console.log(`Could not find repo. Error is ${e}`);
        if (e.code === 'ENOENT') {
            console.log(`Cloning repo ${projectDir}`);
            return git().clone(remote);
        }
    })
    .then(() => git(projectDir));

const pull = (gitClient) => gitClient.checkout('.').then(() => gitClient.pull());

const currentBranch = (gitClient) => gitClient.branch({});

const checkoutExistingBranch = (gitClient, branchName) => gitClient.checkout(branchName);
const checkoutNewBranch = (gitClient, branchName, startFromBranch) => {
    return gitClient.checkout('.')
        .then(() => gitClient.branch({}))
        .then(({ current, branches }) => {
            if (!Object.keys(branches).includes(branchName)) {
                return gitClient.checkoutBranch(branchName, startFromBranch).then(() => {
                    console.log(`Checked out branch ${branchName} from master`);
                });
            } else if (current !== branchName) {
                return gitClient.checkout(branchName).then(() => console.log(`Checked out existing branch ${branchName}`));
            }
        });
};

const addToGit = (gitClient, files) => gitClient.add(files.map(file => file.path));
const commitFiles = (gitClient, commitMessage) => {
    console.log(`Commiting ${commitMessage}`);
    return gitClient.commit(commitMessage)
};
const push = (gitClient, branchName) => {
    console.log(`Pushing ${branchName} to origin`);
    return gitClient.push('origin', branchName);
};
const createMR = (mrUrl, projectId, branchName, title, token) => axios.post(mrUrl, {
    "id": projectId,
    "source_branch": branchName,
    "target_branch": 'master',
    "title": title,

}, {
    headers: {
        'Private-Token': token,
    },
});

module.exports.escapeBranchName = escapeBranchName;
module.exports.checkout = checkout;
module.exports.pull = pull;
module.exports.currentBranch = currentBranch;
module.exports.checkoutExistingBranch = checkoutExistingBranch;
module.exports.checkoutNewBranch = checkoutNewBranch;
module.exports.addToGit = addToGit;
module.exports.commitFiles = commitFiles;
module.exports.push = push;
module.exports.createMR = createMR;