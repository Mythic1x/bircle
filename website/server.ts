import fs from 'fs'

import { Collection, Message, MessageFlagsBitField, MessageType, TextChannel } from 'discord.js'
import http from 'http'
import common_to_commands from '../src/common_to_commands'

import economy from '../src/economy'
import user_options from '../src/user-options'
import { saveItems } from '../src/shop'
import vars from '../src/vars'
import pets from '../src/pets'
import { generateHTMLFromCommandHelp } from '../src/util'

const {prefix, client} = require("../src/common")


export const server = http.createServer()
server.listen(8222)

function handlePost(req: http.IncomingMessage, res: http.ServerResponse, body: string) {
    let url = req.url
    if (!url) {
        res.writeHead(404)
        res.end(JSON.stringify({ err: "Page not found" }))
        return
    }
    let paramsStart = url.indexOf("?")
    let path = url.slice(0, paramsStart > -1 ? paramsStart : undefined)
    let urlParams: URLSearchParams | null = new URLSearchParams(url.slice(paramsStart))
    if (paramsStart == -1) {
        urlParams = null
    }
    let [_blank, mainPath, ..._subPaths] = path.split("/")
    switch (mainPath) {
        case "run": {
            let command = body
            let shouldSend = urlParams?.get("send")
            if (!command) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No post body given" }))
                break
            }
            if (command.startsWith(prefix)) {
                command = command.slice(prefix.length)
            }
            let inChannel = urlParams?.get("channel-id")
            client.channels.fetch(inChannel).then((channel: TextChannel) => {
                let msg: Message = {
                    activity: null,
                    applicationId: client.id,
                    id: "_1033110249244213260",
                    attachments: new Collection(),
                    author: client.user,
                    channel: channel,
                    channelId: channel.id,
                    cleanContent: command as string,
                    client: client,
                    components: [],
                    content: command as string,
                    createdAt: new Date(Date.now()),
                    createdTimestamp: Date.now(),
                    crosspostable: false,
                    deletable: false,
                    editable: false,
                    editedAt: null,
                    editedTimestamp: null,
                    embeds: [],
                    flags: new MessageFlagsBitField(),
                    groupActivityApplication: null,
                    guild: channel.guild,
                    guildId: channel.guild.id,
                    hasThread: false,
                    interaction: null,
                    member: null,
                    //@ts-ignore
                    mentions: {
                        channels: new Collection(),
                        crosspostedChannels: new Collection(),
                        everyone: false,
                        members: null,
                        repliedUser: null,
                        roles: new Collection(),
                        users: new Collection(),
                        has: (_data: any, _options: any) => false,
                        _channels: null,
                        _content: command as string,
                        _members: null,
                        client: client,
                        guild: channel.guild,
                        toJSON: () => {
                            return {}
                        }
                    },
                    nonce: null,
                    partial: false,
                    pinnable: false,
                    pinned: false,
                    position: null,
                    //@ts-ignore
                    reactions: null,
                    reference: null,
                    stickers: new Collection(),
                    system: false,
                    thread: null,
                    tts: false,
                    type: MessageType.Default,
                    url: "http://localhost:8222/",
                    webhookId: null,
                    _cacheType: false,
                    _patch: (_data: any) => { }
                }
                common_to_commands.cmd({ msg, command_excluding_prefix: command as string, returnJson: true }).then(rv => {
                    if (shouldSend) {
                        common_to_commands.handleSending(msg, rv.rv as CommandReturn).then(_done => {
                            res.writeHead(200)
                            res.end(JSON.stringify(rv))
                        }).catch(_err => {
                            res.writeHead(500)
                            console.log(_err)
                            res.end(JSON.stringify({ error: "Soething went wrong sending message" }))
                        })
                    }
                    else {
                        res.writeHead(200)
                        res.end(JSON.stringify(rv))

                    }
                }).catch(_err => {
                    res.writeHead(500)
                    console.log(_err)
                    res.end(JSON.stringify({ error: "Soething went wrong executing command" }))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }
    }

}

function _handlePost(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = ''
    req.on("data", chunk => body += chunk.toString())
    req.on("end", () => {
        handlePost(req, res, body)
    })
}

function _apiSubPath(req: http.IncomingMessage, res: http.ServerResponse, subPaths: string[], urlParams: URLSearchParams | null) {
    let [apiEndPoint] = subPaths
    subPaths = subPaths.splice(1)
    switch (apiEndPoint) {
        case "option": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
            if (!userId) {
                res.writeHead(400)
                res.end('{"erorr": "No user id given"}')
                break;
            }
            let option = urlParams?.get("option")
            if (!option) {
                res.writeHead(400)
                res.end('{"erorr": "No option given"}')
                break;
            }
            let validOption = user_options.isValidOption(option)
            if (!validOption) {
                res.writeHead(400)
                res.end('{"erorr": "No option given"}')
                break;
            }
            res.end(JSON.stringify(user_options.getOpt(userId, validOption, null)))
            break;
        }
        case "give-money": {
            let userId = subPaths[0]
            if (!userId) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "no user id" }))
            }
            let amount = subPaths[1]
            if (!amount || isNaN(Number(amount))) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "no amount" }))
                break
            }
            if (!economy.getEconomy()[userId]) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "Invalid user" }))
                break;
            }
            economy.addMoney(userId, Number(amount))
            res.writeHead(200)
            res.end(JSON.stringify({ "amount": Number(amount) }))
            break;
        }
        case "economy": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
            if (userId === "total") {
                res.writeHead(200)
                res.end(JSON.stringify(economy.economyLooseGrandTotal()))
                break;
            }
            let econData = economy.getEconomy()
            let rv;
            if (userId) {
                if (econData[userId])
                    rv = econData[userId]
                else {
                    rv = { error: "Cannot find data for user" }
                }
            }
            else {
                rv = econData
            }
            res.writeHead(200)
            res.end(JSON.stringify(rv))
            break
        }
        case "files": {
            let files = urlParams?.get("file")?.split(" ")
            if (!files) {
                files = fs.readdirSync(`./command-results/`)
            }
            let data: { [file: string]: string } = {}
            for (let file of files) {
                if (fs.existsSync(`./command-results/${file}`)) {
                    data[file] = fs.readFileSync(`./command-results/${file}`, "utf-8")
                }
            }
            res.writeHead(200)
            res.end(JSON.stringify(data))
            break
        }
        case "end": {
            economy.saveEconomy()
            saveItems()
            vars.saveVars()
            pets.savePetData()
            client.destroy()
            res.writeHead(200)
            res.end(JSON.stringify({ success: "Successfully ended bot" }))
            server.close()
            break;
        }
        case "send": {
            let text = urlParams?.get("text")
            if (!text) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No text given" }))
                break
            }

            //******************************
            /*YOU WERE FIXING WARNINGS, YOU GOT RID OF ALL OF THEM HERE*/
            //******************************


            let inChannel = urlParams?.get("channel-id")
            client.channels.fetch(inChannel).then((channel: TextChannel) => {
                channel.send({ content: text as string }).then((msg: any) => {
                    res.writeHead(200)
                    res.end(JSON.stringify(msg.toJSON()))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }

    }

}

function handleGet(req: http.IncomingMessage, res: http.ServerResponse) {
    let url = req.url
    if (!url) {
        res.writeHead(404)
        res.end("Page not found")
        return
    }
    let paramsStart = url.indexOf("?")
    let path = url.slice(0, paramsStart > -1 ? paramsStart : undefined)
    let urlParams: URLSearchParams | null = new URLSearchParams(url.slice(paramsStart))
    if (paramsStart == -1) {
        urlParams = null
    }
    let [_blank, mainPath, ...subPaths] = path.split("/")
    switch (mainPath) {
        case "": {
            let stat = fs.statSync("./website/home.html")
            res.writeHead(200, {"Content-Type": "text/html", "Content-Length": stat.size})
            let stream = fs.createReadStream("./website/home.html")
            stream.pipe(res).on("finish", () => {
                res.end()
            })
            break;
        }
        case "help-styles.css": {
            let stat = fs.statSync("./help-styles.css")
            res.writeHead(200, {"Content-Length": stat.size})
            let stream = fs.createReadStream("./help-styles.css")
            stream.pipe(res).on("finish", () => {
                res.end()
            })
            break;

        }
        case "commands": {
                let commands = common_to_commands.getCommands()
                let commandsToUse = Object.fromEntries(commands.entries())
                let html = '<link rel="stylesheet" href="/help-styles.css">'
                for (let command in commandsToUse) {
                    html += generateHTMLFromCommandHelp(command, commands.get(command) as Command | CommandV2)
                }
                res.writeHead(200)
                res.end(html)
                break;
        }
        case "help": {
            let stat = fs.statSync("./help-web.html")
            res.writeHead(200, {"Content-Type": "text/html", "Content-Length": stat.size})
            let stream = fs.createReadStream("./help-web.html")
            stream.pipe(res).on("finish", () => {
                res.end()
            })
            break;
        }
        case "api": {
            return _apiSubPath(req, res, subPaths, urlParams)
        }
        default:
            res.writeHead(404)
            res.end(JSON.stringify({ error: "Route not found" }))
    }
}

server.on("request", (req, res) => {
    if (req.method === 'POST') {
        return _handlePost(req, res)
    }
    else if (req.method === 'GET') {
        return handleGet(req, res)
    }
})
