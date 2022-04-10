let Log
try {
    const config = require(`${process.cwd()}/config.json`)  //讀取config(組態)
    const settings = require(`${process.cwd()}/settings.json`) //讀取設定檔案
    const localization = require('./utils/localization')(config) //讀取翻譯模組
    const sd = require('silly-datetime');//讀取silly-datetime模塊
    const fs = require("fs");
    Log = require("./utils/log")(localization, fs, sd, settings)
    const tokens = require('prismarine-tokens-fixed');  //讀取prismarine-tokens-fixed(驗證緩存)模塊
    const mineflayer = require('mineflayer');  //讀取mineflayer模塊
    const discard = require("./utils/discarditem")(localization, settings)
    const discord = require("./commands/communicate/dc")(localization, settings)
    const raid = require('./commands/main/Raid')(discord, localization, settings)
    const publicity = require("./commands/publicity/announcement")(localization)
    const Inquire = require("./commands/main/Inquire")(localization)
    const exchange = require("./commands/main/Exchange")(localization, discard, settings, Log)
    const reply = require("./commands/main/Reply")(localization, discord, settings, sd)
    let isRegister = false //是否已註冊過接收黑窗訊息事件&interval

    let loginOpts = {  //登入資訊
        host: config.ip,  //伺服器ip
        port: config.port,  //伺服器port(預設25565)
        username: config.username,  //Minecraft帳號
        password: config.password,  //Minecraft密碼
        tokensLocation: './bot_tokens.json',  //驗證緩存檔案
        tokensDebug: false,  //取得的token是否除錯
        version: false,  //bot的Minecraft版本
        auth: config.auth, //登入驗證器使用mojang或者microsoft
        defaultChatPatterns: false
    }

    function connect() {
        tokens.use(loginOpts, function (_err, _opts) { //使用驗證緩存
            const bot = mineflayer.createBot(_opts) //定義bot為mineflayer類別中的createBot
            bot.once('spawn', () => {   //bot啟動時
                console.log(`${localization.get_content("LOADING_DONE")}`)
                //從小黑窗中發送訊息
                if (!isRegister) {
                    const readline = require('readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                        terminal: false
                    });
                    rl.on('line', async function (line) {
                        bot.chat(line)
                    })

                    if (settings.enable_discord_bot) {
                        discord.login(bot, settings.enable_reply_msg, settings.bot_token, settings.forward_DC_ID)
                    }
                    isRegister = true
                }

                if (settings.attack) {
                    raid.hit(bot)
                    raid.detect_interruption(bot)
                    discard.discarditem(bot)
                }
                if (settings.enable_trade_announcement) //宣傳
                {
                    publicity.start(bot, settings)
                }
            });
            const whitelist = (config.whitelist);
            const broadcast_regex = new RegExp("的領地告示牌廣播")
            bot.on("message", async function (jsonMsg) {
                let health = /目標生命 \: ❤❤❤❤❤❤❤❤❤❤ \/ ([\S]+)/g.exec(jsonMsg.toString()); //清除目標生命
                if (!settings.health) {
                    if (health) {
                        return;
                    } else {
                        console.log(`${jsonMsg.toAnsi()}`);
                    }
                } else {
                    console.log(`${jsonMsg.toAnsi()}`);
                }

                if (jsonMsg.toString().includes("[系統] ") &&
                    jsonMsg.toString().toLowerCase().includes(`想要你傳送到 該玩家 的位置!`) ||
                    jsonMsg.toString().toLowerCase().includes(`想要傳送到 你 的位置`)) {
                    let msg = jsonMsg.toString().split(/ +/g);
                    let playerid = msg[1]
                    if (whitelist.includes(playerid)) {
                        bot.chat(`/tok`)
                    } else {
                        bot.chat(`/tno`)
                    }
                }
                if (jsonMsg.toString().includes(`-> 您]`)) {  //偵測訊息包含為"-> 您]"
                    const msg = (jsonMsg.toString())
                    let dec = msg.split(/ +/g);
                    let playerid = dec[0].substring(1, dec[0].length) //取得Minecraft ID
                    let args = msg.slice(8 + playerid.length).split(" ")  //取得指令內容
                    if (whitelist.includes(`${playerid}`) || playerid === bot.username) {
                        switch (args[0]) { //指令前綴
                            case "cmd":
                                bot.chat(msg.slice(12 + playerid.length))
                                break;
                            case "exp":  //查詢經驗值
                                Inquire.experience(bot, playerid)
                                break;
                            case "exchange":
                                await exchange.exchange_item(bot, playerid, ...args)
                                break
                            case "stop":
                                await exchange.stop(bot, playerid)
                                break
                            case "sword":
                                raid.sword(bot)
                                break
                            case "switch":
                                publicity.switch(bot, playerid, settings)
                                break;
                            case "help": //取得指令幫助
                                Inquire.h(bot, playerid)
                                break;
                            case "version":
                                Inquire.i(bot, playerid)
                                break;
                            case "about":
                                Inquire.about(bot, playerid)
                                break;
                            case "exit": //關閉bot
                                bot.chat(`/m ${playerid} ${localization.get_content("SHUTDOWN")}`)
                                console.log(`Shutdown in 10 seconds`)
                                setTimeout(function () {
                                    process.exit()
                                }, 10000)
                                break
                            default: {
                                reply.whitelisted_reply(bot, playerid, msg)
                            }
                        }
                    } else {
                        reply.no_whitelisted_reply(bot, playerid, msg)

                    }
                }

                if (broadcast_regex.test(jsonMsg.toString()) && settings.enable_detect_broadcast) {
                    let msg = jsonMsg.toString()
                    let dec = msg.split(/ +/g);
                    if (whitelist.includes(dec[1].replace('<', ""))) {
                        let message = msg.slice(dec[0].length + dec[1].length + dec[2].length + 2)
                        if (settings.enable_discord_bot) {
                            discord.send(localization.get_content("DETECT_BROADCAST_MSG_PREFIX"), message)
                        }
                        bot.chat(`/m ${settings.forward_ID} ${localization.get_content("DETECT_BROADCAST_MSG_PREFIX")}: ${message}`)
                    }
                }
            })


            bot.once('kicked', (reason) => {
                let time1 = sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'); //獲得系統時間
                console.log(`[資訊] 客戶端被伺服器踢出 @${time1}   \n造成的原因:${reason}`)
                publicity.shut()
                discard.d()
                raid.down()
                exchange.error_stop()
            });
            //斷線自動重連
            bot.once('end', () => {
                let time1 = sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'); //獲得系統時間
                console.log(`[資訊] 客戶端與伺服器斷線 ，10秒後將會自動重新連線...\n@${time1}`)
                publicity.shut()
                discard.d()
                raid.down()
                exchange.error_stop()
                setTimeout(function () {
                    connect();
                }, 10000)
            });
            bot.once('error', (reason) => {
                console.log(reason)
                Log.writeErrorLog(reason)
            })
        })
    }

    connect();
} catch (err) {
    console.log(err)
    console.log('process exit in 10 sec...')
    new Promise(resolve => setTimeout(async () => {
        Log.writeErrorLog(err)
        process.exit()
    }, 10000))

}









