function loadBuilder(name) {
  if (process.env.ATELIER_TEST) {
    return require(`../dist/builders/${name}/index.js`);
  }

  require('./load-ts');

  let builder = require(`../src/builders/${name}/index.ts`);

  if ('default' in builder) {
    builder = builder.default;
  }

  Object.defineProperty(exports, name, {
    configurable: true,
    enumerable: true,
    value: builder,
  });
  return builder;
}

for (const name of ['combine', 'glob', 'execute']) {
  Object.defineProperty(exports, name, {
    configurable: true,
    enumerable: true,
    get: () => loadBuilder(name),
  });
}
