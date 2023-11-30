import {clearFormat, Entry, Identifier, Node, parse} from "@bgotink/kdl";
import assert from "node:assert/strict";
import {suite} from "uvu";

import {fromJsonObject, fromJsonValue} from "../jik/serialize";
import {serializeWorkspace} from "../serialize";

const test = suite("kdl serialize");

test("fromJsonValue should work for simple values", () => {
	assert.deepEqual(
		fromJsonValue("lorem", 2),
		new Node(new Identifier("lorem"), [Entry.createArgument(2)]),
	);
});

test("fromJsonObject should work for objects", () => {
	assert.deepEqual(
		fromJsonObject("parent", {node: "lorem", is: {deep: true}}),
		clearFormat(
			parse(String.raw`parent node="lorem" { is deep=true; }`, {as: "node"}),
		),
	);
});

test("fromJsonObject should work for when passing arrays", () => {
	assert.deepEqual(
		fromJsonObject("parent", {
			node: [
				{
					object: true,
					$implicit: "lorem",
				},
				"ipsum",
			],
		}),
		clearFormat(
			parse(
				String.raw`parent {
					node {
						- "lorem" object=true
						- "ipsum"
					}
				}`,
				{as: "node"},
			),
		),
	);
});

test("serializeWorkspace should work", () => {
	assert.deepEqual(
		serializeWorkspace({
			version: 1,
			projects: {
				parent: {
					root: "projects/parent",
					targets: {
						build: {
							builder: "@lorem/ipsum:dolor",
							options: {
								configFile: "projects/parent/build.config.json",
								verbose: false,
							},
							configurations: {
								verbose: {
									verbose: true,
								},
							},
						},
						test: {
							builder: "@lorem/ipsum:sit",
							options: {
								configFile: "projects/parent/test.config.js",
								coverage: false,
							},
							configurations: {
								coverage: {
									coverage: true,
								},
							},
						},
					},
				},
				child: {
					root: "projects/child",
					targets: {
						build: {
							builder: "@lorem/ipsum:dolor",
							options: {
								configFile: "projects/child/build.config.json",
								verbose: false,
							},
							configurations: {
								verbose: {
									verbose: true,
								},
							},
						},
						test: {
							builder: "@lorem/ipsum:sit",
							options: {
								configFile: [
									"projects/child/test.config.js",
									"projects/child/test2.config.js",
								],
								coverage: false,
							},
							configurations: {
								coverage: {
									coverage: true,
								},
							},
						},
					},
				},
			},
		}),
		clearFormat(
			parse(String.raw`
				version 0
	
				project "parent" root="projects/parent" {
					target "build" builder="@lorem/ipsum:dolor" {
						options {
							configFile "projects/parent/build.config.json"
							verbose false
						}
						configuration "verbose" {
							verbose true
						}
					}
					target "test" builder="@lorem/ipsum:sit" {
						options {
							configFile "projects/parent/test.config.js"
							coverage false
						}
						configuration "coverage" {
							coverage true
						}
					}
				}
	
				project "child" root="projects/child" {
					target "build" builder="@lorem/ipsum:dolor" {
						options {
							configFile "projects/child/build.config.json"
							verbose false
						}
						configuration "verbose" {
							verbose true
						}
					}
					target "test" builder="@lorem/ipsum:sit" {
						options {
							configFile "projects/child/test.config.js" "projects/child/test2.config.js"
							coverage false
						}
						configuration "coverage" {
							coverage true
						}
					}
				}
			`),
		),
	);
});

test.run();
