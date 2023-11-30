require("@snuggery-workspace/scripts/load-ts");

Error.stackTraceLimit = Infinity;
module.exports = require("./src/bin.ts");
