import {DIContainer} from "@wessberg/di";
import {IModuleUtil} from "./i-module-util";
import {IModuleUtilHost} from "./i-module-util-host";
import {IModuleUtilOptions} from "./i-module-util-options";

/**
 * A ModuleUtil class meant for public consumption. This shadows the actual ModuleUtilHost class to ensure
 * that it can be used without having to dependency inject it when clients consume it.
 */
export class ModuleUtil implements IModuleUtil {
	/**
	 * The total amount of built in modules
	 * @type {Set<string>}
	 */
	public builtInModules: Set<string>;

	constructor () {
		return DIContainer.get<IModuleUtilHost>();
	}

	/**
	 * This is a noop. The constructor returns the proper implementation of ModuleUtil
	 * @param {string} _filePath
	 * @param {string} _from
	 * @returns {string}
	 */
	public resolvePath (_filePath: string, _from?: string): string {
		throw new Error();
	}

	/**
	 * This is a noop. The constructor returns the proper implementation of ModuleUtil
	 * @param {Partial<IModuleUtilOptions>} _options
	 */
	public setOptions (_options: Partial<IModuleUtilOptions>): void {
		throw new Error();
	}
}