import {DIContainer} from "@wessberg/di";
import {FileLoader, IFileLoader} from "@wessberg/fileloader";
import {IPathUtil, PathUtil} from "@wessberg/pathutil";
import {IModuleUtilHost} from "./module-util/i-module-util-host";
import {ModuleUtilHost} from "./module-util/module-util-host";

DIContainer.registerSingleton<IFileLoader, FileLoader>();
DIContainer.registerSingleton<IPathUtil, PathUtil>();
DIContainer.registerSingleton<IModuleUtilHost, ModuleUtilHost>();