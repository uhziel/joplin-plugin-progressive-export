import joplin from 'api'
import { ExportContext, FileSystemItem } from 'api/types'

const fs = require('fs-extra')
import path = require('path')

function resourceDir(context: ExportContext) {
	return context.destPath + '/assets'
}

async function relativeDirPath(item: any) {
	let res = ''
	while (true) {
		if (item.type_ === ModelType.Folder) {
			res = `${item.title}/${res}`
		}
		if (!item.parent_id) {
			return res
		}

		item = await folderGet(item.parent_id)
	}
}

async function folderGet(id: string) {
	return await joplin.data.get(['folders', id])
}

async function noteGet(id: string) {
	return await joplin.data.get(['notes', id])
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

			onInit: async (context: ExportContext) => {
				await fs.mkdirp(context.destPath)
				await fs.mkdirp(resourceDir(context))
			},

			onProcessItem: async (context: ExportContext, itemType: number, item: any) => {
				if (itemType === ModelType.Folder) {
					const dirPath = `${context.destPath}/${await relativeDirPath(item)}`
					fs.mkdirp(dirPath)
				} else if (itemType === ModelType.Note) {
					const filePath = `${context.destPath}/${await relativeDirPath(item)}/${item.title}.md`
					await fs.writeFile(filePath, item.body, 'utf8')
				}
			},

			onProcessResource: async (context: ExportContext, resource: any, filePath: string) => {
				const destPath = resourceDir(context) + '/' + path.basename(filePath)
				await fs.copy(filePath, destPath)
			},

			onClose: async (context: ExportContext) => {},
		})
	},
})
