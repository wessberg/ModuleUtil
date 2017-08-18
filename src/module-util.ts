import {IModuleUtil} from "./i-module-util";
import {IFileLoader} from "@wessberg/fileloader";
import {IModuleUtilOptions} from "./i-module-util-options";
import {IPathUtil} from "@wessberg/pathutil";
import {join} from "path";
import {IPackageJson} from "./i-package-json";

/**
 * A class that helps with working with modules
 */
export class ModuleUtil implements IModuleUtil {

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
	 * The default allowed file extensions when resolving files.
	 * @type {string[]}
	 */
	private static readonly DEFAULT_ALLOWED_EXTENSIONS: string[] = [".ts", ".tsx", ".js", ".json"];

	/**
	 * The default excluded file extensions when resolving files.
	 * @type {string[]}
	 */
	private static readonly DEFAULT_EXCLUDED_EXTENSIONS: string[] = [".d.ts"];

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
	public readonly builtInModules: Set<string>;
	/**
	 * The allowed file extensions when resolving files.
	 * @type {Set<string>}
	 */
	private readonly allowedExtensions: Set<string>;
	/**
	 * The excluded file extensions when resolving files.
	 * @type {Set<string>}
	 */
	private readonly excludedExtensions: Set<string>;
	/**
	 * The package fields to resolve libraries from
	 * @type {Set<string>}
	 */
	private readonly packageFields: Set<keyof IPackageJson>;

	constructor (private fileLoader: IFileLoader,
							 private pathUtil: IPathUtil,
							 options?: Partial<IModuleUtilOptions>) {
		this.allowedExtensions = new Set([...ModuleUtil.DEFAULT_ALLOWED_EXTENSIONS, ...this.takeExtraExtensions(options)]);
		this.excludedExtensions = new Set(ModuleUtil.DEFAULT_EXCLUDED_EXTENSIONS);
		this.packageFields = new Set([...ModuleUtil.DEFAULT_PACKAGE_FIELDS, ...this.takeExtraPackageFields(options)]);
		this.builtInModules = new Set([...ModuleUtil.DEFAULT_BUILT_IN_MODULES, ...this.takeExtraBuiltInModules(options)]);
	}

	/**
	 * Resolves the full file path for the given path. It may need an extension and it may be a relative path.
	 * @param {string} filePath
	 * @param {string} [from]
	 * @returns {string}
	 */
	public resolvePath (filePath: string, from: string = process.cwd()): string {

		// Obtain an absolute path
		const absolute = this.pathUtil.makeAbsolute(filePath, from, true);

		// See if it has already been traced
		const cached = ModuleUtil.RESOLVED_PATHS.get(absolute);
		if (cached != null) return cached;

		// Trace the path
		const traced = this.traceFullPath(absolute, from);

		// Cache it
		ModuleUtil.RESOLVED_PATHS.set(absolute, traced);
		return traced;
	}

	/**
	 * Traces a library from the given position
	 * @param {string} libName
	 * @param {string} from
	 * @returns {string}
	 */
	private traceLib (libName: string, from: string): string {
		const directory = this.resolveNodeModuleDirectory(libName, from);

		// If the "directory" actually points to a concrete file, this is an import of a concrete script within a library.
		if (!this.fileLoader.isDirectorySync(directory)) {
			const [scriptExists, scriptPath] = this.fileLoader.existsWithFirstMatchedExtensionSync(directory, this.allowedExtensions, this.excludedExtensions);
			if (!scriptExists) throw new ReferenceError(`${this.constructor.name} attempted to resolve file: ${directory} but couldn't`);
			return scriptPath!;
		}

		const packageJSONPath = this.resolvePackageJson(directory);
		const entry = this.resolveLibEntry(packageJSONPath);

		// If the file already has an extension and exists - return it.
		if (this.pathUtil.hasExtension(entry)) {
			return entry;
		}

		// Otherwise, walk through all extensions and return the first one that exists
		const [exists, path] = this.fileLoader.existsWithFirstMatchedExtensionSync(entry, this.allowedExtensions, this.excludedExtensions);
		if (!exists) {
			throw new ReferenceError(`${this.constructor.name} found no file on disk that matches the entry provided in a package.json file: ${entry}`);
		}
		return path!;
	}

	/**
	 * Returns an absolute path to the directory of a library within node_modules.
	 * @param {string} libName
	 * @param {string} from
	 * @returns {string}
	 */
	private resolveNodeModuleDirectory (libName: string, from: string): string {
		// If the libName already includes 'node_modules', we are satisfied with it.
		if (libName.includes("node_modules")) return libName;

		// Locate node_modules
		const tracedNodeModules = this.traceDown("node_modules", from);

		// Make sure it is defined
		if (tracedNodeModules == null) throw new ReferenceError(`${this.constructor.name} could not locate 'node_modules' from ${from}`);

		// Append the library name (which is essentially the directory of the library) to the path
		return join(tracedNodeModules, libName);
	}

	/**
	 * Resolves a package.json file within the provided library directory.
	 * @param {string} libDirectory
	 * @returns {string}
	 */
	private resolvePackageJson (libDirectory: string): string {
		const match = this.traceUp("package.json", libDirectory);
		if (match == null) throw new ReferenceError(`${this.constructor.name} could not trace a package.json file within directory: ${libDirectory}`);
		return match;
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
	 * Traces a full path from the given path. It may be so already, but it may also be relative to the wrong directory and need to be resolved.
	 * @param {string} filePath
	 * @param {string} from
	 * @returns {string}
	 */
	private traceFullPath (filePath: string, from: string): string {
		// If the filePath is a directory, expect it to point to a library within node_modules.
		if (this.pathUtil.isLib(filePath)) {
			// If the path is to a built-in module (such as 'fs'), return it immediately.
			if (this.builtInModules.has(filePath)) return filePath;
			return this.traceLib(filePath, from);
		}
		return this.findFullPath(filePath);
	}

	/**
	 * Finds the full path (including extension) for the provided path
	 * @param {string} absolutePath
	 * @returns {string}
	 */
	private findFullPath (absolutePath: string): string {
		const errorMessage = `${this.constructor.name} could not find a file on disk with the path: ${absolutePath}`;

		// If the path is a directory, return it.
		if (this.fileLoader.isDirectorySync(absolutePath)) return absolutePath;

		// If the file already has an extension (and it isn't excluded and is one of the supported ones), return that one if it exists.
		if (this.pathUtil.hasExtension(absolutePath) && this.allowedExtensions.has(this.pathUtil.takeExtension(absolutePath)) && !this.excludedExtensions.has(this.pathUtil.takeExtension(absolutePath))) {
			if (!this.fileLoader.existsSync(absolutePath)) {
				throw new ReferenceError(errorMessage);
			}
			return absolutePath;
		}

		// Otherwise, try to locate it on disk
		const [exists, path] = this.fileLoader.existsWithFirstMatchedExtensionSync(absolutePath, this.allowedExtensions, this.excludedExtensions);

		// If it doesn't exist, throw an error
		if (!exists) throw new ReferenceError(errorMessage);

		// Otherwise, return the path
		return path!;
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
	private traceDown (target: string, current: string): string|null {
		let _current = current;
		let targetPath: string|null = null;
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
	 * @returns {string?}
	 */
	private traceUp (target: string, from: string): string|undefined {

		// Check if the target exists as a direct child of the 'from' path.
		const withinBase = join(target, from);
		// If it exists, return it.
		if (this.fileLoader.existsSync(withinBase)) return withinBase;

		// Make sure that the file/directory in fact exists.
		if (!this.fileLoader.existsSync(from)) {
			throw new ReferenceError(`${this.constructor.name} received a path to a package that doesn't exist: ${from}`);
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
		let candidate: string|null = null;
		for (const field of this.packageFields) {
			candidate = packageJson[field];
			if (candidate != null) break;
		}
		if (candidate == null) candidate = ModuleUtil.DEFAULT_LIBRARY_ENTRY;
		return join(packageJsonPath, "../", candidate);
	}
}