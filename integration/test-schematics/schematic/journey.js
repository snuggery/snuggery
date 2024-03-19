/* cspell:ignore merol muspi rolod */

const {journey} = require("@snuggery/journey");
const {mapImports} = require("@snuggery/journey/trips/map-imports");

exports.lorem = journey(
	mapImports("@integration/test", [["lorem", {newName: "merol"}]]),
);

exports.ipsum = journey(
	mapImports("@integration/test", [["ipsum", {newName: "muspi"}]]),
);

exports.dolor = journey(
	mapImports("@integration/test", [["dolor", {newName: "rolod"}]]),
);
