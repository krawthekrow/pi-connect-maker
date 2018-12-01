Helper script to construct a game file for [pi-connect](https://krawthekrow.github.io/pi-connect/). Read the README in the [pi-connect repository](https://github.com/krawthekrow/pi-connect) for documentation on how to run a game. This README only explains how to use the game creator.

Documentation
=============

You will need the latest stable version of Node and ffmpeg to run this script.

__Important note__: pi-connect-maker uses async/await, which is a very new language feature. The version of Node provided by your package manager is probably outdated and thus would not support this feature. The easiest way to get the latest stable version of Node is by following the instructions [here](https://nodejs.org/en/download/package-manager/).

__For non-programmers on Windows__: You'll need to install the latest (probably 64-bit) versions of Git, Python 2, Node and ffmpeg, and you'll have to add Python and ffmpeg to your path. To check that you have everything working, run the commands below, but with `copy in.txt.example in.txt` instead of `cp in.txt.example in.txt`

Quick start (for Linux):

```
git clone https://github.com/krawthekrow/pi-connect-maker.git
cd pi-connect-maker
npm install
cp in.txt.example in.txt
node index.js # call this to generate the JSON output
```

If any of the clues require images of your own creation (as opposed to ones downloaded from online), do `mkdir images` and save the images in PNG format in the `images` directory.

The game JSON will be written to `out.json`.

This script works by reading a specification file called `in.txt` in the same directory as `index.js`. It uses a non-standard format, but is designed to hopefully be intuitive. This documentation is intended only for clarity, and you can probably get a good picture much faster by looking at the example specification provided in `in.txt.example`.

Empty lines and lines starting with a hash (`#`) are ignored.

The specification file contains four main sections, delimited by the following lines:

```
!connections
!sequences
!walls
!vowels
```

Within each section, a puzzle is delimited by a line beginning with a hyphen (`-`). The text following the hyphen is the solution for that clue. There must be exactly six connections puzzles, exactly six sequences puzzles, exactly eight wall puzzles (four per wall, they will be grouped in the order that they are specified) and any number of vowels puzzles. The puzzle data follows the hyphened line.

Connections and Seqeunces
-------------------------

Connections and sequences share the same format: a list of exactly four clues. The fourth clue in a sequences puzzle serves as the solution. There are two kinds of clues: text clues, which span a single line, and complex clues, which span two lines. In a complex clue, the second line is the text that shows when the solution is revealed.

What a line starts with determines the kind of clue it is.

- If it starts with `https://www.youtube.com/`, then it is a music clue. An audio clip will be downloaded from the URL specified. Optionally, you can place one or two integers after the URL, separated by spaces, indicating the start time and duration (in that order) in seconds. In game, if the players listen to the music for more than the specified duration, it will just loop.
- If it starts with `https://` or `http://` and isn't a music clue, then it is a picture clue, and the image will be downloaded from the URL.
- If it starts with `images/` (for example, `images/clue.png`), then it is a picture clue. The image will be taken from your own computer, in the `images` folder (you'll have to create one yourself with `mkdir images` in the same directory as `index.js`). It must be a PNG because I've had no reason to support multiple formats.
- Otherwise, it is a text clue, and the content of the line will be the clue itself.

The four clues in a puzzle do not have to be of the same type.

Walls
-----

The first four puzzles in the walls section will be used for one wall, and the next four puzzles will be used for the other. Each puzzle contains exactly four lines for the four clues corresponding to that category. In total, this gives four puzzles with four clues for each wall, and you get the sixteen words.

Vowels
------

For vowels, the text after the hyphen will be the category that is shown on screen. Each puzzle contains exactly four lines of text (vowels included), corresponding to the four questions in that category. The text in the line will be shown as-is when the solution is revealed.
