import fs from 'fs'
import { ADMINS, client, saveVars } from './common'
import { CommandCategory, currently_playing, registerCommand, StatusCode } from './common_to_commands'
import economy = require("./economy")
import user_options = require("./user-options")
import pet = require("./pets")
import timer from './timer'
import { saveItems } from './shop'
import { Message } from 'discord.js'
const { hasItem, useItem, resetPlayerItems, resetPlayer, resetItems } = require('./shop')

export default function(){

    registerCommand(
    "eval", {
        run: async (msg, args, sendCallback) => {
            return { content: JSON.stringify(eval(args.join(" "))), status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        permCheck: v => ADMINS.includes(v.author.id) || v.author.id === "288904417036468225"
    },
    )

    registerCommand(
    "RESET_ECONOMY", {
        run: async (msg, _args, sendCallback) => {

            if (hasItem(msg.author.id, "reset economy")) {
                useItem(msg.author.id, "reset economy")
            }
            economy.resetEconomy()

            return { content: "Economy reset", status: StatusCode.RETURN }

        }, category: CommandCategory.ADMIN,
        permCheck: (m) => ADMINS.includes(m.author.id) || hasItem(m.author.id, "reset economy"),
        help: {
            info: "Resets the economy"
        }
    },
    )

    registerCommand(
    "RESET_LOTTERY", {
        run: async (msg, args, sb) => {
            economy.newLottery()
            return { content: "Lottery reset", status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        help: {
            info: "Resets the lottery"
        }
    },
    )

    registerCommand(
    "RESET_PLAYER", {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            economy.resetPlayer(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        permCheck: m => ADMINS.includes(m.author.id),
        help: {
            info: "Resets a player's money"
        }
    },
    )

    registerCommand(
    "RESET_PLAYER_ITEMS", {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            resetPlayerItems(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        permCheck: m => ADMINS.includes(m.author.id),
        help: {
            info: "Reset's a players inventory"
        }
    },
    )

    registerCommand(
    "RESET_ITEMS", {
        run: async (_msg, _args, sendCallback) => {
            resetItems()
            return { content: "Items reset", status: StatusCode.RETURN }
        },
        permCheck: (m) => ADMINS.includes(m.author.id),
        category: CommandCategory.ADMIN,
        help: {
            info: "Resets all inventories"
        }
    },
    )

    registerCommand(
    "SETMONEY", {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let user = await fetchUser(msg.guild, args[0])
            if (!user) {
                return { content: "user not found", status: StatusCode.ERR }
            }
            let amount = economy.calculateAmountFromString(msg.author.id, args[1])
            if (amount) {
                economy.setMoney(user.id, amount)
                return { content: `${user.id} now has ${amount}`, status: StatusCode.RETURN }
            }
            return { content: "nothing happened", status: StatusCode.ERR }
        }, category: CommandCategory.ADMIN,
        permCheck: (m) => ADMINS.includes(m.author.id),
        help: {
            info: "Sets a player's money to an amount"
        }
    },
    )

    registerCommand(
    "BLACKLIST", {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let user = args[0]
            if (!user) {
                return {
                    content: "no user given",
                    status: StatusCode.ERR
                }
            }
            let addOrRemove = args[1]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove",
                    status: StatusCode.ERR
                }
            }
            let cmds = args.slice(2)
            if (!cmds.length) {
                return {
                    content: "no cmd given",
                    status: StatusCode.ERR
                }
            }
            //@ts-ignore
            user = await fetchUser(msg.guild, user)
            if (addOrRemove == "a") {
                //@ts-ignore
                addToPermList(BLACKLIST, "blacklists", user as User, cmds)

                return {
                    content: `${user} has been blacklisted from ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                //@ts-ignore
                removeFromPermList(BLACKLIST, "blacklists", user, cmds)
                return {
                    content: `${user} has been removed from the blacklist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            }
        },
        permCheck: msg => {
            return ADMINS.includes(msg.author.id)
        },
        help: {
            info: "Blacklist, or unblacklist a user from a command<br>syntax: [BLACKLIST @user (a|r) cmd"
        },
        category: CommandCategory.ADMIN

    },
    )

    registerCommand(
    "END", {
        run: async (msg: Message, _args: ArgumentList, sendCallback) => {
            if (fs.existsSync(String(currently_playing?.filename))) {
                try {
                    fs.rmSync(String(currently_playing?.filename))
                }
                catch (err) { }
            }
            await sendCallback("STOPPING")
            economy.saveEconomy()
            saveItems()
            saveVars()
            timer.saveTimers()
            pet.savePetData()
            client.destroy()
            user_options.saveUserOptions()
            return {
                content: "STOPPING",
                status: StatusCode.RETURN
            }
        },
        permCheck: (msg) => {
            return ADMINS.includes(msg.author.id)
        },
        category: CommandCategory.ADMIN

    },
    )
}
