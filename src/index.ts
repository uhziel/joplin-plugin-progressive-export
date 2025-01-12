import joplin from 'api';
import { FileSystemItem } from 'api/types';

const fs = require('fs-extra');
import path = require('path');

function destDir(context:any) {
	return context.destPath;
}

function resourceDir(context:any) {
	return context.destPath + '/assets';
}

enum ModelType {
	Note = 1,
	Folder = 2,
	Resource = 4,
	Tag = 5,
	NoteTag = 6,
}

joplin.plugins.register({
	onStart: async function() {

		await joplin.interop.registerExportModule({
			description: 'Obsidian Export Directory',
			format: 'obsidian',
			target: FileSystemItem.Directory,
			isNoteArchive: false,

			onInit: async (context:any) => {
				await fs.mkdirp(destDir(context));
				await fs.mkdirp(resourceDir(context));
			},

			onProcessItem: async (context:any, _itemType:number, item:any) => {
				if (_itemType !== ModelType.Note) {
					return
				}
				const filePath = destDir(context) + '/' + item.title + '.md';
				await fs.writeFile(filePath, item.body, 'utf8');
			},

			onProcessResource: async (context:any, _resource:any, filePath:string) => {
				const destPath = resourceDir(context) + '/' + path.basename(filePath);
				await fs.copy(filePath, destPath);
			},

			onClose: async (_context:any) => {},
		});
	},
});
