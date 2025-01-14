import joplin from 'api'
import { ExportContext, FileSystemItem } from 'api/types'

const fs = require('fs-extra')
import path = require('path')

function rfc3339(d: Date): string {
	function atLeast2Digits(n: number): string {
		return (n < 10 ? '0': '') + n
	}

	const YYYY = d.getFullYear()
	const MM = atLeast2Digits(d.getMonth() + 1)
	const DD = atLeast2Digits(d.getDate())
	const HH = atLeast2Digits(d.getHours())
	const mm = atLeast2Digits(d.getMinutes())
	const ss = atLeast2Digits(d.getSeconds())

	return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}+08:00`
}

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

async function noteTagsGet(id: string): Promise<string[]> {
	const noteTags = await joplin.data.get(['notes', id, 'tags'])
	console.assert(!noteTags.has_more)
	let res: string[] = []
	res = noteTags.items.map((noteTag: any) => noteTag.title)
	return res
}

function unixEpoch2RFC3339(unixEpochMs: number): string {
	const d = new Date(unixEpochMs)
	return rfc3339(d)
}

function frontMatter(note: any, noteTags: string[]): string {
	let res: string = ""
	res += `updated: ${unixEpoch2RFC3339(note.user_updated_time)}\n`
	res += `created: ${unixEpoch2RFC3339(note.user_created_time)}\n`
	if (noteTags.length > 0) {
		res += `tags:\n`
		for (let i = 0; i < noteTags.length; i++) {
			res += `  - ${noteTags[i]}\n`
		}
	}
	if (note.source_url) {
		res += `source: ${note.source_url}\n`
	}
	if (note.latitude != 0 || note.longitude != 0) {
		res += `location: "${note.latitude},${note.longitude}"\n`
	}
	return res
}

function serialize(note: any, noteTags: string[]): string {
	return `---\n${frontMatter(note, noteTags)}---\n\n${note.body}`
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
					const noteTags = await noteTagsGet(item.id)
					await fs.writeFile(filePath, serialize(item, noteTags), 'utf8')
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
