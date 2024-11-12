const fs = require("fs");
const moment = require('moment-timezone')
moment.tz.setDefault('Asia/Jakarta').locale('id')
const { green, greenBright, cyanBright, redBright, yellow, red } = require('chalk')

module.exports = async (m, conn = {}, chatUpdate) => {
  let who = m.fromMe ? 'Kemii' : m.name || 'No Name'  
  let time = m.messageTimestamp
  let txt = "";
  if (m.text.length >= 25) {
    txt = m.text.slice(0, 24) + "...";
  } else {
    txt = m.text;
  }
  console.log('\n' + `${m.isCmd ? yellow.bold('[ CMD ]') : red.bold('[ MSG ]')}`, moment(time * 1000).format('DD/MM/YY HH:mm:ss'), green.bold('from'), '[' + m.sender.split('@')[0] + '] ' + cyanBright.bold(who), green.bold('in'), '[' + m.chat + ']', `\n${txt}`)
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(redBright("Update : ") + yellow.bold(file));
  delete require.cache[file];
  if (global.reloadHandler) console.log(global.reloadHandler());
});
