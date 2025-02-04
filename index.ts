///<reference path="src/types.d.ts" />
import fs from 'fs'

import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, GuildMember, InteractionReplyOptions, User, ChannelType, InteractionResponseType, ButtonStyle, ComponentType,  Events, ChatInputCommandInteraction } from "discord.js"

import { REST } from '@discordjs/rest'

import { Routes } from "discord-api-types/v9"

import pet from './src/pets'

require("./src/commands/commands")
import {slashCmds } from "./src/slashCommands"

import command_commons from './src/common_to_commands'

import globals = require("./src/globals")
import { efd, isMsgChannel } from "./src/util"
import { format } from './src/parsing'
import { getOpt } from "./src/user-options"
import { GLOBAL_CURRENCY_SIGN } from './src/common'
import timer from './src/timer'

import economy from './src/economy'
import { Interaction, Message, } from 'discord.js'
// const economy = require("./src/economy")

import { generateFileName } from './src/util'

import { saveItems, hasItem } from './src/shop'

import user_options from './src/user-options'

let { client, purgeSnipe, prefix, BLACKLIST } = require("./src/common")

import vars from './src/vars'
import { server } from './website/server'
import amountParser from './src/amount-parser'
import pets from './src/pets'

const rest = new REST({ version: "10" }).setToken(globals.token);

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
            { body: slashCmds },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


client.on(Events.GuildMemberAdd, async (m: Message) => {
    try {
        let role = await m.guild?.roles.fetch("427570287232417793")
        if (role)
            m.member?.roles.add(role)
    }
    catch (err) {
        console.log(err)
    }
})

client.on(Events.ClientReady, async () => {
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

client.on(Events.MessageDelete, async (m: Message) => {
    if (m.author?.id != client.user?.id) {
        for (let i = 3; i >= 0; i--) {
            command_commons.snipes[i + 1] = command_commons.snipes[i]
        }
        command_commons.snipes[0] = m
    }
})

client.on(Events.MessageBulkDelete, async (m: any) => {
    purgeSnipe = m.toJSON()
    if (purgeSnipe.length > 5)
        purgeSnipe.length = 5
})

setInterval(() => {
    economy.saveEconomy()
    saveItems()
    pet.savePetData()
    vars.saveVars()
    timer.saveTimers()
}, 30000)

client.on(Events.MessageCreate, async (m: Message) => {
    if (!isMsgChannel(m.channel)) return
    if (m.member?.roles.cache.find((v: any) => v.id == '1031064812995760233')) {
        return
    }
    if (m.channel.type !== ChannelType.DM && m.guild && m.guild?.id !== globals.GUILD_ID)
        return

    if (economy.getEconomy()[m.author.id] === undefined && !m.author.bot) {
        economy.createPlayer(m.author.id)
    }
    if (!timer.getTimer(m.author.id, "%can-earn") && !m.author.bot) {
        //for backwards compatibility
        timer.createTimer(m.author.id, "%can-earn")
    }

    //you get reset if you have less than -40% of the economy
    if((economy.playerLooseNetWorth(m.author.id) / economy.economyLooseGrandTotal().total) < -0.4){
        economy.createPlayer(m.author.id)
        economy.setMoney(m.author.id, 0)
    }

    let local_prefix = user_options.getOpt(m.author.id, "prefix", prefix)

    if (!m.author.bot && (m.mentions.members?.size || 0) > 0 && getOpt(m.author.id, "no-pingresponse", "false") === "false") {
        for (let i = 0; i < (m.mentions.members?.size || 0); i++) {
            let pingresponse = user_options.getOpt(m.mentions.members?.at(i)?.user.id as string, "pingresponse", null)
            if (pingresponse) {
                pingresponse = pingresponse.replaceAll("{pinger}", `<@${m.author.id}>`)
                if (command_commons.isCmd(pingresponse, prefix)) {
                    await command_commons.cmd({ msg: m, command_excluding_prefix: pingresponse.slice(prefix.length), disable: command_commons.generateDefaultRecurseBans() })
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

        if (hasItem(m.author.id, "capitalism hat")) {
            percent += .002
        }
        if (ap === 'cat') {
            percent += pets.PETACTIONS['cat']()
        }

        if(!economy.getEconomy()[m.author.id] && !m.author.bot){
            economy.createPlayer(m.author.id, 100)
        }

        economy.earnMoney(m.author.id, percent)

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
                await command_commons.cmd({ msg: m, command_excluding_prefix: c })
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

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
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
            let data = globals.BUTTONS[interaction.customId]
            if (typeof data !== 'string') {
                return;
            }
            let [userChoice, ogUser, bet] = data.split(":")
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
    else if (interaction.isCommand() && !interaction.replied) {
        if (BLACKLIST[interaction.member?.user.id as string]?.includes(interaction.commandName)) {
            interaction.reply({ content: "You are blacklisted from this" }).catch(console.error)
            return
        }
        for(let cmd of slashCmds){
            if(cmd.name === interaction.commandName){
                globals.addToCmdUse(`/${interaction.commandName}`)
                cmd.run(interaction as ChatInputCommandInteraction)
            }
        }
    }
})

client.login(globals.token)

