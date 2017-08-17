import {IPackageJson} from "./i-package-json";

export interface IModuleUtilOptions {
	extraExtensions: Iterable<string>;
	extraPackageFields: Iterable<keyof IPackageJson>;
}