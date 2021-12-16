require('@snuggery-workspace/scripts/load-ts');

const {
	changedFiles,
	extraProjectDependencies,
	packageDependencies,
	projectsOfFiles,
	removeOwnProject,
} = require('./src/strategies');

exports.changedFiles = changedFiles;
exports.extraProjectDependencies = extraProjectDependencies;
exports.packageDependencies = packageDependencies;
exports.projectsOfFiles = projectsOfFiles;
exports.removeOwnProject = removeOwnProject;
