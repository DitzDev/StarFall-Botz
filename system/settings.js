const Function = require(process.cwd() + "/lib/function");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const moment = require("moment-timezone");

global.owner = ["6285717062467", ""]; // Owner?
global.moderator = [""]; // moderator
global.group = '120363304504693753@g.us'
global.settings = {  
  packname: "Created by @IT-Team",
  version: require(process.cwd() + "/package.json").version,
  message: {
    admin: "*This command only for group admin.*",
    owner: "*This command only for owner.*",
    premium: "*This feature only for premium user.*",
    group: "*This command will only work in groups*",
    private: "*Use this command in private chat.*",
    botadmin: "*This command will work when I become an admin.*",
  },
  dataname: "database.json",
  sessions: "session",
  use_pairing: true,
  pairing_number: "6285717062467", // Nomor bot
};
global.Func = new Function();
global.api = {
  rose: "Rk-748ede917c29884c9134e9eb378174b3",
};
global.baileys = require("baileys");

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright("Update :") + chalk.yellow.bold(file));
  delete require.cache[file];
  if (global.reloadHandler) console.log(global.reloadHandler());
});
