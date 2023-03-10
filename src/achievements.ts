import { Message, MessageEmbed } from 'discord.js';
import fs from 'fs'
import { crv, StatusCode } from './common_to_commands';
import economy from './economy';
import { giveItem } from './shop';
import { UnixTime } from './util';

class Achievement{
    name: string
    description: string
    message?: string
    constructor(name: string, description: string, message?: string){
        this.name = name
        this.description = description
        this.message = message
    }
    earn(id: string, reward: string): CommandReturn{
        let embed = new MessageEmbed()
        embed.setTitle(`Achievement Get: ${this.name}`)
        embed.setDescription(`reward: ${reward}`)
        return {embeds: [embed], status: StatusCode.ACHIEVEMENT, do_change_cmd_user_expansion: false}
    }
}

class ItemRewardAchievement extends Achievement{
    reward: string
    constructor(name: string, description: string, itemReward: string, message?: string){
        super(name, description, message)
        this.reward = itemReward
    }

    earn(id: string){
        giveItem(id, this.reward, 1)
        return super.earn(id, this.reward)
    }
}

class MoneyRewardAchievement extends Achievement{
    reward: string
    constructor(name: string, description: string, reward: string, message?: string){
        super(name, description, message)
        this.reward = reward
    }

    earn(id: string){
        let amount =  economy.calculateAmountFromNetWorth(id, this.reward)
        economy.addMoney(id, amount)
        return super.earn(id, String(amount))
    }
}

type AchievedAchievement = {
    achievement: string,
    achieved: UnixTime
}

const POSSIBLE_ACHIEVEMENTS: {[name: string]: Achievement} = { 
    mexico: new MoneyRewardAchievement("mexico", "travel to mexico", "max(2%,100)"),
    canada: new MoneyRewardAchievement("canada", "travel to canada", "max(2%,100)"),
    "united states": new ItemRewardAchievement("united states", "travel to the us", "gun"),
    france: new MoneyRewardAchievement("france", "travel to france", "max(2%,100)")
}

let cachedAchievements: undefined | {[id: string]: AchievedAchievement[]};

function getAchievements(){
    if(!cachedAchievements){
        if(fs.existsSync("./data/achievements.json"))
            cachedAchievements = JSON.parse(fs.readFileSync("./data/achievements.json", "utf-8"))
        else cachedAchievements = {}
        return cachedAchievements
    }
    else if(cachedAchievements){
        return cachedAchievements
    }
    return {}
}

function saveAchievements(){
    fs.writeFileSync('./data/achievements.json', JSON.stringify(cachedAchievements || {}))
}

function getAchievementByName(name: keyof typeof POSSIBLE_ACHIEVEMENTS){
    return POSSIBLE_ACHIEVEMENTS[name]
}

function isAchievement(name: string){
    if(POSSIBLE_ACHIEVEMENTS[name]){
        return name as keyof typeof POSSIBLE_ACHIEVEMENTS
    }
    return false
}

type AchievementMessage = CommandReturn

function achievementGet(msg: Message, achievement: Achievement['name']): AchievementMessage | false{
    let id = msg.author.id
    if(!cachedAchievements){
        cachedAchievements = {}
    }
    let achievementObj = getAchievementByName(achievement)
    if(!cachedAchievements[id]){
        cachedAchievements[id] = []
    }
    if(cachedAchievements[id].filter(v => v.achievement === achievement)[0]){
        return false
    }
    if(cachedAchievements[id]){
        cachedAchievements[id].push({
            achievement: achievement,
            achieved: Date.now()
        })
    }
    else {
        cachedAchievements[id] = [{achievement, achieved: Date.now()}]
    }

    saveAchievements()

    return achievementObj.earn(msg.author.id, "nothing")
}

function getAchievementsOf(user: string){
    return getAchievements()?.[user]
}

export default{
    getAchievements,
    achievementGet,
    getAchievementsOf,
    POSSIBLE_ACHIEVEMENTS,
    getAchievementByName,
    isAchievement,
    saveAchievements
}
