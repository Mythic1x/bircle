import fs from 'fs'

import { Message, MessageActionRow, MessageButton } from "discord.js"
import { crv, generateDefaultRecurseBans, handleSending, StatusCode } from "../common_to_commands"
import { choice, isBetween, listComprehension } from "../util"

import pets from "../pets"
import economy from "../economy"
import user_options from '../user-options'

import achievements from '../achievements'

import { getVar, GLOBAL_CURRENCY_SIGN } from "../common"
import { giveItem } from "../shop"
import { IUserCountry, UserCountryActivity } from './user-country'

class Activity {
    cost: string
    go: (data: CommandV2RunArg) => Promise<CommandReturn>
    constructor(cost: string, go: (data: CommandV2RunArg) => Promise<CommandReturn>) {
        this.cost = cost
        this.go = go
    }
}

class Country {
    cost: string
    greeting: string | undefined
    activities: Map<string, Activity>
    currencySign?: string | undefined
    goodFlightChance?: number
    badFlightChance?: number
    _activityNameList: string[] | undefined
    constructor({ cost, greeting, currencySign, goodFlightChance, badFlightChance }: { cost: string, greeting?: string, currencySign?: string, goodFlightChance?: number, badFlightChance?: number }) {
        this.cost = cost
        this.greeting = greeting
        this.activities = new Map()
        this.currencySign = currencySign
        this.badFlightChance = badFlightChance
        this.goodFlightChance = goodFlightChance
        if ("init" in this && typeof this.init === 'function')
            this.init()
    }

    registerActivity(name: string, cost: string, activity: (data: CommandV2RunArg) => Promise<CommandReturn>) {
        this.activities.set(name, new Activity(cost, activity))
        return this
    }

    getSign(msg: Message) {
        return user_options.getOpt(msg.author.id, "currency-sign", this.currencySign ?? GLOBAL_CURRENCY_SIGN)
    }

    get activityNameList() {
        return this._activityNameList ?? (this._activityNameList = Array.from(this.activities.keys()))
    }

    isUserCountry(){
        return false
    }

    async go({ msg }: CommandV2RunArg): Promise<CommandReturn> {
        let activitiesText = listComprehension(this.activities.entries(), ([name, activity], idx) => {
            return `${idx + 1}: ${name} (cost: ${activity.cost})`
        }).join("\n")

        let name = "name" in this ? this.name : this.constructor.name

        if("onVisit" in this && typeof this.onVisit === 'function'){
            this.onVisit(arguments[0])
        }

        await handleSending(msg, crv(this.greeting ?? `Welcome to ${name}`))

        await new Promise(res => setTimeout(res, 900))
        await handleSending(msg, crv(`Please choose an activity :grin:\n${activitiesText}`, { status: StatusCode.PROMPT }))
        let msgs = await msg.channel.awaitMessages({
            filter: m => {
                return this.activityNameList.includes(m.content.toLowerCase()) || (!isNaN(Number(m.content)) && isBetween(0, Number(m.content), this.activityNameList.length + 1))
            }, max: 1, time: 60000
        })

        if (msgs.size < 1) {
            return crv("You did not chose an activity in time", { status: StatusCode.ERR })
        }

        let activityOfChoice = msgs.at(0)?.content.toLowerCase() as string

        let activity = this.activities.get(activityOfChoice) || Array.from(this.activities.values())[Number(activityOfChoice) - 1]

        let cost = economy.calculateAmountFromNetWorth(msg.author.id, activity.cost)
        if(!economy.canBetAmount(msg.author.id, cost)){
            return crv(`You could not afford to do the activities you wanted and left sadly`)
        }

        await handleSending(msg, await activity.go(arguments[0]))

        return await this.returnHome(arguments[0])
    }

    async badFlightHome({ msg }: CommandV2RunArg): Promise<CommandReturn> {
        let amount = economy.calculateAmountFromNetWorth(msg.author.id, "neg(min(10,5%))")
        economy.addMoney(msg.author.id, amount)
        return crv(`Your flight got delayed and you had to spend the night ${this.getSign(msg)}${amount}`)
    }

    async neutralFlightHome(_data: CommandV2RunArg): Promise<CommandReturn> {
        return crv("You had a safe trip back home")
    }

    async goodFlightHome(data: CommandV2RunArg): Promise<CommandReturn> {
        return this.neutralFlightHome(data)
    }

    async returnHome(data: CommandV2RunArg): Promise<CommandReturn> {
        if (Math.random() < (this.badFlightChance ?? .1)) {
            this.badFlightHome(data)
        }
        if (Math.random() < (this.goodFlightChance ?? .1)) {
            this.goodFlightHome(data)
        }
        return this.neutralFlightHome(data)
    }
}

class Canada extends Country {
    init() {
        this.badFlightChance = .2
    }

    async badFlightHome(): Promise<CommandReturn> {
        return crv("Your flight got caught in a blizzard")
    }

    async go({ msg }: CommandV2RunArg): Promise<CommandReturn> {
        this.onVisit(arguments[0])
        if (Math.random() < .1) {
            let costBack = economy.calculateAmountFromStringIncludingStocks(msg.author.id, "10%")
            economy.loseMoneyToBank(msg.author.id, costBack)
            return crv(`Your flight accidentally ended up in alert, greenland. You spend ${costBack} just to get back home`)
        }
        if (Math.random() > .8) {
            await handleSending(msg, crv("You sit for 10 hours and watch a moose.\nYou get very board. -3 points :-1:"))
        }
        return crv("You did a smidge of ice skating because there are no other activities in canada")
    }

    async onVisit(data: CommandV2RunArg){
        let ach = achievements.achievementGet(data.msg, "canada")
        if(ach)
            await handleSending(data.msg, ach)

    }
}



class Mexico extends Country {
    init() {
        this.registerActivity("mayan temple", "3%", this.mayanTemple.bind(this))
        this.registerActivity("cartel", "neg(1)", this.drugCartel.bind(this))
        return this
    }

    async drugCartel({ msg }: CommandV2RunArg) {
        if (Math.random() > .7) {
            let amount = economy.calculateAmountFromNetWorth(msg.author.id, "neg(30%)")
            economy.addMoney(msg.author.id, amount)
            return crv(`The drug cartel kills you and you had to spend ${this.getSign(msg)}${-amount} reviving yourself with a tire pump`)
        }
        if (Math.random() > .05) {
            let amount = economy.calculateAmountFromString(msg.author.id, "neg(3%)")
            economy.addMoney(msg.author.id, amount)
            return crv(`The drug cartel steals ${this.getSign(msg)}${String(-amount).split(".")[0]} and ${String(-amount).split(".")[1]} cents from your pocket`)
        }
        let amount = economy.calculateAmountOfMoneyFromString(msg.author.id, economy.economyLooseGrandTotal().total, "10%")
        economy.addMoney(msg.author.id, amount)
        return crv(`You join a drug cartel and form new friendships you should'nt have believed to be possible\nAfter many years of service you accumulate ${this.getSign(msg)}${amount}`)
    }

    async mayanTemple({ msg }: CommandV2RunArg) {
        if (Math.random() < .03) {
            let amount = economy.calculateAmountOfMoneyFromString(msg.author.id, economy.economyLooseGrandTotal().total, "1%")
            economy.addMoney(msg.author.id, amount)
            return crv(`You found a secret gold stash worth: ${this.getSign(msg)}${amount}`)
        }

        await handleSending(msg, crv("How do you rate the temples out of 5? (type in chat)", {
            files: [
                {
                    attachment: './assets/temple.png',
                    name: "temple.png",
                }
            ]
        }))

        let msgs = await msg.channel.awaitMessages({ filter: m => isBetween(0, Number(m.content), 6) && m.author.id === msg.author.id, max: 1, time: 30000 })
        let ratingMsg = msgs.at(0)
        if (!ratingMsg) {
            return crv(`You gave the default rating of 3.5/5 on myspace`)
        }
        let rating = Number(ratingMsg.content)
        if (rating < 3) {
            return crv(`You do not think the temple is cool :-1: you give it a rating of ${rating}/5 on myspace`)
        }
        return crv(`You think the temples are very neato, and you rate it ${ratingMsg.content}/5 on myspace`)
    }
    async onVisit({msg}: CommandV2RunArg){
        let ach = achievements.achievementGet(msg, "mexico")
        if(ach)
            await handleSending(msg, ach)
    }
}

class UnitedStates extends Country {
    init() {
        this.registerActivity("statue of liberty", "1%", async () => crv(choice(
            ["You loved the statue of liberty", "You hated the stink in the statue, you get -3 points :-1:"]
        )))
        this.registerActivity("free hotdog", "3", this.freeHotdog.bind(this))
        this.registerActivity("car accident", "0", this.carAccident.bind(this))
        this.registerActivity("museum of liberty", "max(25,5%)", this.museumOfLiberty.bind(this))
        this.registerActivity("second street", "0.02", this.secondStreet.bind(this))
        return this
    }

    async onVisit({msg}: CommandV2RunArg){
        let ach = achievements.achievementGet(msg, "united states")
        if(ach)
            await handleSending(msg, ach)
    }

    async secondStreet({msg}: CommandV2RunArg) {
        economy.addMoney(msg.author.id, 0.01)
        return crv(`You found a penny on second street\ngain ${this.getSign(msg)}.01!!!`)
    }

    async freeHotdog({ msg }: CommandV2RunArg) {
        let userPets = pets.getUserPets(msg.author.id)
        for (let pet in userPets) {
            pets.setPetToFullHealth(msg.author.id, pet)
        }
        return crv("You munch on your free scrumpscious liberty capitalism hotdog\nAll your pets now have full health")

    }

    async carAccident({ msg }: CommandV2RunArg) {
        let sign = this.getSign(msg)
        if (Math.random() > .5) {
            let amount = economy.calculateAmountFromNetWorth(msg.author.id, "2%")
            economy.addMoney(msg.author.id, amount)
            return crv(`Someone was sad you got in an accident, and gave you ${sign}${amount}`)
        }
        let amount = economy.calculateAmountFromNetWorth(msg.author.id, "neg(2%)")
        economy.addMoney(msg.author.id, amount)
        return crv(`You got in a car accident, this is very sad\npay ${sign}${amount} in hospital fees`)
    }

    async museumOfLiberty({ msg }: CommandV2RunArg) {
        let sign = this.getSign(msg)
        if (getVar(msg, "!retire:retired")) {
            giveItem(msg.author.id, "bald eagle", 1)
            await handleSending(msg, crv("Since you are retired you get a free bald eagle!!!!"))
        }

        let row = new MessageActionRow()

        let buttons = []
        //this is so bad but whatever improving it takes a lot of effor because i gotta find the right unicode val to make something a keycap
        if (Math.random() < .1) {
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.1`, style: "PRIMARY", label: `1️⃣` }))
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.2`, style: "PRIMARY", label: `2️⃣` }))
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.3`, style: "PRIMARY", label: `3️⃣` }))
        }
        else {
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.1`, style: "PRIMARY", label: `1` }))
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.2`, style: "PRIMARY", label: `2` }))
            buttons.push(new MessageButton({ customId: `${msg.author.id}.museum.3`, style: "PRIMARY", label: `3` }))
        }

        row.addComponents(buttons)

        let m = await handleSending(msg, crv("Welcome to the museum of liberty!!! Would you like to\n1: look around\n2: steal a bald eagle\n3: express your freedom", {
            components: [row]
        }))


        let b = await m.awaitMessageComponent({ componentType: "BUTTON" })
        switch (b.customId.slice(`${msg.author.id}.museum.`.length)) {
            case '1':
                return crv("You look around like an npc, the end.")
            case "2": {
                if (Math.random() > .7) {
                    giveItem(msg.author.id, "bald eagle", 1)
                    return crv("You successfully stole the bald eagle")
                }
                let amount = economy.calculateAmountFromNetWorth(msg.author.id, "10%")
                return crv(`You got caught steeling a bald eagle, you had to pay ${sign}${amount} in fines`)
            }
            case "3": {
                giveItem(msg.author.id, "freedom token", 1)
                return crv("For expressing your freedom you get 1 freedom token")
            }
            default: {
                return crv("Unknown action\ndying...", { status: StatusCode.ERR })
            }
        }
    }
}

class France extends Country{
    init(){
        this.registerActivity("eiffel tower", "max(50,10%)", this.eiffelTower.bind(this))
        this.registerActivity("baguette shop", "0", this.baguetteShop.bind(this))
    }
    async badFlightHome(_data: CommandV2RunArg): Promise<CommandReturn> {
        return crv("Your piolot accidentally crashed into the eiffel tower😲\nOH NO")
    }

    async eiffelTower({msg}: CommandV2RunArg): Promise<CommandReturn>{
        if(Math.random() > .98){
            return crv("The eiffel tower fell over, and you didnt get to take a picture of it :(")
        }
        giveItem(msg.author.id, "baguette", 2)
        return crv(`You visit the eiffel tower and find 2 baguettes on the floor!!!`)
    }

    async baguetteShop({msg}: CommandV2RunArg): Promise<CommandReturn>{
        //TODO:
        //add a chance that the user takes a wrong turn and ends up in the back ally drug store
        //the user can buy drugs that actually do stuff
        let menu = {
            "baguette": 3,
            "paris special": 10
        }
        let row = new MessageActionRow()
        let buttons = []
        for(let item in menu){
            buttons.push(new MessageButton({customId: `${msg.author.id}.baguette:${item}`, label: item, style: "PRIMARY"}))
        }
        row.addComponents(buttons)
        let actionMsg = await handleSending(msg, crv(`What would you like from the menu\n${Object.entries(menu).map((v, idx) => `${idx + 1}: ${v[0]} (${v[1]})`).join("\n")}`, {
            components: [row]
        }))

        let b = await actionMsg.awaitMessageComponent({componentType: "BUTTON", time: 30000})
        if(!b){
            return crv("You decided not to get anything")
        }
        let item = b.customId.split(":")[1] as keyof typeof menu
        let cost = menu[item]
        economy.addMoney(msg.author.id, -cost)
        giveItem(msg.author.id, item, 1)

        await b.reply(`You bought the ${item} for ${this.getSign(msg)}${cost}`)

        return {noSend: true, status: StatusCode.RETURN}
    }

    onVisit(data: CommandV2RunArg){
        let ach = achievements.achievementGet(data.msg, "france")
        if(ach){
            handleSending(data.msg, ach)
        }
    }
}

class UserCountry extends Country {
    name: string
    constructor({ activities, name }: { cost: string, greeting?: string, currencySign?: string, goodFlightChance?: number, badFlightChance?: number, activities: { [name: string]: UserCountryActivity }, name: string }) {
        super(arguments[0])
        this.name = name
        for (let name in activities) {
            this.registerActivity(name, activities[name].cost, async (_data) => {
                return { recurse: generateDefaultRecurseBans(), content: activities[name].run, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            })
        }
    }

    isUserCountry(){
        return true
    }
}

let defaultCountries = {
    "us": new UnitedStates({ cost: "5%+20", greeting: "Welcome to the us 🔫" }),
    "canada": new Canada({ cost: "2%+10" }),
    "mexico": (new Mexico({ cost: "1%+5", greeting: "Welcome to mexico🪇" })),
    "france": new France({cost: "5%+30", greeting: "Bonjour!🍞", currencySign: '💶'})
}


function getCountries() {
    let userCountries: { [name: string]: UserCountry } = {}

    if (fs.existsSync("./data/travel.json")) {
        let data: { [key: string]: { [name: string]: IUserCountry } } = JSON.parse(fs.readFileSync("./data/travel.json", "utf-8"))
        for (let user in data) {
            for (let country in data[user]) {
                userCountries[country] = new UserCountry({
                    cost: data[user][country].cost,
                    activities: data[user][country].activities,
                    name: country
                })
            }
        }
    }
    return {
        ...defaultCountries,
        ...userCountries
    }
}

export default {
    getCountries
}
