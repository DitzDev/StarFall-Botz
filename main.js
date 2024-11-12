(async () => {
    require('./system/settings');
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        makeInMemoryStore,
        makeCacheableSignalKeyStore,
        DisconnectReason,
        fetchLatestBaileysVersion,
        PHONENUMBER_MCC,
        Browsers,
        proto,
        jidNormalizedUser,
    } = require('baileys');

    const WebSocket = require('ws');
    const path = require('path');
    const pino = require('pino');
    const { Boom } = require('@hapi/boom');
    const fs = require('fs');
    const chokidar = require('chokidar');
    const readline = require('readline');
    const NodeCache = require('node-cache');
    const yargs = require('yargs/yargs');
    const cp = require('child_process');
    const { promisify } = require('util');
    const exec = promisify(cp.exec).bind(cp);
    const _ = require('lodash');
    const syntaxerror = require('syntax-error');
    const spinnies = new (require('spinnies'))();
    const os = require('os');
    const simple = require('./lib/simple.js');
    const { randomBytes } = require('crypto');
    const moment = require('moment-timezone');
    const chalk = require('chalk');
    const readdir = promisify(fs.readdir);
    const stat = promisify(fs.stat);

    require('dotenv').config();

    let low;
    try {
        low = require('lowdb');
    } catch (e) {
        low = require('./lib/lowdb');
    }
    const { Low, JSONFile } = low;

    const randomID = (length) =>
        randomBytes(Math.ceil(length * 0.5))
            .toString('hex')
            .slice(0, length);

    const PORT = process.env.PORT || 3000;

    global.opts = yargs(process.argv.slice(2)).exitProcess(false).parse();
    global.prefix = new RegExp("^[" + (opts["prefix"] || ".#!🐼").replace(/[|\\{}()[\]^$+*?.\-]/g, "\\$&") + "]");

    db = new Low(
        /https?:\/\//.test(opts['db'] || '')
            ? new cloudDBAdapter(opts['db'])
            : new JSONFile(
                  `${opts._[0] ? opts._[0] + '_' : ''}${settings.dataname}`
              )
    );

    DATABASE = db;

    async function loadDatabase() {
        if (!db.READ) {
            setInterval(async () => {
                await db.write(db.data || {});
            }, 2000);
        }
        if (db.data !== null) return;
        db.READ = true;
        await db.read();
        db.READ = false;
        db.data = {
            users: {},
            chats: {},
            stats: {},
            msgs: {},
            sticker: {},
            openai: {},
            settings: {},
            respon: {},
            ...(db.data || {}),
        };
        db.chain = _.chain(db.data);
    }

    await loadDatabase();
    global.authFolder = settings.sessions;

    const logger = pino({
        timestamp: () => `,"time":"${new Date().toJSON()}"`,
    }).child({
        class: 'Kikuchanj',
    });
    logger.level = 'fatal';

    global.store = makeInMemoryStore({ logger });

    function createTmpFolder() {
        const folderName = 'tmp';
        const folderPath = path.join(__dirname, folderName);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
        }
    }

    createTmpFolder();

    const { state, saveState, saveCreds } = await useMultiFileAuthState(authFolder);
    const msgRetryCounterCache = new NodeCache();
    const { version } = await fetchLatestBaileysVersion();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (texto) =>
        new Promise((resolver) => rl.question(texto, resolver));

    store.readFromFile(process.cwd() + `/${global.authFolder}/store.json`);

    const connectionOptions = {
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !settings.use_pairing,
        browser: Browsers.ubuntu('Edge'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
            return proto.Message.fromObject({});
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    };

    global.sock = simple.makeWASocket(connectionOptions, store);
    store?.bind(sock?.ev);

    spinnies.add('start', {
        text: 'Connecting . . .'
    });

    if (settings.use_pairing && !sock.authState.creds.registered) {
        const phoneNumber = settings.pairing_number;        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.black(chalk.bgGreen(` Your Pairing Code `)), ' : ' + chalk.black(chalk.white(code)));
            } catch {}
        }, 3000);
    }

    async function connectionUpdate(update) {
        const { connection, lastDisconnect, isNewLogin } = update;
        global.stopped = connection;
        if (isNewLogin) sock.isInit = true;
        if (update.qr != 0 && update.qr != undefined) {}

        if (connection === 'open') {
            spinnies.succeed('start', {
                text: `Connected, you login as ${sock.user.name || sock.user.verifiedName || 'WhatsApp Bot'}`
            });
        }

        let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (connection === 'close') {
            if (reason === DisconnectReason.badSession) {
               spinnies.fail('start', {
               text: `Can't connect to Web Socket`
            })
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.connectionClosed) {
                sock.logger.warn(`Koneksi ditutup, menyambungkan kembali...`);
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.connectionLost) {
                sock.logger.warn(`Koneksi terputus `);
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.connectionReplaced) {
                sock.logger.error(`Koneksi terganti, harap untuk menunggu...`);
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.loggedOut) {
                sock.logger.error(
                    `Koneksi Logout, silakan hapus & buat sesi baru Anda`
                );
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(reloadHandler(true));
            } else if (reason === DisconnectReason.timedOut) {
                sock.logger.warn(`Waktu koneksi habis`);
                console.log(reloadHandler(true));
            } else {
                sock.logger.warn(
                    `Koneksi ditutup ${reason || ''}: ${connection || ''}`
                );
                console.log(reloadHandler(true));
            }
        }
    }

    process.on('uncaughtException', console.error);

    let isInit = true;
    let handler = require('./handler');

    function reloadHandler(restatConn) {
        let Handler = require('./handler');
        if (Object.keys(Handler || {}).length) handler = Handler;
        if (restatConn) {
            try {
                sock.ws.close();
            } catch {}
            sock = {
                ...sock,
                ...simple.makeWASocket(connectionOptions),
            };
        }
        if (!isInit) {
            sock.ev.off('messages.upsert', sock.handler);
            sock.ev.off('group-participants.update', sock.onParticipantsUpdate);
            sock.ev.off('connection.update', sock.connectionUpdate);
            sock.ev.off('creds.update', sock.credsUpdate);
        }
        sock.handler = handler.handler.bind(sock);
        sock.onParticipantsUpdate = handler.participantsUpdate.bind(sock);
        sock.connectionUpdate = connectionUpdate.bind(sock);
        sock.credsUpdate = saveCreds.bind(sock);
        sock.ev.on('messages.upsert', sock.handler);
        sock.ev.on('group-participants.update', sock.onParticipantsUpdate);
        sock.ev.on('connection.update', sock.connectionUpdate);
        sock.ev.on('creds.update', sock.credsUpdate);
        sock.ev.on('contacts.update', (update) => {
            for (let contact of update) {
                let id = jidNormalizedUser(contact.id);
                if (store && store.contacts) {
                    store.contacts[id] = {
                        ...(store.contacts?.[id] || {}),
                        ...(contact || {}),
                    };
                }
            }
        });
        sock.ev.on('contacts.upsert', (update) => {
            for (let contact of update) {
                let id = jidNormalizedUser(contact.id);
                if (store && store.contacts) {
                    store.contacts[id] = {
                        ...(contact || {}),
                        isContact: true,
                    };
                }
            }
        });
        sock.ev.on('groups.update', (updates) => {
            for (const update of updates) {
                const id = update.id;
                if (store.groupMetadata[id]) {
                    store.groupMetadata[id] = {
                        ...(store.groupMetadata[id] || {}),
                        ...(update || {}),
                    };
                }
            }
        });
        sock.ev.on('presence.update', (update) => {
          const { id, presences } = update;
          if (id.endsWith('g.us')) {
            for (let jid in presences) {
              if ((presences[jid].lastKnownPresence === 'composing' || presences[jid].lastKnownPresence === 'recording') && global.db.data.users[jid] && global.db.data.users[jid].afk > -1) {
                let presence = presences[jid].lastKnownPresence === 'composing' ? 'Mengetik' : 'Merekam';
                let secondsAfk = Math.floor((Date.now() - global.db.data.users[jid].afk) / 1000);
                let minutesAfk = Math.floor(secondsAfk / 60);
                let hoursAfk = Math.floor(minutesAfk / 60);
                let output;
                if (hoursAfk > 0) {
                  output = `${hoursAfk} Jam ${minutesAfk % 60} Menit ${secondsAfk % 60} Detik`;
                } else if (minutesAfk > 0) {
                  output = `${minutesAfk} Menit ${secondsAfk % 60} Detik`;
                } else if (secondsAfk > 0) {
                  output = `${secondsAfk} Detik`;
                }
                let caption = `${global.db.data.users[jid].afkReason ? `@${jid.replace(/@.+/, '')} sedang _${presence}_ dan telah kembali dari AFK, Setelah ${global.db.data.users[jid].afkReason}` : `@${jid.replace(/@.+/, '')} sedang _${presence}_ dan telah kembali dari AFK`}\n\n`
                caption += `Selama : ${output}`;
                sock.reply(id, caption, null);
                global.db.data.users[jid].afk = -1
                global.db.data.users[jid].afkReason = ''
              }
            }
          }
        });
        sock.ev.on('call', (update) => {
          let jid = update[0].chatId;
          sock.sendContact(jid, ['628816609112@s.whatsapp.net', 'Costumer Service']).then(() => sock.updateBlockStatus(jid, "block"))
        });
        isInit = false;
        return true;
    }

    global.plugins = {};

    async function Scandir(dir) {
        let subdirs = await readdir(dir);
        let files = await Promise.all(
            subdirs.map(async (subdir) => {
                let res = path.resolve(dir, subdir);
                return (await stat(res)).isDirectory() ? Scandir(res) : res;
            })
        );
        return files.reduce((a, f) => a.concat(f), []);
    }

    try {
        let files = await Scandir('./plugins');
        let plugins = {};
        for (let filename of files.map((a) => a.replace(process.cwd(), ''))) {
            try {
                plugins[filename] = require(path.join(process.cwd(), filename));
            } catch (e) {
                delete plugins[filename];
            }
        }
        const watcher = chokidar.watch(path.resolve('./plugins'), {
            persistent: true,
            ignoreInitial: true,
        });
        watcher
            .on('add', async (filename) => {
                console.log(chalk.green.bold('Plugin Baru Terdeteksi : ' + filename.replace(process.cwd(), '')));
                plugins[filename.replace(process.cwd(), '')] = require(filename);
            })
            .on('change', async (filename) => {
                if (require.cache[filename] && require.cache[filename].id === filename) {
                    plugins[filename.replace(process.cwd(), '')] = require.cache[filename].exports;
                    console.log(chalk.blue.bold('Perubahan kode pada Files : ' + filename.replace(process.cwd(), '')));
                    delete require.cache[filename];
                }
                let err = syntaxerror(fs.readFileSync(filename), filename.replace(process.cwd(), ''));
                if (err) {
                    sock.logger.error(`syntax error while loading '${filename}'\n${err}`);
                }
                plugins[filename.replace(process.cwd(), '')] = require(filename);
            })
            .on('unlink', (filename) => {
                console.log(chalk.yellow.bold('Sukses Hapus : ' + filename.replace(process.cwd(), '')));
                delete plugins[filename.replace(process.cwd(), '')];
            });
        plugins = Object.fromEntries(
            Object.entries(plugins).sort(([a], [b]) => a.localeCompare(b))
        );
        global.plugins = plugins;
    } catch (e) {}

    setInterval(async () => {
        if (store.groupMetadata)
            fs.writeFileSync(process.cwd() + `/${global.authFolder}/store-group.json`, JSON.stringify(store.groupMetadata));
        if (store.contacts)
            fs.writeFileSync(process.cwd() + `/${global.authFolder}/store-contacts.json`, JSON.stringify(store.contacts));
        store.writeToFile(process.cwd() + `/${global.authFolder}/store.json`);
    }, 10 * 1000);

    reloadHandler();
})();

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}