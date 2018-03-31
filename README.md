# ModuleUtilHost
[![NPM version][npm-version-image]][npm-version-url]
[![License-mit][license-mit-image]][license-mit-url]

[license-mit-url]: https://opensource.org/licenses/MIT

[license-mit-image]: https://img.shields.io/badge/License-MIT-yellow.svg

[npm-version-url]: https://www.npmjs.com/package/@wessberg/moduleutil

[npm-version-image]: https://badge.fury.io/js/%40wessberg%2Fmoduleutil.svg

> A helper class for resolving paths to libraries and modules

## Installation
Simply do: `npm install @wessberg/moduleutil`.

## What is it

This is a service that can resolve the absolute paths to both files within a Typescript/Javascript project as well as entry files within libraries located in `node_modules`.
If you feed it with the path: `babel-core`, it will look for a library named *babel-core* within the nearest `node_modules` folder and resolve the entry point by parsing the `package.json` file within it.
It will always resolve to an entry point that uses ES modules if necessary, otherwise it will use the entry point listed in the `main` field.

It can also compute absolute paths to modules within your project (i.e. compute absolute paths from relative imports).

## Usage
```typescript
const moduleUtil = new ModuleUtilHost(fileLoader, pathUtil);
moduleUtil.resolvePath("babel-core"); // /Users/<computer_name>/folder/node_modules/babel-core/index.js
moduleUtil.resolvePath("./foo"); // /Users/<computer_name>/folder/foo.ts
```

### Library paths vs module paths

Paths that starts with `./` are determined to be modules within your project and will be resolved from its position within
the code base. Otherwise, it will be resolved within node_modules. This behavior mimics Node's resolution algorithm.

### Supported extensions

By default, ModuleUtilHost will look for files with any of the following extensions: *.ts*, *.js* or *.json* (in that order). You can pass in additional extensions to the constructor if you please:

```typescript
const moduleUtil = new ModuleUtilHost(fileLoader, pathUtil, {
	extraExtensions: [".css", ".scss"]
});
```

### Supported package.json fields

By default, ModuleUtilHost will parse the following entry point fields within any package.json file located within `node-modules`: *module*, *es2015*, *jsnext:main*, *main* (in that order). You can pass in additional entry point fields to the constructor if you please:

```typescript
const moduleUtil = new ModuleUtilHost(fileLoader, pathUtil, {
	extraPackageFields: ["browser", "something"]
});
```

### Built-in modules

If ModuleUtilHost receives a path that points to a built-in module such as *fs* or *path*, it will simply return that path, rather than attempting to resolve the module within `node_modules` (which wouldn't make sense since it is built-in)
If you know of more built-in modules than the ones provided by the plugin, you can pass them in as an option:

```typescript
const moduleUtil = new ModuleUtilHost(fileLoader, pathUtil, {
	extraBuiltInModules: ["some-module", "foo"]
});
```

### Dependencies

ModuleUtilHost is built to fit dependency injection systems. Thus, it requires two services to be constructor-injected: implementations of [IFileLoader](https://github.com/wessberg/fileloader) and [IPathUtil](https://github.com/wessberg/pathutil).
You can npm-install both of them: `npm install @wessberg/fileloader` and `npm install @wessberg/pathutil` and either pass them on to the constructor or add them to your dependency injection system.