import {test} from "ava";
import {IModuleUtil} from "../src/i-module-util";
import {ModuleUtil} from "../src/module-util";
import {FileLoader} from "@wessberg/fileloader";
import {PathUtil} from "@wessberg/pathutil";

let moduleUtil: IModuleUtil;
const fileLoader = new FileLoader();
const pathUtil = new PathUtil();
test.beforeEach(() => moduleUtil = new ModuleUtil(fileLoader, pathUtil));

test("foo", t => {
	console.log(moduleUtil.resolvePath("./package.json"));
	t.true(true);
});