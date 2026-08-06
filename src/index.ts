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
	return context.destPath + '/' + ASSET_LINK_PREFIX
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

function frontMatter(note: any, noteTags: string[], alias: string): string {
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
	if (alias) {
		res += `aliases:\n`
		res += `  - ${alias}\n`
	}
	return res
}

function serialize(note: any, noteTags: string[], alias: string): string {
	return `---\n${frontMatter(note, noteTags, alias)}---\n\n${note.body}`
}

function dirname(path: string): string {
	if (!path) {
		throw new Error("path is empty")
	}
	const s = path.split(/\/|\\/)
	s.pop()
	return s.join('/')
}

// 只处理文件名本身，不接受其绝对路径、相对路径
function safeFilename(filename: string): string {
	if (!filename || !filename.replace) {
		return "Untitled"
	}
	return filename.replace(/\//g, '_').trim()
}

// 若目标路径已存在同名文件，则在文件名后追加 (1)、(2)… 后缀，避免覆盖
async function uniqueFilePath(filePath: string): Promise<string> {
	if (!(await fs.pathExists(filePath))) {
		return filePath
	}
	const dir = path.dirname(filePath)
	const ext = path.extname(filePath)
	const base = path.basename(filePath, ext)
	for (let i = 1; ; i++) {
		const candidate = path.join(dir, `${base} zhulei(${i})${ext}`)
		if (!(await fs.pathExists(candidate))) {
			return candidate
		}
	}
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
				console.log("onProcessItem", item)
				if (itemType === ModelType.Folder) {
					const dirPath = `${context.destPath}/${await relativeDirPath(item)}`
					await fs.mkdirp(dirPath)
				} else if (itemType === ModelType.Note) {
					const noteFilename = safeFilename(item.title)
					let alias = ""
					if (noteFilename !== item.title) {
						alias = item.title
					}
					const filePath = await uniqueFilePath(`${context.destPath}/${await relativeDirPath(item)}/${noteFilename}.md`)
					const noteTags = await noteTagsGet(item.id)
					await fs.mkdirp(dirname(filePath))
          item.body = await adjustBody(item.body)
					await fs.writeFile(filePath, serialize(item, noteTags, alias), 'utf8')
				}
			},

			onProcessResource: async (context: ExportContext, resource: any, filePath: string) => {
				const destPath = resourceDir(context) + path.basename(filePath)
				await fs.copy(filePath, destPath)
				if (resource.title || resource.filename) {
					const metadata = {}
					if (resource.title) {
						metadata["title"] = resource.title
					}
					if (resource.filename) {
						metadata["filename"] = resource.filename
					}
					await fs.writeFile(destPath+".metadata", JSON.stringify(metadata), 'utf8')
				}
			},

			onClose: async (context: ExportContext) => {},
		})
	},
})

const ASSET_LINK_PREFIX = "assets/joplin/"

// <img/> 转换为 ![]()
//   <img src=":/5d9205caebfdee47fe64eac3f91779ca" width="56" height="56" alt="颗豆互动"/>
//   <img src=":/5d9205caebfdee47fe64eac3f91779ca" width="56" height="56"/>
function convertImgTags(content: string): string {
	// 带 alt 的：<img src=":/<id>" ... alt="<text>"/> -> ![<text>](<id>)
	content = content.replace(/<img src="(:\/[0-9a-zA-Z]{32})"[^/]*alt="([^"]*)"\/>/g, '![$2]($1)')
	// 不带 alt 的：<img src=":/<id>" ... /> -> ![](<id>)
	content = content.replace(/<img src="(:\/[0-9a-zA-Z]{32})"[^/]*\/>/g, '![]($1)')
	return content
}

// 引用是文件而不是笔记的，需要替换为文件路径
//   ![title](:/joplinid) -> ![title](assets/joplin/joplinid.ext)
//   ![](:/ce59e12258a70b03de83524c214f4fee)
//   [2021年happy上海之旅.pdf](:/b3f8548fc1cd95da5a926eb6d2c808b7)
async function replaceFileReferences(content: string): Promise<string> {
	// 收集所有 ](:/<id> 形式出现的 id，等价于
	//   grep -Eo ']\(:/[0-9a-zA-Z]{32}' "${file}" | cut -c5-
	const idRegex = /\]\((:\/[0-9a-zA-Z]{32})/g
	const ids = new Set<string>()
	let m: RegExpExecArray | null
	while ((m = idRegex.exec(content)) !== null) {
		// m[1] 为 ":/<id>"，去掉前两个字符得到 <id>
		ids.add(m[1].slice(2))
	}

	for (const id of ids) {
		const basename = await findAssetBasename(id)
		if (basename === null) continue
		const assetpath = ASSET_LINK_PREFIX + basename
		// 把所有 :/<id> 替换为 assetpath（等价于 sed -Ei "s_:/${joplinid}_${assetpath}_g"）
		content = content.split(':/' + id).join(assetpath)
	}
	return content
}

async function findAssetBasename(joplinid: string): Promise<string | null> {
  let fullPath = ""
  try {
    fullPath = await joplin.data.resourcePath(joplinid)
  } catch {
    return null
  }
	return path.basename(fullPath)
}

// [title](:/joplinid) -> [[title]]
function convertNoteReferences(content: string): string {
  return content.replace(/(?<=!)\[([^\]]+)\]\(:\/[0-9a-zA-Z]{32}\)/g, '[[$1]]')
}

// [[123 title/abc]] -> [[123 title_abc]]
function safeWikiLinkName(content: string): string {
	const wikiLinkRegex = /\[\[[^\]]+\]\]/g
	const wikiLinks = new Set<string>()
	let m: RegExpExecArray | null
	while ((m = wikiLinkRegex.exec(content)) !== null) {
		wikiLinks.add(m[0])
	}

	for (const link of wikiLinks) {
    const safeLink = link.replace('/', '_')
    if (link === safeLink) {
      continue
    }
		content = content.split(link).join(safeLink)
	}
	return content
}

async function adjustBody(body: string): Promise<string> {
	body = convertImgTags(body)
	body = await replaceFileReferences(body)
	body = convertNoteReferences(body)
	body = safeWikiLinkName(body)
  return body
}
