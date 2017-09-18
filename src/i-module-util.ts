import {IModuleUtilOptions} from "./i-module-util-options";

export interface IModuleUtil {
	builtInModules: Set<string>;
	resolvePath (filePath: string, from?: string): string;
	setOptions (options: Partial<IModuleUtilOptions>): void;
}