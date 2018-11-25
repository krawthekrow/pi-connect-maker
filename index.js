const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const toArray = require('stream-to-array');
const stream = require('stream');
const request = require('request').defaults({encoding: null});
const sharp = require('sharp');

// For testing
const WRITE_DIRECT = false;

const gameData = {
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
		request.get(url, (err, resp, body) => {
			sharp(Buffer.from(body))
			.resize(256, 256, {
				fit: 'inside'
			}).toBuffer().then((data) => {
				fs.writeFileSync(filepath,
					'data:' + resp.headers['content-type'] +
					';base64,' + data.toString('base64'));
				returnFile();
			});
		});
	});
}

function getLocalImage(url) {
	return new Promise((resolve, reject) => {
		sharp(Buffer.from(fs.readFileSync(url)))
		.resize(256, 256, {
			fit: 'inside'
		}).toBuffer().then((data) => {
			resolve('data:image/png;base64,' + data.toString('base64'));
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
		new ffmpeg(ytdl(url))
		.setStartTime(start).setDuration(duration)
		.on('end', () => {
			returnFile();
		})
		.saveToFile(filepath);
	});
}

async function parseFile() {
	src = fs.readFileSync('in.txt', 'utf-8').split('\n');
	let stage = 'start';
	let index = -1, subindex = 3;
	let substage = -1;
	for (let i = 0; i < src.length; i++) {
		if (src[i].startsWith('#'))
			continue;
		if (src[i].trim() == '')
			continue;
		if (src[i].startsWith('!')) {
			const cmd = src[i].slice(1).trim();
			if (stage == 'start' && cmd == 'connections' && index == -1) {
				stage = 'connections';
			}
			else if (stage == 'connections' && cmd == 'sequences' &&
					index == 5) {
				stage = 'sequences';
			}
			else if (stage == 'sequences' && cmd == 'walls' && index == 5) {
				stage = 'walls';
			}
			else if (stage == 'walls' && cmd == 'vowels' && index == 7) {
				stage = 'vowels';
			}
			else
				throw new Error(`unrecognized command ${cmd} after stage ${stage} at line ${i}`);
			subindex = 3;
			index = -1;
			continue;
		}
		if (src[i].startsWith('-')) {
			const desc = src[i].slice(1).trim();
			if (stage == 'connections' && subindex == 3 && substage == -1)
				gameData.connections.push({
					solution: desc,
					data: []
				});
			else if (stage == 'sequences' && subindex == 3 && substage == -1)
				gameData.sequences.push({
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
			}
			else if (stage == 'vowels' && subindex == 3 && substage == -1)
				gameData.vowels.push({
					desc: desc,
					data: []
				});
			else
				throw new Error(`unexpected item at stage ${stage}, subindex ${subindex}, substage ${substage} at line ${i}`);
			subindex = -1;
			index++;
			continue;
		}
		if (stage == 'connections' || stage == 'sequences') {
			if (substage == -1) {
				subindex++;
				if (src[i].startsWith('https://www.youtube.com/')) {
					substage = 0;
					const parts = src[i].trim().split(' ');
					const duration =
						(parts.length >= 3) ? parseInt(parts[2]) : 40;
					const start =
						(parts.length >= 2) ? parseInt(parts[1]) : 0;
					const url = await getAudio(parts[0], start, duration);
					gameData[stage][index].data.push({
						audio: url
					});
				}
				else if (src[i].startsWith('https://') || src[i].startsWith('http://')) {
					substage = 0;
					const url = await getImage(src[i].trim());
					gameData[stage][index].data.push({
						image: url
					});
				}
				else if (src[i].startsWith('images/')) {
					substage = 0;
					const url = await getLocalImage(src[i].trim());
					gameData[stage][index].data.push({
						image: url
					});
				}
				else {
					gameData[stage][index].data.push({
						text: src[i].trim()
					});
					substage = -1;
				}
			}
			else {
				gameData[stage][index].data[subindex].text = src[i].trim();
				substage = -1;
			}
		}
		else if (stage == 'walls') {
			subindex++;
			gameData.walls[Math.floor(index / 4)].groups[index % 4].data.push(
				src[i]
			);
		}
		else if (stage == 'vowels') {
			subindex++;
			gameData.vowels[index].data.push(
				src[i]
			);
		}
		else
			throw new Error(`unknown stage ${stage} at line ${i}`);
	}
	const jsonData = JSON.stringify(gameData);
	if (WRITE_DIRECT)
		fs.writeFileSync('../pi-connect/src/js/test.js', 'export default ' + jsonData);
	fs.writeFileSync('out.json', jsonData);
}
parseFile();
