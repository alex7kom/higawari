#!/usr/bin/env node

const Discord = require('discord.js');
const MongoClient = require('mongodb').MongoClient;
const shuffle = require('lodash.shuffle');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

const i18n = require('./lib/i18n');

let guildId;
const isDebug = Boolean(process.env.NODE_ENV !== 'production');
const dbUri = process.env.HIGAWARI_DB_URI;
const token = process.env.HIGAWARI_TOKEN;
const moderationChannel = process.env.HIGAWARI_MOD_CH;
const challengeChannel = process.env.HIGAWARI_CH_CH;

const getText = i18n(process.env.HIGAWARI_LOCALE);

const delimeter = '=======================\n';

const Status = {
  RESET: 0,
  STARTED: 1,
  STOPPED: 2
};

const ModCommands = {
  HELP: '>help',
  START: '>start',
  STOP: '>stop',
  CURRENT: '>current',
  RESET: '>reset',
  FORCE_RESET: '>force reset, please. i understand the consequences',
  PUBLISH: '>publish'
};

const UserCommands = {
  SUBMIT: 'submit',
  SKIP: 'skip'
};

const statusActions = [];

statusActions[Status.RESET] = {
  [ModCommands.START]: startChallenge,
  [ModCommands.STOP]: sendNoActiveChallenge,
  [ModCommands.CURRENT]: sendNoActiveChallenge,
  [ModCommands.RESET]: sendNoActiveChallenge,
  [ModCommands.FORCE_RESET]: sendNoActiveChallenge,
  [ModCommands.PUBLISH]: sendNoActiveChallenge
};

statusActions[Status.STARTED] = {
  [ModCommands.START]: sendAlreadyStarted,
  [ModCommands.STOP]: stopChallenge,
  [ModCommands.CURRENT]: outputCurrent,
  [ModCommands.RESET]: sendResetActiveChallenge,
  [ModCommands.FORCE_RESET]: resetChallenge,
  [ModCommands.PUBLISH]: sendStopFirst
};

statusActions[Status.STOPPED] = {
  [ModCommands.START]: sendNotPublished,
  [ModCommands.STOP]: sendAlreadyStopped,
  [ModCommands.CURRENT]: outputCurrent,
  [ModCommands.RESET]: sendResetActiveChallenge,
  [ModCommands.FORCE_RESET]: resetChallenge,
  [ModCommands.PUBLISH]: publishEntries
};

let dbEntries, dbState, dbUsers;

let state = {
  currentId: null,
  status: Status.RESET,
  parts: 2
};

const logFormat = printf(({ level, message, timestamp }) => {
  const printedMessage = typeof message === 'string'
    ? message
    : JSON.stringify(message);

  return `${timestamp} [${level}]: ${printedMessage}`;
});

const logger = createLogger({
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new transports.Console({ level: isDebug ? 'debug' : 'error' })
  ]
});

const client = new Discord.Client();

MongoClient
  .connect(dbUri, { useUnifiedTopology: true })
  .then(handleDbConnection)
  .catch(handleUncaughtExceptions);

client.on('ready', handleClientReady);
client.on('debug', logger.debug.bind(logger));
client.on('message', handleDirectMessage);
client.on('message', handleModMessage);
client.on('raw', handleMessageDeletion);
process.on('uncaughtException', handleUncaughtExceptions);

function handleDbConnection (dbClient) {
  logger.debug('connected to db');

  const db = dbClient.db();

  dbUsers = db.collection('users');
  dbEntries = db.collection('entries');
  dbState = db.collection('state');

  return initBot();
}

async function initBot () {
  const stateEntry = await dbState.findOne(
    { _id: 'state' },
    {
      projection: { _id: 0 }
    }
  );

  if (stateEntry) {
    state = Object.assign({}, state, stateEntry);
    logger.debug(state);
  } else {
    logger.debug('no state found');
  }

  await client.login(token);
}

function handleClientReady () {
  logger.info(`Logged in as ${client.user.tag}!`);

  guildId = client.channels.get(challengeChannel).guild.id;

  updateStatus();
}

async function handleDirectMessage (msg) {
  // ignore bots
  if (msg.author.bot) {
    return;
  }

  // ignore guild messages
  if (msg.guild) {
    return;
  }

  // ignore non-members
  if (!client.guilds.get(guildId).members.get(msg.author.id)) {
    return;
  }

  if (msg.attachments.size > 0) {
    msg.reply(getText('replyNoAttachments'));

    return;
  }

  try {
    if (state.status !== Status.STARTED) {
      return await msg.reply(getText('replyNoChallenge'));
    }

    const command = msg.content.trim().toLowerCase();

    const query = {
      challengeId: state.currentId,
      userId: msg.author.id
    };

    const displayName = client.guilds
      .get(guildId).members
      .get(msg.author.id).displayName;

    const user = await dbUsers.findOne(query);

    if (
      (!user && command !== UserCommands.SUBMIT)
      || (user && user.part === 0 && command !== UserCommands.SUBMIT)
    ) {
      if (state.parts === 1) {
        await msg.reply(getText('replyHelp'));
      } else {
        await msg.reply(getText('replyHelpMultipart', { parts: state.parts }));
      }

      return;
    } else if (command === UserCommands.SUBMIT) {
      await saveUser(query, {
        part: 1,
        displayName: displayName
      });

      if (state.parts === 1) {
        await msg.reply(getText('replyAnswer'));
      } else {
        await msg.reply(getText('replyAnswerMultipart', { part: 1 }));
      }

      updateStatus();

      return;
    } else if (user.part > 0) {
      const isLastPart = user.part === state.parts;
      const nextPart = user.part + 1;
      const isSkipped = command === UserCommands.SKIP;

      if (!isSkipped) {
        await saveEntry(
          Object.assign({
            part: user.part
          }, query),
          {
            content: msg.content,
            submittedAt: new Date()
          }
        );
      }

      await saveUser(query, {
        part: isLastPart ? 0 : nextPart
      });

      updateStatus();

      if (isLastPart) {
        await msg.reply(
          (isSkipped ? '' : getText('replyThanks') + ' ')
          + getText('replyFinish')
        );
        outputCurrentAnswer(msg, query);
      } else {
        await msg.reply(
          (isSkipped ? '' : getText('replyThanks') + ' ')
          + getText('replyAnswerMultipart', { part: nextPart })
        );
      }

      return;
    }
  } catch (err) {
    logger.error(err);
    msg.reply(getText('replyError'));
  }
}

function handleModMessage (msg) {
  // ignore bots
  if (msg.author.bot) {
    return;
  }

  // ignore messages outside the mod channel
  if (msg.channel.id !== moderationChannel) {
    return;
  }

  const parts = getCommandParts(msg.content);

  if (parts[0] === ModCommands.HELP) {
    return sendHelp();
  }

  if (
    typeof statusActions[state.status][msg.content] === 'function'
    && statusActions[state.status][msg.content].length === 0
  ) {
    statusActions[state.status][msg.content]();
  } else if (typeof statusActions[state.status][parts[0]] === 'function') {
    statusActions[state.status][parts[0]](parts);
  }
}

async function handleMessageDeletion (ev) {
  // ignore other events
  if (ev.t !== 'MESSAGE_DELETE') {
    return;
  }

  // ignore events outside the mod channel
  if (ev.d.channel_id !== moderationChannel) {
    return;
  }

  try {
    await dbEntries.updateOne({
      messageId: ev.d.id
    }, {
      $set: {
        removed: true
      }
    });
  } catch (err) {
    logger.error(err);
  }
}

function sendHelp () {
  sendMessage(moderationChannel, getText('help'));
}

function startChallenge (messageParts) {
  const newState = {
    status: Status.STARTED,
    currentId: Date.now()
  };

  const parts = parseInt(messageParts[1], 10);

  if (parts > 0) {
    newState.parts = parts;
  } else {
    sendMessage(moderationChannel, getText('specifyParts'));

    return;
  }

  try {
    saveState(newState);

    sendMessage(moderationChannel, getText('startedMod', {
      num: newState.parts
    }));
    sendMessage(challengeChannel, getText('started'));
  } catch (err) {
    logger.error(err);
  }
}

function sendNoActiveChallenge () {
  sendMessage(moderationChannel, getText('noActiveChallenge'));
}

function sendAlreadyStarted () {
  sendMessage(moderationChannel, getText('alreadyStarted'));
}

async function stopChallenge () {
  saveState({
    status: Status.STOPPED
  });

  sendMessage(challengeChannel, getText('stopped'));
  sendMessage(moderationChannel, getText('stoppedMod'));

  const modChannel = client.channels.get(moderationChannel);

  try {
    for (let i = 1; i <= state.parts; i++) {
      await outputAnswers(modChannel, i, true);
    }
  } catch (err) {
    logger.error(err);
  }
}

async function outputCurrent () {
  const modChannel = client.channels.get(moderationChannel);

  try {
    for (let i = 1; i <= state.parts; i++) {
      await outputAnswers(modChannel, i);
    }
  } catch (err) {
    logger.error(err);
  }
}

function sendResetActiveChallenge () {
  sendMessage(moderationChannel, getText('resetActiveChallenge'));
}

function resetChallenge () {
  saveState({
    status: Status.RESET,
    currentId: null
  });

  sendMessage(moderationChannel, getText('reset'));
}

function sendStopFirst () {
  sendMessage(moderationChannel, getText('stopFirst'));
}

function sendNotPublished () {
  sendMessage(moderationChannel, getText('notPublished'));
}

function sendAlreadyStopped () {
  sendMessage(moderationChannel, getText('alreadyStopped'));
}

async function publishEntries () {
  try {
    const chChannel = client.channels.get(challengeChannel);

    await chChannel.send(getText('results'));

    for (let i = 1; i <= state.parts; i++) {
      await publishAnswers(chChannel, i);
    }

    saveState({
      status: Status.RESET
    });
  } catch (err) {
    logger.error(err);
  }
}

async function updateStatus () {
  try {
    if (state.status !== Status.STARTED) {
      return await client.user.setPresence({
        game: {
          name: getText('statusIdle'),
          type: 0
        }
      });
    }

    const distinctEntries = await dbEntries.distinct('userId', {
      challengeId: state.currentId
    });

    const subs = getText('statusSubmissions', {
      count: distinctEntries.length
    });

    await client.user.setPresence({
      game: {
        name: subs,
        type: 0
      }
    });
  } catch (err) {
    logger.error(err);
  }
}

async function saveState (props) {
  state = Object.assign({}, state, props);
  await dbState.updateOne(
    { _id: 'state' },
    { $set: state },
    { upsert: true }
  );

  updateStatus();
}

function saveUser (query, data) {
  return dbUsers.updateOne(query, {
    $set: data
  }, {
    upsert: true
  });
}

function saveEntry (query, data) {
  return dbEntries.updateOne(query, {
    $set: data
  }, {
    upsert: true
  });
}

async function outputCurrentAnswer (msg, query) {
  try {
    await msg.reply(delimeter + getText('replyTitle'));

    const entries = await dbEntries.find(query).toArray();

    sortEntries(entries);

    for (let i = 0; i < entries.length; i++) {
      if (state.parts > 1) {
        await msg.reply(
          delimeter + getText('replyTitleMultipart', { part: entries[i].part })
        );
      }
      await msg.reply(delimeter + entries[i].content);
    }
  } catch (err) {
    logger.error(err);
    await msg.reply(getText('replyError'));
  }
}

async function outputAnswers (modChannel, part, saveId = false) {
  await modChannel.send(getText('answerTitle', { num: part }));

  const entries = await dbEntries.find({
    challengeId: state.currentId,
    part: part
  }).toArray();

  if (entries.length === 0) {
    return sendMessage(moderationChannel, getText('noSubmissions'));
  }

  for (let i = 0; i < entries.length; i++) {
    const msg = await modChannel.send(delimeter + entries[i].content);
    if (saveId) {
      await dbEntries.updateOne({
        _id: entries[i]._id
      }, {
        $set: {
          messageId: msg.id
        }
      });
    }
  }
}

async function publishAnswers (chChannel, part) {
  const entries = await dbEntries.find({
    challengeId: state.currentId,
    part: part,
    removed: { $ne: true }
  }).toArray();

  await chChannel.send(getText('answerTitle', { num: part }));

  if (entries.length === 0) {
    return await chChannel.send(delimeter + getText('noSubmissions'));
  }

  const shuffled = shuffle(entries);

  for (let i = 0; i < shuffled.length; i++) {
    await chChannel.send(delimeter + (i + 1) + '. ' + shuffled[i].content);
  }
}

function sendMessage (channelId, msg) {
  client.channels.get(channelId)
    .send(msg)
    .catch(handleError);
}

function getCommandParts (text) {
  return text.trim()
    .toLowerCase()
    .split(/\s+/);
}

function sortEntries (entries) {
  entries.sort((entryA, entryB) => {
    if (entryA.part < entryB.part) {
      return -1;
    }
    if (entryA.part > entryB.part) {
      return 1;
    }

    return 0;
  });
}

function handleError (err) {
  logger.error(err);
}

function handleUncaughtExceptions (err) {
  logger.error(err);
  process.exit();
}
