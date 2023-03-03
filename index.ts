///<reference path="src/types.d.ts" />
import fs from 'fs'

//TODO: add ArgumentList class to interact with args
//can be added to commandV2 as arguments in the object given to the fn

import http from 'http'

const { Message, MessageEmbed, Interaction, MessageButton, MessageActionRow, GuildMember, TextChannel, MessageActivity, Collection, MessageFlags, MessageMentions, ReactionManager, InteractionReplyOptions, User } = require("discord.js")

import { REST } from '@discordjs/rest'

import { Routes } from "discord-api-types/v9"

import pet from './src/pets'

require("./src/commands/commands")
import command_commons = require("./src/common_to_commands")

let commands = command_commons.getCommands()

import globals = require("./src/globals")
import { URLSearchParams } from "url"
import { efd, format } from "./src/util"
import { getOpt } from "./src/user-options"
import { InteractionResponseTypes } from "discord.js/typings/enums"
import { getUserMatchCommands, GLOBAL_CURRENCY_SIGN } from './src/common'
import timer from './src/timer'

const economy = require("./src/economy")
const { generateFileName } = require("./src/util")
const { saveItems, hasItem } = require("./src/shop")

const user_options = require("./src/user-options")

let { client, purgeSnipe, prefix, BLACKLIST, saveVars } = require("./src/common")

const rest = new REST({ version: "9" }).setToken(globals.token);

Object.defineProperty(User.prototype, "balance", {
    "get": function() {
        return economy.calculateAmountFromString(this.id, "100%")
    }
});
Object.defineProperty(User.prototype, "loan", {
    "get": function() {
        return economy.calculateLoanAmountFromString(this.id, "100%")
    }
});
Object.defineProperty(User.prototype, "economyData", {
    "get": function() {
        return economy.getEconomy()[this.id]
    }
});
Object.defineProperty(User.prototype, "netWorth", {
    "get": function() {
        return economy.playerLooseNetWorth(this.id)
    }
});

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(globals.CLIENT_ID, globals.GUILD_ID),
            { body: command_commons.slashCommands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


//as the name implies this  function does  a command based on the contents of a  message
//TODO: Eventually I would  like to make it so that all that is necessary here, is to pass a command

client.on("guildMemberAdd", async (m: typeof Message) => {
    try {
        let role = await m.guild?.roles.fetch("427570287232417793")
        if (role)
            m.member?.roles.add(role)
    }
    catch (err) {
        console.log(err)
    }
})

client.on('ready', async () => {
    economy.loadEconomy()
    Object.keys(user_options.USER_OPTIONS).forEach((v) => {
        if (user_options.getOpt(v, "dm-when-online", "false") !== "false") {
            client.users.fetch(v).then((u: any) => {
                u.createDM().then((channel: any) => {
                    channel.send(user_options.getOpt(v, "dm-when-online", "ONLINE")).catch(console.log)
                })
            }).catch(console.log)
        }
    })
    console.log("ONLINE")
})

client.on("messageDelete", async (m: typeof Message) => {
    if (m.author?.id != client.user?.id) {
        for (let i = 3; i >= 0; i--) {
            command_commons.snipes[i + 1] = command_commons.snipes[i]
        }
        command_commons.snipes[0] = m
    }
})

client.on("messageDeleteBulk", async (m: any) => {
    purgeSnipe = m.toJSON()
    if (purgeSnipe.length > 5)
        purgeSnipe.length = 5
})


client.on("messageCreate", async (m: typeof Message) => {
    if (m.member?.roles.cache.find((v: any) => v.id == '1031064812995760233')) {
        return
    }
    if (m.channel.type !== "DM" && m.guild && m.guild?.id !== globals.GUILD_ID)
        return
    if (economy.getEconomy()[m.author.id] === undefined && !m.author.bot) {
        economy.createPlayer(m.author.id)
    }
    if(!timer.getTimer(m.author.id, "%can-earn") && !m.author.bot){
        //for backwards compatibility
        timer.createTimer(m.author.id, "%can-earn")
    }

    let local_prefix = user_options.getOpt(m.author.id, "prefix", prefix)

    if (!m.author.bot && (m.mentions.members?.size || 0) > 0 && getOpt(m.author.id, "no-pingresponse", "false") === "false") {
        //@ts-ignore
        for (let i = 0; i < m.mentions.members.size; i++) {
            //@ts-ignore
            let pingresponse = user_options.getOpt(m.mentions.members.at(i)?.user.id, "pingresponse", null)
            if (pingresponse) {
                pingresponse = pingresponse.replaceAll("{pinger}", `<@${m.author.id}>`)
                if (command_commons.isCmd(pingresponse, prefix)) {
                    await command_commons.cmd({msg: m, command_excluding_prefix: pingresponse.slice(prefix.length), disable: command_commons.generateDefaultRecurseBans()})
                }
                else {
                    m.channel.send(pingresponse)
                }
            }
        }
    }

    if (m.content === `<@${client.user.id}>`) {
        await command_commons.handleSending(m, { content: `The prefix is: ${local_prefix}`, status: 0 })
    }

    //saves economy stuff 45% of the time
    if (Math.random() > .55) {
        economy.saveEconomy()
        saveItems()
        pet.savePetData()
    }

    let content = m.content

    if (!m.author.bot) {
        //checks for emotes
        for (let match of content.matchAll(/<a?:([^:]+):([\d]+)>/g)) {
            globals.addToEmoteUse(match[2])
        }
    }

    if (timer.has_x_s_passed(m.author.id, "%can-earn", 60) && !m.author.bot) {
        let deaths = pet.damageUserPetsRandomly(m.author.id)
        if (deaths.length)
            await m.channel.send(`<@${m.author.id}>'s ${deaths.join(", ")} died`)

        let ap = pet.getActivePet(m.author.id)

        let percent = 1.001
        let pcount = Number(hasItem(m.author.id, "puffle chat"))

        percent += .0001 * pcount

        if (ap == 'cat') {
            economy.earnMoney(m.author.id, percent + .002)
        }
        else {
            economy.earnMoney(m.author.id, percent)
        }

        if (ap == 'puffle') {
            let stuff = await pet.PETACTIONS['puffle'](m)
            if (stuff) {
                let findMessage = user_options.getOpt(m.author.id, "puffle-find", "{user}'s {name} found: {stuff}")
                await command_commons.handleSending(m, { content: format(findMessage, { user: `<@${m.author.id}>`, name: pet.hasPet(m.author.id, ap).name, stuff: stuff.money ? `${user_options.getOpt(m.author.id, "currency-sign", GLOBAL_CURRENCY_SIGN)}${stuff.money}` : stuff.items.join(", ") }), status: command_commons.StatusCode.INFO, recurse: command_commons.generateDefaultRecurseBans() })
            }
        }
    }

    if (content.slice(0, local_prefix.length) == local_prefix) {
        if (m.content === `${local_prefix}END` && m.author.id === "334538784043696130") {
            server.close()
        }
        for (let cmd of content.split(`\n${local_prefix};\n`)) {
            m.content = `${cmd}`
            let c = m.content.slice(local_prefix.length)
            try {
                await command_commons.cmd({msg: m, command_excluding_prefix: c})
            }
            catch (err) {
                console.error(err)
                await m.channel.send({ content: `Command failure: **${cmd}**\n\`\`\`${err}\`\`\`` })
            }
        }
        globals.writeCmdUse()
    }
    else {
        await command_commons.Interpreter.handleMatchCommands(m, m.content, true)
    }
})

client.on("interactionCreate", async (interaction: typeof Interaction) => {
    if (interaction?.user?.username === undefined) {
        return
    }
    if (interaction.isButton() && !interaction.replied) {
        if (interaction.customId.match(/button\.(rock|paper|scissors)/)) {
            let intendedUser = interaction.customId.split(":")[1]
            let table: { [k: string]: string } = { "rock": "paper", "paper": "scissors", "scissors": "rock" }
            if (interaction.user.id != intendedUser) {
                interaction.reply({ ephemeral: true, content: "You idiot, you already picked" }).catch(console.error)
                return
            }
            let oppChoice = interaction.customId.split(":")[0].split(".")[1]
            if (typeof globals.BUTTONS[interaction.customId] !== 'string') {
                interaction.reply({ content: "Something went wrong" }).catch(console.error)
                return
            }
            //@ts-ignore
            let [userChoice, ogUser, bet] = globals.BUTTONS[interaction.customId].split(":")
            let ogBet = Number(bet)
            if (interaction.member?.user.id === ogUser) {
                interaction.reply({ content: "Ur a dingus" }).catch(console.error)
                return
            }
            if (userChoice == oppChoice) {
                interaction.reply({ content: "TIE" }).catch(console.error)
            }
            else if (table[oppChoice] == userChoice) {
                if (ogBet) {
                    economy.addMoney(ogUser, ogBet)
                    interaction.reply({ content: `<@${ogUser}> user won ${ogBet}` }).catch(console.error)
                }
                else interaction.reply({ content: `<@${ogUser}> user wins!` }).catch(console.error)
            }
            else {
                if (ogBet) {
                    economy.loseMoneyToBank(ogUser, ogBet)
                    if (interaction.member?.user.id) {
                        //@ts-ignore
                        economy.addMoney(interaction.member?.user.id, ogBet)
                        interaction.reply({ content: `<@${interaction.member?.user.id}> user won ${ogBet}!` }).catch(console.error)
                    }
                }
                else interaction.reply({ content: `<@${interaction.member?.user.id}> user wins!` }).catch(console.error)
            }
            for (let b in globals.BUTTONS) {
                if (b.match(/button\.(rock|paper|scissors)/)) {
                    delete globals.BUTTONS[b]
                }
            }
        }
    }
    else if (interaction.isSelectMenu() && !interaction.replied) {
        if (interaction.customId.includes("poll")) {
            let id = interaction.customId
            let key = interaction.values[0]
            if (globals.POLLS[id]["votes"]) {
                //checks if the user voted
                for (let key in globals.POLLS[id]["votes"]) {
                    if (globals.POLLS[id]["votes"][key]?.length) {
                        if (globals.POLLS[id]["votes"][key].includes(String(interaction.member?.user.id))) {
                            return
                        }
                    }
                }

                if (globals.POLLS[id]["votes"][key])
                    globals.POLLS[id]["votes"][key].push(String(interaction.member?.user.id))
                else
                    globals.POLLS[id]["votes"][key] = [String(interaction.member?.user.id)]
            }
            else globals.POLLS[id]["votes"] = { [id]: [String(interaction.member?.user.id)] }
            let str = ""
            for (let key in globals.POLLS[id]["votes"]) {
                str += `${key}: ${globals.POLLS[id]["votes"][key].length}\n`
            }
            let dispId = id.slice(id.indexOf(":"))
            if (interaction.message instanceof Message) {
                if (str.length > 1990 - globals.POLLS[id]["title"].length) {
                    let fn = generateFileName("poll-reply", interaction.member?.user.id)
                    fs.writeFileSync(fn, str)
                    await interaction.message.edit({ files: [{ attachment: fn }], content: dispId })
                    fs.rmSync(fn)
                }
                else {
                    interaction.message.edit({ content: `**${globals.POLLS[id]["title"]}**\npoll id: ${dispId}\n${str}` })
                    interaction.reply({ content: `${interaction.values.toString()} is your vote`, ephemeral: true }).catch(console.error)
                }
            }
            else interaction.reply({ content: interaction.values.toString(), ephemeral: true }).catch(console.error)
        }
    }
    else if (interaction.isCommand() && !interaction.replied) {
        if (BLACKLIST[interaction.member?.user.id as string]?.includes(interaction.commandName)) {
            interaction.reply({ content: "You are blacklisted from this" }).catch(console.error)
            return
        }
        globals.addToCmdUse(`/${interaction.commandName}`)
        if (interaction.commandName == 'attack') {
            let user = interaction.options.get("user")?.['value']
            if (!user) {
                interaction.reply("NO USER GIVEN???").catch(console.error)
                return
            }
            interaction.reply(`Attacking ${user}...`).catch(console.error)
            interaction.channel?.send(`${user} has been attacked by <@${interaction.user.id}>`).catch(console.error)
        }
        else if (interaction.commandName === 'md') {
            interaction.reply({
                //@ts-ignore
                type: InteractionResponseTypes.CHANNEL_MESSAGE_WITH_SOURCE,
                content: interaction.options.get("text")?.value as string ?? "Hi"
            })
        }
        else if (interaction.commandName == 'aheist') {
            let userId = interaction.user.id
            let stage = interaction.options.get("stage")?.value
            if (!stage) {
                interaction.reply(`${stage} is not a valid stage`).catch(console.error)
                return
            }
            let gainOrLose = interaction.options.get("gain-or-lose")?.value as string
            if (!gainOrLose) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let users = interaction.options.get("users-to-gain-or-lose")?.value as string
            if (!users) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            if (!users.match(/^(:?(\d+|all),?)+$/)) {
                interaction.reply(`${users} does not match ((digit|all),)+`).catch(console.error)
                return
            }
            let amount = interaction.options.get("amount")?.value
            if (!amount) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let message = interaction.options.get("message")?.value
            if (!message) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let text = `${userId}: ${message} AMOUNT=${amount} STAGE=${stage} ${gainOrLose.toUpperCase()}=${users}`
            let substage = interaction.options.get("nextstage")?.value
            if (substage)
                text += ` SUBSTAGE=${substage}`
            let location = interaction.options.get("location")?.value
            if (location)
                text += ` LOCATION=${location}`
            let set_location = interaction.options.get("set-location")?.value
            if (set_location)
                text += ` SET_LOCATION=${set_location}`
            let button_response = interaction.options.get("button-response")?.value
            if (button_response) {
                text += ` BUTTONCLICK=${button_response} ENDBUTTONCLICK`
            }
            let condition = interaction.options.get("if")?.value
            if (condition) {
                text += ` IF=${condition}`
            }
            fs.appendFileSync(`./command-results/heist`, `${text};END\n`)
            interaction.reply(`Added:\n${text}`).catch(console.error)
        }
        else if (interaction.commandName == 'ping') {
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...").catch(console.error)
            globals.SPAM_ALLOWED = true
            for (let i = 0; i < times; i++) {
                if (!globals.SPAM_ALLOWED) break
                await interaction.channel?.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if (interaction.commandName == 'img') {
            //@ts-ignore
            let rv = await command_commons.commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
            if (rv.files) {
                for (let file of rv.files) {
                    fs.rmSync(file.attachment)
                }
            }
        }
        else if (interaction.commandName == 'help') {
            interaction.reply({
                content: "use `[help -n -plain`, slash commands r boring, so i will not support them that much\nbegrudgingly, here is the current help file",
                files: [{
                    attachment: './help.html',
                    name: "heres some help.html",
                    description: "lmao"
                }]
            }).catch(console.error)
        }
        else if (interaction.commandName == "alias") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [interaction.options.get("name")?.value, interaction.options.get("command")?.value].filter(v => String(v)) as string[]
            let args = interaction.options.get("text")?.value as string
            if (args) {
                arglist = arglist.concat(args.split(" "))
            }
            //@ts-ignore
            let rv = await command_commons.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel), interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'poll') {
            //@ts-ignore
            interaction.author = interaction?.member.user
            let argList = []
            let title = interaction.options.get("title")?.value
            let options = interaction.options.get("options")?.value as string
            if (title) {
                argList.push(`-title=${title}`)
            }
            argList.push(options)
            //@ts-ignore
            await command_commons.commands['poll'].run(interaction, argList, interaction.channel.send.bind(interaction.channel))
        }
        else if (interaction.commandName == 'ccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [String(interaction.options.get("name")?.value), "say"] as string[]
            let args = interaction.options.get("text")?.value as string
            if (args) {
                arglist = arglist.concat(args.split(" "))
            }
            //@ts-ignore
            let rv = await command_commons.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'rccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await command_commons.commands['rccmd'].run(interaction, [interaction.options.get("name")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'say') {
            interaction.reply(interaction.options.get("something")?.value as string | null || "How did we get here").catch(console.error)
        }
        else if (interaction.commandName == "dad") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["distance", interaction.options.get("response")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == "add-8") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("response")?.value as string
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["8", resp], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == "add-wordle") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("word")?.value as string
            if (resp.includes(" ")) {
                interaction.reply("no spaces").catch(console.error)
                return
            }
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["wordle", resp], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'rps') {
            let opponent = interaction.options.get("opponent")?.value
            let choice = interaction.options.get("choice")?.value as string
            let bet = interaction.options.get("bet")?.value as string
            let nBet = 0
            if (bet) {
                if (interaction.member?.user.id) {
                    nBet = economy.calculateAmountFromString(interaction.member.user.id, bet)
                    if (!economy.canBetAmount(interaction.member.user.id, nBet) || nBet < 0) {
                        interaction.reply({ content: "You cant bet this much" }).catch(console.error)
                        return
                    }
                }
            }
            let rock = new MessageButton({ customId: `button.rock:${opponent}`, label: "rock", style: "PRIMARY" })
            let paper = new MessageButton({ customId: `button.paper:${opponent}`, label: "paper", style: "PRIMARY" })
            let scissors = new MessageButton({ customId: `button.scissors:${opponent}`, label: "scissors", style: "PRIMARY" })
            globals.BUTTONS[`button.rock:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            globals.BUTTONS[`button.paper:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            globals.BUTTONS[`button.scissors:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            let row = new MessageActionRow({ type: "BUTTON", components: [rock, paper, scissors] })
            interaction.reply({ components: [row], content: `<@${opponent}>, Rock, paper.... or scissors BUM BUM BUUUMMMM (idfk)` }).catch(console.error)
        }
        else if (interaction.commandName == "hangman") {
            let caseSensitive = interaction.options.get("case")?.value
            let lives = interaction.options.get("lives")?.value
            let user = interaction.options.get("user")?.value
            let cmdsArgs = []
            if (caseSensitive) {
                cmdsArgs.push("-case")
            }
            if (lives !== undefined) {
                cmdsArgs.push(`-lives=${lives}`)
            }
            cmdsArgs.push(user)
            //@ts-ignore
            interaction.author = interaction.member.user
            //@ts-ignore
            let rv = await command_commons.commands['hangman'].run(interaction, cmdsArgs, interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as typeof InteractionReplyOptions).catch(console.error)
        }
    }
    else if (interaction.isUserContextMenu() && !interaction.replied) {
        globals.addToCmdUse(`${interaction.commandName}:user`)
        if (interaction.commandName == 'ping') {
            interaction.reply(`<@${interaction.user.id}> has pinged <@${interaction.targetUser.id}> by right clicking them`).catch(console.error)
        }
        else if (interaction.commandName == 'info') {
            const user = interaction.targetUser
            const member: typeof GuildMember = interaction.targetMember as typeof GuildMember
            let embed = new MessageEmbed()
            embed.setColor(member.displayColor)
            if (user.avatarURL())
                //@ts-ignore
                embed.setThumbnail(user.avatarURL())
            embed.addFields(efd(
                ["Id", user.id || "#!N/A", true],
                ["Username", user.username || "#!N/A", true],
                ["Nickname", member?.nickname || "#!N/A", true],
                ["0xColor", member?.displayHexColor?.toString() || "#!N/A", true],
                ["Color", member?.displayColor?.toString() || "#!N/A", true],
                ["Created at", user.createdAt.toString() || "#!N/A", true],
                ["Joined at", member?.joinedAt?.toString() || "#!N/A", true],
                ["Boosting since", member?.premiumSince?.toString() || "#!N/A", true])
            )
            interaction.reply({ embeds: [embed] }).catch(console.error)
        }
    }
    else if (interaction.isMessageContextMenu() && !interaction.replied) {
        globals.addToCmdUse(`${interaction.commandName}:message`)
        if (interaction.commandName == 'fileify') {
            let fn = generateFileName("fileify", interaction.member?.user.id)
            fs.writeFileSync(fn, interaction.targetMessage.content)
            interaction.reply({ files: [{ attachment: fn, description: "Your file, sir" }] }).then(() => {
                fs.rmSync(fn)
            }).catch(console.error)
        }
    }
})

client.login(globals.token)

const server = http.createServer()
server.listen(8222)

function handlePost(req: http.IncomingMessage, res: http.ServerResponse, body: string){
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
    let [_blank, mainPath, ...subPaths] = path.split("/")
    switch(mainPath){
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
            client.channels.fetch(inChannel).then((channel: typeof TextChannel) => {
                let msg: typeof Message = {
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
                    flags: new MessageFlags(),
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
                        has: (data: any, options: any) => false,
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
                    type: "DEFAULT",
                    url: "http://localhost:8222/",
                    webhookId: null,
                    _cacheType: false,
                    _patch: (_data: any) => { }
                }
                console.log(command)
                command_commons.cmd({msg, command_excluding_prefix: command as string, returnJson: true}).then(rv => {
                    if(shouldSend){
                        command_commons.handleSending(msg, rv.rv as CommandReturn).then(_done => {
                            res.writeHead(200)
                            res.end(JSON.stringify(rv))
                        }).catch(_err => {
                            res.writeHead(500)
                            console.log(_err)
                            res.end(JSON.stringify({ error: "Soething went wrong sending message" }))
                        })
                    }
                    else{
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

function _handlePost(req: http.IncomingMessage, res: http.ServerResponse){
    let body = ''
    req.on("data", chunk => body += chunk.toString())
    req.on("end", () => {
        handlePost(req, res, body)
    })
}

function handleGet(req: http.IncomingMessage, res: http.ServerResponse){
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
    let [_blank, mainPath, ...subPaths] = path.split("/")
    switch (mainPath) {
        case "option": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
            if(!userId){
                res.writeHead(400)
                res.end('{"erorr": "No user id given"}')
                break;
            }
            let option = urlParams?.get("option")
            if(!option){
                res.writeHead(400)
                res.end('{"erorr": "No option given"}')
                break;
            }
            res.end(JSON.stringify(user_options.getOpt(userId, option)))
            break;
        }
        case "economy": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
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
            saveVars()
            pet.savePetData()
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
            let inChannel = urlParams?.get("channel-id")
            client.channels.fetch(inChannel).then((channel: typeof TextChannel) => {
                channel.send({ content: text }).then((msg: any) => {
                    res.writeHead(200)
                    res.end(JSON.stringify(msg.toJSON()))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }
        default:
            res.writeHead(404)
            res.end(JSON.stringify({ error: "Route not found" }))
    }
}

server.on("request", (req, res) => {
    if(req.method === 'POST'){
        return _handlePost(req, res)
    }
    else if(req.method === 'GET'){
        return handleGet(req, res)
    }
})
