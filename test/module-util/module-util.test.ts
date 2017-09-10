import {test} from "ava";
import {ModuleUtil} from "../../src/module-util";
import {FileLoader} from "@wessberg/fileloader";
import {PathUtil} from "@wessberg/pathutil";

const fileLoader = new FileLoader();
const pathUtil = new PathUtil(fileLoader);
const moduleUtil = new ModuleUtil(fileLoader, pathUtil);

test("foo", t => {
	moduleUtil.resolvePath("./test/static/foo.model");
	t.true(true);
});