# Higawari

> 日替わり (higawari) - daily special (e.g. meal)

Higawari is a Discord bot for organizing challenges, i.e. translation challenges. Participants submit answers to the bot in DM, then the bot publishes the answers in the specified server channel shuffled and without names.

# Requirements

* Node.js 8+
* MongoDB

# Installation

```sh
npm install -g higawari
```

# Usage

Higawari uses environment variables for configuration.

* `HIGAWARI_TOKEN` - bot token
* `HIGAWARI_MOD_CH` - mod channel ID
* `HIGAWARI_CH_CH` - challenge channel ID where results are published
* `HIGAWARI_DB_URI` - MongoDB URI

```
HIGAWARI_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.ccccccccccccccccccccccccccc HIGAWARI_MOD_CH=000000000000000000 HIGAWARI_CH_CH=000000000000000000 HIGAWARI_DB_URI=mongodb://localhost:27017/higawari higawari
```

If configured correctly `>help` command in the mod channel will print help.

# License

The MIT License (MIT)

Copyright (c) 2017-present, Alexey Komarov <alex7kom@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
