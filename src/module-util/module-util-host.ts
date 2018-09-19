import {IFileLoader} from "@wessberg/fileloader";
import {IPathUtil} from "@wessberg/pathutil";
import {join} from "path";
import {IModuleUtilHost} from "./i-module-util-host";
import {IModuleUtilOptions} from "./i-module-util-options";
import {IPackageJson} from "./i-package-json";

/**
 * A class that helps with working with modules
 */
export class ModuleUtilHost implements IModuleUtilHost {

	/**
	 * A Map between paths as they are passed on to the ModuleUtil and actual file paths on disk.
	 * For example, oftentimes file extensions are implicit and left out of import statements. This map holds the actual full file paths for any of those paths.
	 * @type {Map<string, string>}
	 */
	private static readonly RESOLVED_PATHS: Map<string, string> = new Map();
	/**
	 * The default (relative) library path in a module (if the main field is left out)
	 * @type {string}
	 */
	private static readonly DEFAULT_LIBRARY_ENTRY: string = "index.js";

	/**
	 * The folder where Typescript stores type declarations
	 * @type {string}
	 */
	private static readonly DEFAULT_TYPES_FOLDER: string = "@types";

	/**
	 * The default allowed file extensions when resolving files.
	 * @type {string[]}
	 */
	private static readonly DEFAULT_ALLOWED_EXTENSIONS: string[] = [".ts", ".tsx", ".js", ".mjs", ".json", ".d.ts"];

	/**
	 * The default excluded file extensions when resolving files.
	 * @type {string[]}
	 */
	private static readonly DEFAULT_EXCLUDED_EXTENSIONS: string[] = [];

	/**
	 * The default package fields to resolve libraries from.
	 * @type {string[]}
	 */
	private static readonly DEFAULT_PACKAGE_FIELDS: (keyof IPackageJson)[] = ["module", "es2015", "jsnext:main", "main"];

	/**
	 * The default modules that are baked in to the environment (in this case Node)
	 * @type {string[]}
	 */
	private static readonly DEFAULT_BUILT_IN_MODULES: string[] = ["fs", "path", "buffer", "assert", "child_process", "cluster", "http", "https", "os", "crypto", "dns", "domain", "events", "net", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "timers", "tls", "tty", "dgram", "url", "util", "module", "vm", "zlib", "constants"];
	/**
	 * The total amount of built in modules
	 * @type {Set<string>}
	 */
	public builtInModules: Set<string>;
	/**
	 * The allowed file extensions when resolving files.
	 * @type {Set<string>}
	 */
	private allowedExtensions: Set<string>;
	/**
	 * The excluded file extensions when resolving files.
	 * @type {Set<string>}
	 */
	private excludedExtensions: Set<string>;
	/**
	 * The package fields to resolve libraries from
	 * @type {Set<string>}
	 */
	private packageFields: Set<keyof IPackageJson>;

	constructor (private readonly fileLoader: IFileLoader,
							 private readonly pathUtil: IPathUtil) {
		this.setOptions();
	}

	/**
	 * Sets proper options for the ModuleUtil
	 * @param {Partial<IModuleUtilOptions>} options
	 */
	public setOptions (options?: Partial<IModuleUtilOptions>): void {
		this.allowedExtensions = new Set([...ModuleUtilHost.DEFAULT_ALLOWED_EXTENSIONS, ...this.takeExtraExtensions(options)]);
		this.excludedExtensions = new Set(ModuleUtilHost.DEFAULT_EXCLUDED_EXTENSIONS);
		this.packageFields = new Set([...ModuleUtilHost.DEFAULT_PACKAGE_FIELDS, ...this.takeExtraPackageFields(options)]);
		this.builtInModules = new Set([...ModuleUtilHost.DEFAULT_BUILT_IN_MODULES, ...this.takeExtraBuiltInModules(options)]);
	}

	/**
	 * Resolves the full file path for the given path. It may need an extension and it may be a relative path.
	 * @param {string} filePath
	 * @param {string} [from]
	 * @returns {string}
	 */
	public resolvePath (filePath: string, from: string = process.cwd()): string {
		return this.traceFullPath(filePath, from);
	}

	/**
	 * Traces a library from the given position
	 * @param {string} libName
	 * @param {string} from
	 * @param {string} origFrom
	 * @returns {string}
	 */
	private traceLib (libName: string, from: string, origFrom: string = from): string {
		// If the path is to a built-in module (such as 'fs'), return it immediately.
		if (this.builtInModules.has(libName)) return libName;

		// Resolve the node_modules directory
		const directory = this.resolveNodeModuleDirectory(libName, from, origFrom);

		// Even though a directory may exist with this name, there may be a file within the same directory of the same name
		const scriptPath = this.fileLoader.getWithFirstMatchedExtensionSync(directory, this.allowedExtensions, this.excludedExtensions);
		if (scriptPath != null) return scriptPath;

		const packageJSONPath = this.resolvePackageJson(directory, origFrom);

		// If no package.json file were found, look for an index file within the directory.
		if (packageJSONPath == null) {
			// See if an 'index' exists within that path.
			const indexPath = this.fileLoader.getWithFirstMatchedExtensionSync(join(directory, this.pathUtil.clearExtension(ModuleUtilHost.DEFAULT_LIBRARY_ENTRY)), this.allowedExtensions, this.excludedExtensions);

			// If it does, return it.
			if (indexPath != null) return indexPath;
			else {
				// Otherwise throw an error.
				throw new ReferenceError(`${this.constructor.name} could not find a package.json file within directory: ${directory}`);
			}
		}
		const entry = this.resolveLibEntry(packageJSONPath);

		// If the file already has an extension and exists - return it.
		if (this.pathUtil.hasExtension(entry)) {
			return entry;
		}

		// Otherwise, walk through all extensions and return the first one that exists
		const path = this.fileLoader.getWithFirstMatchedExtensionSync(entry, this.allowedExtensions, this.excludedExtensions);
		if (path == null) {
			throw new ReferenceError(`${this.constructor.name} found no file on disk that matches the entry provided in a package.json file: ${entry}`);
		}
		return path;
	}

	/**
	 * Returns an absolute path to the directory of a library within node_modules.
	 * @param {string} libName
	 * @param {string} from
	 * @param {string} origFrom
	 * @returns {string}
	 */
	private resolveNodeModuleDirectory (libName: string, from: string, origFrom: string = from): string {
		// If the libName already includes 'node_modules', we are satisfied with it.
		if (libName.includes("node_modules")) return libName;

		// Locate node_modules
		const tracedNodeModules = this.traceDown("node_modules", from);

		// Make sure it is defined
		if (tracedNodeModules == null) throw new ReferenceError(`${this.constructor.name} could not locate 'node_modules' in neither the local directory nor any parent directory from: '${origFrom}'`);

		// Append the library name (which is essentially the directory of the library) to the path
		return join(tracedNodeModules, libName);
	}

	/**
	 * Resolves a package.json file within the provided library directory.
	 * @param {string} libDirectory
	 * @param {string} origFrom
	 * @returns {string?}
	 */
	private resolvePackageJson (libDirectory: string, origFrom: string): string | undefined {
		return this.traceUp("package.json", libDirectory, origFrom);
	}

	/**
	 * Takes the entry point for a library from the provided package.json path.
	 * @param {string} packageJsonPath
	 * @returns {string}
	 */
	private resolveLibEntry (packageJsonPath: string): string {
		return this.takeLibEntryPathFromPackage(this.parsePackageJson(packageJsonPath), packageJsonPath);
	}

	/**
	 * Checks if a file exists with an extension suffixed to it
	 * @param {string} path
	 * @returns {string}
	 */
	private existsWithExtension (path: string): string | null {
		// Check if it exists with an extension added to it. It may be a filename such as 'foo.model' where '.model' is not the actual extension, but rather a prefix
		const existsPath = this.fileLoader.getWithFirstMatchedExtensionSync(path, this.allowedExtensions, this.excludedExtensions);

		if (existsPath == null) {
			// See if an 'index' exists within that path.
			return this.indexExists(path);
		}

		// Otherwise, return the path
		return existsPath;
	}

	/**
	 * Checks if an index file exists within the same directory as the path
	 * @param {string} path
	 * @returns {string}
	 */
	private indexExists (path: string): string | null {
		// See if an 'index' exists within that path.
		const indexPath = this.fileLoader.getWithFirstMatchedExtensionSync(join(path, this.pathUtil.clearExtension(ModuleUtilHost.DEFAULT_LIBRARY_ENTRY)), this.allowedExtensions, this.excludedExtensions);

		// If it does, return it.
		if (indexPath != null) return indexPath;
		return null;
	}

	/**
	 * Checks if a path exists with a cleared extension
	 * @param {string} path
	 * @returns {string}
	 */
	private existsWithClearedExtension (path: string): string | null {
		const existsPath = this.fileLoader.getWithFirstMatchedExtensionSync(this.pathUtil.clearExtension(path), this.allowedExtensions, this.excludedExtensions);

		if (existsPath == null) {
			// See if an 'index' exists within that path.
			return this.indexExists(path);
		}

		// Otherwise, return the path
		return existsPath;
	}

	/**
	 * Checks if a file exists. If the file doesn't exist as it is given, it will try to clear its current extension and test for all supported extensions.
	 * If it fails, it will suffix all of the supported extensions instead, without clearing any existing extension.
	 * @param {string} path
	 * @returns {string}
	 */
	private fileExists (path: string): string | null {
		// If it isn't a directory and the file already exists, return that one
		if (!this.fileLoader.isDirectorySync(path) && this.fileLoader.existsSync(path)) {
			return path;
		}
		const withoutExtension = this.existsWithClearedExtension(path);
		if (withoutExtension != null) return withoutExtension;

		return this.existsWithExtension(path);
	}

	/**
	 * Traces a full path from the given path. It may be so already, but it may also be relative to the wrong directory and need to be resolved.
	 * @param {string} filePath
	 * @param {string} from
	 * @param {string} origFrom
	 * @returns {string}
	 */
	private traceFullPath (filePath: string, from: string, origFrom: string = from): string {
		// If the filePath is a directory, expect it to point to a library within node_modules.
		if (this.pathUtil.isLib(filePath)) {
			// See if exists within the cache first
			const cachedLib = ModuleUtilHost.RESOLVED_PATHS.get(filePath);
			if (cachedLib != null) return cachedLib;

			// Trace the full path
			try {
				const tracedLib = this.traceLib(filePath, from, origFrom);

				// Cache it
				ModuleUtilHost.RESOLVED_PATHS.set(filePath, tracedLib);
			} catch (ex) {
				// Attempt again from the parent directory. It is entirely possible that a node_modules folder can be resolved from the parent
				if (from !== "/") {
					return this.traceFullPath(filePath, join(from, "../"), origFrom);
				}

				// Otherwise, re-throw the error
				else {
					throw ex;
				}
			}
		}

		// Make sure that the path is absolute
		const absolute = this.pathUtil.makeAbsolute(filePath, from, true);

		// See if exists within the cache first
		const cachedFullPath = ModuleUtilHost.RESOLVED_PATHS.get(absolute);
		if (cachedFullPath != null) return cachedFullPath;

		// Trace the full path
		const tracedFullPath = this.findFullPath(absolute);

		// Cache it
		ModuleUtilHost.RESOLVED_PATHS.set(absolute, tracedFullPath);
		return tracedFullPath;
	}

	/**
	 * Finds the full path (including extension) for the provided path
	 * @param {string} absolutePath
	 * @returns {string}
	 */
	private findFullPath (absolutePath: string): string {
		const errorMessage = `${this.constructor.name} could not find a file on disk with the path: ${absolutePath}`;

		// Otherwise, try to locate it on disk
		const path = this.fileExists(absolutePath);
		if (path == null) {
			throw new ReferenceError(errorMessage);
		}

		// Otherwise, return the path
		return path;
	}

	/**
	 * Formats additional user-provided extensions
	 * @param {Partial<IModuleUtilOptions>} options
	 * @returns {string[]}
	 */
	private takeExtraExtensions (options?: Partial<IModuleUtilOptions>): string[] {
		if (options == null || options.extraExtensions == null) return [];
		return [...options.extraExtensions].map(extension => this.pathUtil.dotExtension(extension));
	}

	/**
	 * Formats additional user-provided package fields.
	 * @param {Partial<IModuleUtilOptions>} options
	 * @returns {string[]}
	 */
	private takeExtraPackageFields (options?: Partial<IModuleUtilOptions>): (keyof IPackageJson)[] {
		if (options == null || options.extraPackageFields == null) return [];
		return [...options.extraPackageFields];
	}

	/**
	 * Formats additional user-provided names for built-in modules.
	 * @param {Partial<IModuleUtilOptions>} options
	 * @returns {string[]}
	 */
	private takeExtraBuiltInModules (options?: Partial<IModuleUtilOptions>): string[] {
		if (options == null || options.extraBuiltInModules == null) return [];
		return [...options.extraBuiltInModules];
	}

	/**
	 * Goes "down" the folder tree and attempts to reach the provided target file.
	 * @param {string} target
	 * @param {string} current
	 * @returns {string}
	 */
	private traceDown (target: string, current: string): string | null {
		let _current = current;
		let targetPath: string | null = null;
		while (_current !== "/") {
			targetPath = join(_current, target);
			const hasTarget = this.fileLoader.existsSync(targetPath);
			if (hasTarget) break;
			_current = join(_current, "../");
			if (_current.includes(("../"))) return null;
		}
		return targetPath;
	}

	/**
	 * Goes "up" the chain of folders and attempts to reach the target file.
	 * @param {string} target
	 * @param {string} from
	 * @param {string} origFrom
	 * @param {boolean} [lookingForParentNodeModules=false]
	 * @returns {string?}
	 */
	private traceUp (target: string, from: string, origFrom: string, lookingForParentNodeModules: boolean = false): string | undefined {

		// Check if the target exists as a direct child of the 'from' path.
		const withinBase = join(from, target);
		// If it exists, return it.
		if (this.fileLoader.existsSync(withinBase)) return withinBase;

		// Make sure that the file/directory in fact exists.
		if (!this.fileLoader.existsSync(from)) {
			const file = this.pathUtil.takeFilename(from);

			if (from === "/" || from === `/${target}`) {
				throw new ReferenceError(`${this.constructor.name} received a path to a package that doesn't exist in neither the local directory nor any parent directory: ${origFrom}`);
			} else {
				if (!lookingForParentNodeModules && !from.includes(ModuleUtilHost.DEFAULT_TYPES_FOLDER)) {
					// It may be within the '@types' folder inside node_modules
					const oneUp = join(from, "../", ModuleUtilHost.DEFAULT_TYPES_FOLDER, file);
					if (oneUp === "/" || oneUp === `/${file}`) {
						throw new ReferenceError(`${this.constructor.name} received a path to a package that doesn't exist in neither the local directory nor any parent directory: ${origFrom}/${target}`);
					}
					return this.traceUp(target, oneUp, origFrom);
				} else {
					// Otherwise, it may be inside a node_modules folder in a parent directory
					const oneUp = join(from, "../../", file);
					if (oneUp === "/" || oneUp === `/${file}`) {
						throw new ReferenceError(`${this.constructor.name} received a path to a package that doesn't exist in neither the local directory nor any parent directory: ${origFrom}/${target}`);
					}
					return this.traceUp(target, oneUp, origFrom, true);
				}
			}
		}

		// Recursively get all file names within the directory
		const files = this.fileLoader.getAllInDirectorySync(from, this.allowedExtensions, this.excludedExtensions, true);

		// Find the target file within the directory.
		return files.find(
			// If the target already has an extension, verify that the file has the same filename
			file => this.pathUtil.hasExtension(target)
				? this.pathUtil.takeFilename(file) === target
				// Otherwise, loop through all of the extensions and assert that the filename matches any of them.
				: [...this.allowedExtensions].some(ext => this.pathUtil.takeFilename(file) === this.pathUtil.setExtension(target, ext))
		);
	}

	/**
	 * Retrieves a package.json from the provided path.
	 * @param {string} packageJsonPath
	 * @returns {IPackageJson}
	 */
	private parsePackageJson (packageJsonPath: string): IPackageJson {
		const buffer = this.fileLoader.loadSync(packageJsonPath);
		return JSON.parse(buffer.toString());
	}

	/**
	 * Retrieves the entry point for a library from a package.json file
	 * @param {IPackageJson} packageJson
	 * @param {string} packageJsonPath
	 * @returns {IPackageJson}
	 */
	private takeLibEntryPathFromPackage (packageJson: IPackageJson, packageJsonPath: string): string {
		let candidate: string | null = null;
		for (const field of this.packageFields) {
			candidate = packageJson[field];
			if (candidate != null) break;
		}
		if (candidate == null || candidate === "") candidate = this.pathUtil.clearExtension(ModuleUtilHost.DEFAULT_LIBRARY_ENTRY);
		return join(packageJsonPath, "../", candidate);
	}
}