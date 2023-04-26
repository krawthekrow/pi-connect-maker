const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

let ytdl = null;
let ffmpeg = null;
let sharp = null;
function lazyLoadYtdl() {
	if (ytdl == null) {
		ytdl = require('ytdl-core');
	}
	return ytdl;
}
function lazyLoadFfmpeg() {
	if (ffmpeg == null) {
		ffmpeg = require('fluent-ffmpeg');
	}
	return ffmpeg;
}
function lazyLoadSharp() {
	if (sharp == null) {
		sharp = require('sharp');
	}
	return sharp;
}

// For testing
const WRITE_DIRECT = false;

const gameData = {
	meta: {},
	connections: [],
	sequences: [],
	walls: [],
	vowels: []
};

const cacheDir = './cache';
if (!fs.existsSync(cacheDir))
	fs.mkdirSync(cacheDir);

function getImage(url) {
	return new Promise((resolve, reject) => {
		const hash = url.replace(/\//g, '-');
		const filepath = path.join(cacheDir, hash);
		function returnFile() {
			const res = fs.readFileSync(filepath, 'utf-8');
			resolve(res);
		}
		if (fs.existsSync(filepath)) {
			console.log(`[image] using cached copy of ${url}: ${filepath}`);
			returnFile();
			return;
		}
		console.log(`[image] downloading from ${url}`);
		const resizeAndReturn = (buf, contentType) => {
			lazyLoadSharp()(buf)
			.resize(256, 256, {
				fit: 'inside'
			}).toBuffer().then((data) => {
				fs.writeFileSync(filepath,
					'data:' + contentType +
					';base64,' + data.toString('base64'));
				returnFile();
			}).catch(err => {
				reject(err);
			});
		};
		(url.startsWith('https') ? https : http).get(url, {
			'headers': {
				'User-Agent': 'pi-connect-maker/0.0 (https://github.com/krawthekrow/pi-connect-maker)'
			}
		}, resp => {
			const data = [];
			resp.on('data', (chunk) => {
				data.push(chunk);
			}).on('end', () => {
				resizeAndReturn(Buffer.concat(data), resp.headers['content-type']);
			}).on('error', (err) => {
				reject(`failed to download image from ${url} with error "${err}"`);
			});
		});
	});
}

function getLocalImage(url) {
	return new Promise((resolve, reject) => {
		let data;
		try {
			data = fs.readFileSync(url);
		} catch (err) {
			reject(`failed to read image from ${url} with error "${err}"`);
			return;
		}
		lazyLoadSharp()(Buffer.from(data))
		.resize(256, 256, {
			fit: 'inside'
		}).toBuffer().then((data) => {
			resolve('data:image/png;base64,' + data.toString('base64'));
		}).catch(err => {
			reject(err);
		});
	});
}

function getAudio(url, start, duration) {
	return new Promise((resolve, reject) => {
		const hash = start.toString() + '-' + duration.toString() + '-' +
			url.replace(/\//g, '-');
		const filepath = path.join(cacheDir, `${hash}.mp3`);
		function returnFile() {
			const res = 'data:audio/mp3;base64,' +
				Buffer.from(fs.readFileSync(filepath))
				.toString('base64');
			resolve(res);
		}
		if (fs.existsSync(filepath)) {
			console.log(`[audio] using cached copy of ${url}: ${filepath}`);
			returnFile();
			return;
		}
		console.log(`[audio] downloading from ${url}`);
		new lazyLoadFfmpeg()(lazyLoadYtdl()(url, {
			filter: (format) => {
				return format.hasAudio;
			},
		}))
		.setStartTime(start).setDuration(duration)
		.on('error', (err) => {
			reject(err);
		})
		.on('end', () => {
			returnFile();
		})
		.saveToFile(filepath);
	});
}

function getLocalAudio(url, start, duration) {
	return new Promise((resolve, reject) => {
		const hash = start.toString() + '-' + duration.toString() + '-' +
			url.replace(/\//g, '-');
		const filepath = path.join(cacheDir, `${hash}.mp3`);
		function returnFile() {
			const res = 'data:audio/mp3;base64,' +
				Buffer.from(fs.readFileSync(filepath))
				.toString('base64');
			resolve(res);
		}
		console.log(`[audio] processing ${url}`);
		new lazyLoadFfmpeg()(url)
		.setStartTime(start).setDuration(duration)
		.on('end', () => {
			returnFile();
		})
		.on('error', (err) => {
			reject(err);
		})
		.saveToFile(filepath);
	});
}

function parseTextClue(line) {
	return line.startsWith('`') ? line.slice(1) : line.trim();
}

async function parseMultimediaClue(lineno, line) {
	if (line.startsWith('`'))
		return {
			text: line.slice(1)
		};

	const isRemoteAudio =
		line.startsWith('https://www.youtube.com/');
	const isLocalAudio = line.startsWith('audio/');
	function throwError(err) {
		throw new Error(`Error at in.txt line ${lineno+1}: ${err}`);
	}
	if (isRemoteAudio || isLocalAudio) {
		const parts = line.trim().split(' ');
		const duration =
			(parts.length >= 3) ? parseInt(parts[2]) : 40;
		const start =
			(parts.length >= 2) ? parseInt(parts[1]) : 0;
		if (isNaN(start))
			throwError(`audio start offset should be an integer`);
		if (isNaN(duration))
			throwError(`audio duration should be an integer`);
		let url;
		try {
			url = await (isRemoteAudio
				? getAudio(parts[0], start, duration)
				: getLocalAudio(parts[0], start, duration));
		} catch (err) {
			throwError(err);
		}
		return {
			audio: url
		};
	}
	else if (line.startsWith('https://') || line.startsWith('http://')) {
		let url;
		try {
			url = await getImage(line.trim());
		} catch (err) {
			throwError(err);
		}
		return {
			image: url
		};
	}
	else if (line.startsWith('images/')) {
		let url;
		try {
			url = await getLocalImage(line.trim());
		} catch (err) {
			throwError(err);
		}
		return {
			image: url
		};
	}
	else if (line.startsWith('__html:')) {
		return {
			html: line.slice('__html:'.length).trim(),
		};
	}
	else {
		return {
			text: parseTextClue(line)
		};
	}
}

async function parseFile() {
	src = fs.readFileSync('in.txt', 'utf-8').split('\n');
	let stage = 'start';
	let index = -1, subindex = 3;
	let substage = -1;
	let lineno = 0;
	function throwError(err) {
		throw new Error(`Error at in.txt line ${lineno+1}: ${err}`);
	}
	function checkEndPuzzle() {
		if (substage != -1)
			throwError(`incomplete clue, did you forget to provide a solution?`);
		if (subindex != 3)
			throwError(`incorrect number of clues in previous puzzle, expected 4, got ${subindex + 1}`);
	}
	for (; lineno < src.length; lineno++) {
		if (src[lineno].startsWith('#'))
			continue;
		if (src[lineno].trim() == '')
			continue;
		if (src[lineno].startsWith('!')) {
			const cmd = src[lineno].slice(1).trim();
			const spaceIndex = cmd.indexOf(' ');
			const opcode = (spaceIndex == -1) ? cmd : cmd.slice(0, spaceIndex);
			const params = (spaceIndex == -1) ? '' : cmd.slice(spaceIndex + 1);

			// special opcodes
			if (opcode == 'wall_life_token') {
				if (stage != 'start') {
					throwError(`customization commands should be placed at the beginning of the file`);
				}
				const token = await parseMultimediaClue(lineno, params);
				if ('audio' in token)
					throwError(`audio can't be used as a life token`);
				if ('wallLifeToken' in gameData.meta)
					throwError(`custom wall life token already defined`);
				gameData.meta.wallLifeToken = token;
				continue;
			}

			checkEndPuzzle();
			if (stage == 'start') {
				if (cmd != 'connections')
					throwError(`connections stage should come first`);
				if (index != -1)
					throwError(`wrong puzzle index`);
				stage = 'connections';
			} else if (stage == 'connections') {
				if (cmd != 'sequences')
					throwError(`connections stage should be followed by sequences`);
				if (index != 5)
					throwError(`too few puzzles in connections stage, expected 6, got ${index+1}`);
				stage = 'sequences';
			} else if (stage == 'sequences') {
				if (cmd != 'walls')
					throwError(`sequences stage should be followed by walls`);
				if (index != 5)
					throwError(`too few puzzles in sequences stage, expected 6, got ${index+1}`);
				stage = 'walls';
			} else if (stage == 'walls') {
				if (cmd != 'vowels')
					throwError(`walls stage should be followed by vowels`);
				if (index != 7)
					throwError(`too few groups in the walls stage, expected 8, got ${index+1}`);
				stage = 'vowels';
			} else if (stage == 'vowels')
				throwError(`nothing should come after vowels stage`);
			else
				throwError(`unrecognized stage ${stage}`);
			subindex = 3;
			index = -1;
			continue;
		}
		if (stage == 'start')
			throwError(`file should start with "!connections" to denote start of connections section`);
		if (src[lineno].startsWith('-')) {
			const desc = src[lineno].slice(1).trim();
			checkEndPuzzle();
			if (stage == 'connections' || stage == 'sequences')
				gameData[stage].push({
					solution: desc,
					data: []
				});
			else if (stage == 'walls') {
				if (index == -1 || index == 3)
					gameData.walls.push({
						groups: [{
							solution: desc,
							data: []
						}]
					});
				else
					gameData.walls[Math.floor(index / 4)].groups.push({
						solution: desc,
						data: []
					});
			} else if (stage == 'vowels') {
				gameData.vowels.push({
					desc: desc,
					data: []
				});
			} else
				throwError(`unexpected puzzle at stage ${stage}, subindex ${subindex}, substage ${substage}`);
			subindex = -1;
			index++;
			if ((stage == 'connections' || stage == 'sequences')
					&& index >= 6)
				throwError(`too many puzzles in ${stage} stage, expected 6`);
			if (stage == 'walls' && index >= 8)
				throwError(`too many groups in walls stage, expected 8`);
			continue;
		}
		if (index == -1)
			throwError(`puzzle should start with a solution or category (line beginning with a dash)`);

		// once a clue has a text/html element, it is considered
		// complete and we can proceed to the next clue
		const isClueComplete = (clue) => {
			return 'text' in clue || 'html' in clue;
		};

		if (stage == 'connections' || stage == 'sequences') {
			if (substage == -1) {
				subindex++;
				const clue = await parseMultimediaClue(lineno, src[lineno]);
				gameData[stage][index].data.push(clue);
				substage = isClueComplete(clue) ? -1 : 0;
			}
			else {
				const clue = await parseMultimediaClue(lineno, src[lineno]);
				if (!isClueComplete(clue))
					throwError(`incomplete clue, did you forget to provide a solution?`);
				gameData[stage][index].data[subindex].text = clue.text;
				substage = -1;
			}
		}
		else if (stage == 'walls') {
			subindex++;
			const clue = await parseMultimediaClue(lineno, src[lineno]);
			if ('audio' in clue)
				throwError(`audio not supported in walls`);
			gameData.walls[Math.floor(index / 4)].groups[index % 4].data.push(
				clue
			);
		}
		else if (stage == 'vowels') {
			if (substage == -1) {
				subindex++;
				if (src[lineno].startsWith('=')) {
					gameData.vowels[index].data.push({
						clue: parseTextClue(src[lineno].slice(1))
					});
					substage = 0;
				}
				else {
					gameData.vowels[index].data.push({
						solution: parseTextClue(src[lineno])
					});
				}
			}
			else {
				gameData.vowels[index].data[subindex].solution =
					parseTextClue(src[lineno]);
				substage = -1;
			}
		}
		else
			throwError(`unknown stage ${stage}`);
	}
	checkEndPuzzle();
	const jsonData = JSON.stringify(gameData);
	if (WRITE_DIRECT)
		fs.writeFileSync('../pi-connect/src/js/test.js', 'export default ' + jsonData);
	fs.writeFileSync('out.json', jsonData);
}
parseFile().catch((err) => {
	console.error(err);
	console.error('\u001b[1m\u001b[31m' + err.message + '\x1b[0m');
});
