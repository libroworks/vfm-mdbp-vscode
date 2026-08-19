const path = require('path');

const { runTests } = require('@vscode/test-electron');

async function main() {
	try {
		delete process.env.ELECTRON_RUN_AS_NODE;

		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../');

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			version: '1.100.0'
		});
	} catch {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
