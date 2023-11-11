const jsLoader = require.extensions['.js'];

require('esbuild-register/dist/node').register({
	format: 'cjs',
	target: ['node18'],
	tsconfigRaw: {
		compilerOptions: {
			experimentalDecorators: true,
		},
	},
});

// remove esbuild-register's javascript loader
require.extensions['.js'] = jsLoader;
