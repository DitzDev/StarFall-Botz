const simple = require("./lib/simple.js");
const util = require("util");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const chalk = require("chalk");
const { jidNormalizedUser } = require("baileys");

module.exports = {
  async handler(chatUpdate) {
    if (global.db.data == null) await loadDatabase();
    this.msgqueque = this.msgqueque || [];

    let m = chatUpdate.messages[chatUpdate.messages.length - 1];
    if (!m) return;
    if (m.message?.viewOnceMessageV2)
      m.message = m.message.viewOnceMessageV2.message;
    if (m.message?.documentWithCaptionMessage)
      m.message = m.message.documentWithCaptionMessage.message;
    if (m.message?.viewOnceMessageV2Extension)
      m.message = m.message.viewOnceMessageV2Extension.message;
    if (!m) return;
    try {
      m = simple.smsg(this, m) || m;
      if (!m) return;
      m.exp = 0;
      m.limit = false;
      try {
        require("./lib/database.js")(m);
      } catch (e) {
        console.error(e);
      }
      const isROwner = [
        sock.decodeJid(global.sock.user.id),
        ...global.owner.map((a) => a + "@s.whatsapp.net"),
      ].includes(m.sender);
      const isOwner = isROwner || m.fromMe;
      const isMods = global.db.data.users[m.sender].moderator;
      const isPrems = global.db.data.users[m.sender].premium;
      const isBans = global.db.data.users[m.sender].banned;
      ///const isWhitelist = global.db.data.chats[m.chat].whitelist;
      if (m.isGroup) {
        let member = await (
          await store.fetchGroupMetadata(m.chat, sock)
        ).participants.map((a) => a.id);
        db.data.chats[m.chat].member = member;
        db.data.chats[m.chat].chat += 1;
      }
      if (isROwner) {
        db.data.users[m.sender].premium = true;
        db.data.users[m.sender].limit = "UNLIMITED";
        db.data.users[m.sender].moderator = true;
      } else if (isPrems) {
        db.data.users[m.sender].limit = "UNLIMITED";
        db.data.chats[m.chat].isBanned = false;
      } else if (!isROwner && isBans) return;
      if (opts["queque"] && m.text && !(isMods || isPrems)) {
        let queque = this.msgqueque,
          time = 1000 * 5;
        const previousID = queque[queque.length - 1];
        queque.push(m.id || m.key.id);
        setInterval(async function () {
          if (queque.indexOf(previousID) === -1) clearInterval(this);
          else await delay(time);
        }, time);
      }
      db.data.users[m.sender].online = Date.now();
      db.data.users[m.sender].hit += 1;
      if (opts["autoread"]) await this.readMessages([m.key]);
      if (opts["nyimak"]) return;
      if (!m.fromMe && !isOwner && !isPrems && !isMods && opts["self"]) return;
      if (opts["pconly"] && m.chat.endsWith("g.us")) return;
      if (opts["gconly"] && !m.fromMe && !m.chat.endsWith("g.us")) return;
      if (opts["swonly"] && m.chat !== "status@broadcast") return;

      if (typeof m.text !== "string") m.text = ""
      if (m.isBaileys) return
      m.exp += Math.ceil(Math.random() * 1000);

      let usedPrefix;
      let _user =
        global.db.data &&
        global.db.data.users &&
        global.db.data.users[m.sender];

      const groupMetadata = store.fetchGroupMetadata(m.chat, this);
      const participants =
        (m.isGroup
          ? await (
              await store.groupMetadata[m.chat]
            ).participants
          : []) || [];
      const user =
        (m.isGroup
          ? participants.find((u) => sock.decodeJid(u.id) === m.sender)
          : {}) || {};
      const bot =
        (m.isGroup
          ? participants.find((u) => sock.decodeJid(u.id) == this.user.jid)
          : {}) || {};
      const isRAdmin = (user && user.admin == "superadmin") || false;
      const isAdmin = isRAdmin || (user && user.admin == "admin") || false;
      const isBotAdmin = (bot && bot.admin) || false;
      for (let name in global.plugins) {
        var plugin;
        plugin = plugins[name];
        if (!plugin) continue;
        const str2Regex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
        let _prefix = plugin.customPrefix
          ? plugin.customPrefix
          : sock.prefix
            ? sock.prefix
            : global.prefix;
        let match = (
          _prefix instanceof RegExp
            ? [[_prefix.exec(m.text), _prefix]]
            : Array.isArray(_prefix)
              ? _prefix.map((p) => {
                  let re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
                  return [re.exec(m.text), re];
                })
              : typeof _prefix === "string"
                ? [
                    [
                      new RegExp(str2Regex(_prefix)).exec(m.text),
                      new RegExp(str2Regex(_prefix)),
                    ],
                  ]
                : [[[], new RegExp()]]
        ).find((p) => p[1]);
        if (typeof plugin.event === "function")
          if (
            await plugin.event.call(this, m, {
              match,
              sock: this,
              participants,
              groupMetadata,
              user,
              bot,
              isROwner,
              isOwner,
              isRAdmin,
              isAdmin,
              isBotAdmin,
              isPrems,
              isBans,
              chatUpdate,
            })
          )
            continue;
        if (typeof plugin.run !== "function") continue;
        if (isOwner ? (opts && match && m) : (usedPrefix = (match[0] || '')[0])) {
          let result =
          ((opts?.["multiprefix"] ?? true) && (match[0] || "")[0]) ||
          (opts?.["noprefix"] ?? false ? null : (match[0] || "")[0]);
          usedPrefix = result;
          let noPrefix = !result ? m.text : m.text.replace(result, "");
          let [command, ...args] = noPrefix.trim().split` `.filter((v) => v);
          args = args || [];
          let _args = noPrefix.trim().split` `.slice(1);
          let text = _args.join` `;
          command = (command || "").toLowerCase();
          let fail = plugin.fail || global.dfail;
          const prefixCommand = !result
          ? plugin.customPrefix || plugin.command
          : plugin.command;
          let isAccept =
          (prefixCommand instanceof RegExp && prefixCommand.test(command)) ||
          (Array.isArray(prefixCommand) &&
          prefixCommand.some((cmd) =>
          cmd instanceof RegExp ? cmd.test(command) : cmd === command,
          )) ||
          (typeof prefixCommand === "string" && prefixCommand === command);
          m.prefix = !!result;
          usedPrefix = !result ? "" : result;
          if (!isAccept) continue
          if (sock.user.jid == global.sock.user.jid) {
          await sock.sendPresenceUpdate('composing', m.chat)
          }
          if (!m.isGroup && !isPrems && sock.user.jid == global.sock.user.jid) {          
          let data = await sock.groupMetadata(global.group)
          let link = await sock.groupInviteCode(data.id);
          let isInGroup = data.participants.some(participant => participant.id === m.sender);
          db.data.chats[m.chat].isBanned = !isInGroup;
          if (!isInGroup) {          
          if ([`${usedPrefix}prioritas`,`${usedPrefix}prioritas 7D`,`${usedPrefix}prioritas 30D`,`${usedPrefix}prioritas 60D`,`${usedPrefix}prioritas 90D`].includes(m.text)) {
          db.data.chats[m.chat].isBanned = false
          } else {
          let capt = `Hai @${m.sender.replace(/@.+/g, '')} 👋\n\n`
          capt += 'Sepertinya kamu belum bergabung kedalam komunitas kami, bergabung terlebih dahulu untuk menggunakan layanan kami atau kamu bisa upgrade ke prioritas agar tidak perlu bergabung ke komunitas\n\n'
          capt += 'Jika kamu berminat untuk menjadi salah satu pengguna prioritas gunakan saja perintah `#prioritas`\n\n'
          capt += `https://chat.whatsapp.com/${link}`    
          await sock.reply(m.chat, capt, m)
          }
          }
          }
          if (!m.fromMe && !isOwner) {
          let formatNumber = (num) => parseFloat(`${num.toString().slice(0, 1)}.${num.toString().slice(1, 2)}`);         
          sock.antispam = sock.antispam ? sock.antispam : {};
          sock.cdm = sock.cdm ? sock.cdm : {};
          
          let timeNow = Date.now();
          let timeDifference = timeNow - (sock.antispam[m.sender] || 0);
          
          if (timeDifference > 5000) {   
          sock.cdm[m.sender] = false;         
          sock.antispam[m.sender] = timeNow;        
          } else {
          if (!sock.cdm[m.sender]) {          
          sock.cdm[m.sender] = true;
          return sock.reply(m.chat, `Gunakan command lagi setelah *${formatNumber(5000 - timeDifference)}* detik`, m);
          }
          }
          }
          m.plugin = name;
          m.chatUpdate = chatUpdate;
          if (
            m.chat in global.db.data.chats ||
            m.sender in global.db.data.users
          ) {
            let chat = global.db.data.chats[m.chat];
            let user = global.db.data.users[m.sender];
            if (
              name != "owner-unbanchat.js" &&
              chat &&
              chat.isBanned &&
              !isOwner
            )
              return;
            if (
              name != "group-unmute.js" &&
              chat &&
              chat.mute &&
              !isAdmin &&
              !isOwner
            )
              return;
          }          
          if (plugin.error >= 5) {
            db.data.settings.blockcmd.push(command);
            m.reply(
              "*Sedang dalam perbaikan.*",
            );
            continue;
          }
          if (plugin.group && !m.isGroup) {
            sock.reply(m.chat, settings.message.group, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.main && sock.user.jid !== global.sock.user.jid) {
            sock.reply(m.chat, settings.message.owner, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.private && m.isGroup) {
            sock.reply(m.chat, settings.message.private, m, { contextInfo: { isForwarded: true }});         
            continue;
          }
          if (plugin.admin && !isAdmin) {
            sock.reply(m.chat, settings.message.admin, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.owner && !isOwner) {
            sock.reply(m.chat, settings.message.owner, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.premium && !isPrems) {
            sock.reply(m.chat, settings.message.premium, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.botadmin && !isBotAdmin) {
            sock.reply(m.chat, settings.message.botadmin, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          if (plugin.example && command && !text) {
            let txt = plugin.example.replace("%cmd", usedPrefix + command);
            sock.reply(m.chat, txt, m, { contextInfo: { isForwarded: true }});
            continue;
          }
          m.isCmd = true;
          m.cmd = command;
          if (plugin.wait && m.isCmd) {
            if (!m.isCmd) return;
            let data = [
            "😂", "❤️", "😎", "🔥", "😊", "🎉", "💪", "🙌", "👌", "🤔",
            "🤩", "🎯", "😅", "👍", "🥳", "✨", "💥", "😇", "🤗", "😜",
            "🤷", "😏", "😴", "👀", "🤤", "💯", "😢", "💔", "🥺", "😱",
            "🤯", "😡", "🙈", "🤪", "👑", "👏", "💃", "🕺", "💖", "🎶",
            "😆", "😋", "😎", "👊", "😌", "😛", "🤓", "🤝", "🚀", "🌟"
             ];
            let randomEmoji = data[Math.floor(Math.random() * data.length)];
            await sock.sendMessage(m.chat, {
              react: {
                text: randomEmoji,
                key: m.key,
              },
            });
          }
          let xp = "exp" in plugin ? parseInt(plugin.exp) : 17;
          if (xp > 9999999999999999999999) m.reply("Ngecit -_-");
          else m.exp += xp;
          if (!isPrems && ![`${usedPrefix}prioritas`,`${usedPrefix}topup`,`${usedPrefix}buy`].includes(m.text) && global.db.data.users[m.sender].limit < 1) {
            let limit = `Penggunaan harian anda telah habis, Perintah ini setidaknya membutuhkan 1 Limit

Limit direset setiap pukul 00.00 WIB, gunakan kembali setelah limit direset

Atau kamu bisa topup untuk membeli limit tambahan dengan menggunakan perintah \`#topup\` bisa juga dengan upgrade prioritas untuk mendapatkan lebih banyak limit \`#prioritas\` 7D`;
            sock.sendMessage(
              m.chat,
              {
                text: limit,
              },
              {
                quoted: m,
              },
            );
            continue;
          }
          let extra = {
            match,
            usedPrefix,
            noPrefix,
            _args,
            args,
            command,
            text,
            sock: this,
            participants,
            groupMetadata,
            user,
            bot,
            isROwner,
            isOwner,
            isRAdmin,
            isAdmin,
            isBotAdmin,
            isPrems,
            isBans,
            chatUpdate,
          };
          try {
            await plugin.run.call(this, m, extra);
            if (!isPrems) m.limit = m.limit || plugin.limit || true;
          } catch (e) {
            m.error = e;
            console.error("Error", e);
            if (e) {
              let text = util.format(e);
              sock.logger.error(text);
              if (text.match("rate-overlimit")) return;
              if (e.name) {
                for (let jid of global.owner) {
                  let data = (await sock.onWhatsApp(jid))[0] || {};
                  if (data.exists)
                    this.reply(data.jid, `${String(text)}`, m);
                }
                plugin.error += 1;
                let msg = {
                  status: false,
                  author: '@dcodekemii',
                  message: e.message
                }
               await sock.reply(m.chat, Func.jsonFormat(msg), m).then(data => m.react("❌"));
              }
              m.reply(e.message);
            }
          } finally {
          }
          break;
        }
      }
    } catch (e) {
      console.log(chalk.red.bold(e));
    } finally {
      if (opts["queque"] && m.text) {
        const quequeIndex = this.msgqueque.indexOf(m.id || m.key.id);
        if (quequeIndex !== -1) this.msgqueque.splice(quequeIndex, 1);
      }
      let user,
        stats = global.db.data.stats;
      if (m) {
        if (m.sender && (user = global.db.data.users[m.sender])) {
          user.exp += m.exp;
          user.limit -= m.limit * 1;
        }
        let stat;
      }
      try {
        require("./lib/console.js")(m, this, chatUpdate);
      } catch (e) {
        console.log(m, m.quoted, e);
      }
      await this.chatRead(
        m.chat,
        m.isGroup ? m.sender : undefined,
        m.id || m.key.id,
      ).catch(() => {});
    }
  },
  async participantsUpdate({ id, author, participants, action }) {
    if (opts["self"]) return;
    if (global.isInit) return;
    let chat = global.db.data.chats[id] || {};
    let metadata = store.groupMetadata[id];
    let text = "";
    switch (action) {
      case "add":
      case "remove":
        if (action === "add") {
          metadata.participants.push(
            ...participants.map((sender) => ({
              id: jidNormalizedUser(sender),
              admin: null,
            })),
          );
        } else if (action === "remove") {
          metadata.participants = metadata.participants.filter(
            (p) => !participants.includes(jidNormalizedUser(p.id)),
          );
        }
        if (chat.welcome) {
          let groupMetadata =
            store.groupMetadata[id] || store.fetchGroupMetadata(id, this);
          for (let user of participants) {
            let pp = "https://i.ibb.co/sQTkHLD/ppkosong.png";
            let name = await this.getName(user);
            let gpname = await this.getName(id);
            try {
              pp = await this.profilePictureUrl(user, "image");
            } catch (e) {
            } finally {
              text =
                action === "add"
                  ? db.data.chats[id].welcome
                      .replace("%member", "@" + user.split("@")[0])
                      .replace("%subject", gpname)
                      .replace(
                        "%time",
                        moment.tz("Asia/Jakarta").format("HH:mm"),
                      )
                  : global.db.data.chats[id].leave
                      .replace("%member", "@" + user.split("@")[0])
                      .replace("%subject", gpname)
                      .replace(
                        "%time",
                        moment.tz("Asia/Jakarta").format("HH:mm"),
                      );
              let wel = pp;
              let lea = pp;
              let q = {key: {participant: "0@s.whatsapp.net","remoteJid": "0@s.whatsapp.net"},"message": {"groupInviteMessage": {"groupJid": id, "inviteCode": "m","groupName": `${gpname}`, "caption": `${gpname}`}}}
              await sock.sendMessage(id, {
                text: text,
                contextInfo: {
                  mentionedJid: sock.parseMention(text),                  
                },
              }, { quoted: q });
            }
          }
        }
        break;
    }
  },
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright("Update : ") + chalk.yellow.bold(file));
  delete require.cache[file];
});
