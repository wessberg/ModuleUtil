export interface IModuleUtil {
	resolvePath (filePath: string, from?: string): string;
	builtInModules: Set<string>;
}