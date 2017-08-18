import {InsertionOrderedSet} from "@wessberg/insertion-ordered-set";

export interface IModuleUtil {
	resolvePath (filePath: string, from?: string): string;
	builtInModules: InsertionOrderedSet;
}