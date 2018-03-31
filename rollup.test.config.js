import diPlugin from "@wessberg/rollup-plugin-di";
import typescriptRollupPlugin from "@wessberg/rollup-plugin-ts";
import packageJSON from "./package.json";

export default {
	input: "test/module-util/module-util.test.ts",
	output: {
		file: "compiled/module-util.test.js",
		format: "cjs",
		sourcemap: true
	},
	plugins: [
		diPlugin(),
		typescriptRollupPlugin({
			tsconfig: "tsconfig.json",
			include: ["*.ts+(|x)", "**/*.ts+(|x)"],
			exclude: ["*.d.ts", "**/*.d.ts"]
		})
	],
	external: [
		...Object.keys(packageJSON.dependencies),
		...Object.keys(packageJSON.devDependencies),
		"path"
	]
};