import "../../src/services";

import {test} from "ava";
import {ModuleUtil} from "../../src/module-util/module-util";

const moduleUtil = new ModuleUtil();

test("foo", t => {
	moduleUtil.resolvePath("./test/static/foo.model");
	moduleUtil.resolvePath("ansi-align");
	t.true(true);
});