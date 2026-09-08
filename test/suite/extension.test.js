const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const { MarkdownBookPreviewConvert } = require('../../lib/markdown-book-preview-convert');
const { convertDocument, getDocumentRoot, isMarkdownDocument } = require('../../extension');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('registers every contributed command when activated', async () => {
		const extension = vscode.extensions.getExtension('Libroworks.vfmdbp-vscode');
		assert.ok(extension, 'Development extension was not found');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		for (const command of [
			'vfmdbp-vscode.exportXML',
			'vfmdbp-vscode.installCLI',
			'vfmdbp-vscode.installCLI8',
			'vfmdbp-vscode.previewByConfig',
			'vfmdbp-vscode.buildByConfig',
			'vfmdbp-vscode.previewThisCLI',
			'vfmdbp-vscode.buildThisCLI',
			'vfmdbp-vscode.convertMD2HTMLonly',
		]) {
			assert.ok(commands.includes(command), `${command} was not registered`);
		}
	});

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('svgimg reads an image with image-size 2.x', () => {
		const imageDirectory = path.resolve(__dirname, '../../exampleFiles/img0');
		const markdown = '![](c0-1-12.png?svgimg=100)';

		const converted = MarkdownBookPreviewConvert.svgimg(markdown, imageDirectory);

		assert.match(converted, /^<svg /);
		assert.match(converted, /xlink:href="c0-1-12\.png"/);
		assert.doesNotMatch(converted, /svgimg=/);
	});

	test('converts the supplied saved document without relying on the active editor', () => {
		withTempDirectory((directory) => {
			const markdownPath = path.join(directory, 'saved-document.md');
			fs.writeFileSync(markdownPath, '# Saved document\n', 'utf8');
			const document = createFileDocument(markdownPath);

			const htmlPath = convertDocument(document);

			assert.strictEqual(htmlPath, path.join(directory, 'saved-document.html'));
			assert.ok(fs.existsSync(htmlPath));
			assert.strictEqual(getDocumentRoot(document), directory);
		});
	});

	test('uses an explicitly selected root for project lookup and batch conversion', () => {
		withTempDirectory((directory) => {
			const firstDirectory = path.join(directory, 'first-root');
			const secondDirectory = path.join(directory, 'second-root');
			const chapterDirectory = path.join(secondDirectory, 'chapters');
			fs.mkdirSync(firstDirectory);
			fs.mkdirSync(chapterDirectory, { recursive: true });
			fs.writeFileSync(path.join(secondDirectory, '_postReplaceList.json'), '[]', 'utf8');
			fs.writeFileSync(path.join(secondDirectory, 'vivliostyle.mdbplist.json'), '["chapters/chapter.md"]', 'utf8');
			const markdownPath = path.join(chapterDirectory, 'chapter.md');
			fs.writeFileSync(markdownPath, '# Chapter\n', 'utf8');

			const homePath = MarkdownBookPreviewConvert.searchHomepath(markdownPath, '_postReplaceList.json', secondDirectory);
			const converted = MarkdownBookPreviewConvert.convertByMarkdownList(secondDirectory);

			assert.strictEqual(homePath, secondDirectory);
			assert.deepStrictEqual(converted, [path.join(chapterDirectory, 'chapter.html')]);
			assert.ok(!converted[0].startsWith(firstDirectory));
		});
	});

	test('ignores unsaved and non-Markdown documents for save conversion', () => {
		assert.strictEqual(isMarkdownDocument({ uri: vscode.Uri.parse('untitled:test.md'), fileName: 'test.md' }), false);
		assert.strictEqual(isMarkdownDocument(createFileDocument('C:/book/chapter.html')), false);
	});
});

function createFileDocument(fileName) {
	return { uri: vscode.Uri.file(fileName), fileName };
}

function withTempDirectory(callback) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vfmdbp-test-'));
	try {
		callback(directory);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}
