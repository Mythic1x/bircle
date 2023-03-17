import fs from 'fs'

import { Message } from "discord.js"
import { GLOBAL_CURRENCY_SIGN, prefix } from "./common"
import economy from "./economy"
import { allowedOptions, getOpt } from "./user-options"


//TODO:
//add types
//for example: type <amount>. 
//when ${} is used to get the var, it can check the type and do stuff
//for backwards compatibility, vars with no type are strings
//example: if type is <amount>, it can run economy.calculateAmountFromString on the value of the variable and return that
//by default the type is string
//add helper functions such as getTypeOf(name: string, prefix?: string, id?: string)
//  would use the same getter algorithm as getVar
//
//type ideas:
//  <number>
//      example usage: [expr
//      stored as numbers instead of strings
//
//each type would have a respective class to be able to convert between types
//  NumberVar
//  StringVar
//  AmountVar
//  each type would have a list of compatible types, for example
//  <amount> can be converted to <string>
//  <number> can be converted to <string> and <amount>
//  <string> cannot be converted to anything as it could cause errors
//  convertType(varValue, fromType, toType)
//  getVarAs(varName, toType, id?)

const VarType = {
    "string": 0,
    "number": 1,
    "amount": 2,
    "function": 3,
} as const

export type VarType = keyof typeof VarType

type VarTypeValType<VType extends keyof typeof VarType> = {
    "string": string,
    "number": number,
    "amount": string,
    "function": (msg: Message) => string
}[VType]

//This class is not used when vars are read back into memory from the json file
//instead it's read into raw objects
//do not rely on vars being instances of this class, instead just having the properties of this class
class Variable<T extends keyof typeof VarType>{
    type: keyof typeof VarType
    value: VarTypeValType<T>
    constructor(type: T, value: VarTypeValType<T>){
        this.type = type
        this.value = value
    }
}

let defaultVars: Record<string, Variable<"function">> = {
    random: new Variable('function', () => String(Math.random())),
    rand: new Variable("function", () => String(Math.random())),
    prefix: new Variable("function", (msg) => getOpt(msg.author.id, "prefix", prefix)),
    sender: new Variable("function", (msg) => `<@${msg.author.id}>`),
    carson: new Variable("function", () => "The all legendary Carson Williams"),
    money: new Variable("function", msg => String(economy.calculateAmountFromString(msg.author.id, "100%"))),
    "$": new Variable("function", msg => String(economy.calculateAmountFromString(msg.author.id, "100%"))),
    "__global_currency_sign": new Variable("function", () => GLOBAL_CURRENCY_SIGN),
    _: new Variable('function', msg => getVar(msg, "_!", msg.author.id))
}

for (let v of allowedOptions) {
    defaultVars[`__${v.replaceAll("-", "_")}`] = new Variable('function', (msg: Message) => getOpt(msg.author.id, v, false))
}

type VarPrefix = Record<string, Variable<any>>

let vars: { [key: string]: { [key: string]: Variable<any> | VarPrefix } } = {
    "__global__": {
        ...defaultVars
    }
}

function saveVars() {
    for (let vname in vars['__global__']) {
        if (Object.keys(defaultVars).includes(vname)) {
            delete vars['__global__'][vname]
        }
    }
    fs.writeFileSync("./data/vars", JSON.stringify(vars))
    vars['__global__'] = { ...vars['__global__'], ...defaultVars }
}

function readVars() {
    if (fs.existsSync("./data/vars")) {
        vars = JSON.parse(fs.readFileSync("./data/vars", "utf-8"))
        vars["__global__"] = { ...vars["__global__"], ...defaultVars }
    }
}

readVars()

function delVar(varName: string, prefix?: string, id?: string, systemDel: boolean = true) {
    prefix ??= "__global__"
    let path
    if (prefix === "__global__" && vars[prefix]?.[varName]) {
        path = vars[prefix]
    }
    else if (prefix.match(/\d{18}/) && vars[prefix]?.[varName]) {
        path = vars[prefix]
    }
    else if (id && (vars[id]?.[prefix] as VarPrefix)?.[varName] !== undefined) {
        path = vars[id][prefix]
    }
    else return false

    if(path instanceof Variable) return false;

    if(!systemDel && typeof path[varName] === 'function'){
        return false
    }

    delete path[varName]

    return true
}

function delPrefix(prefixName: string, id: string){
    if(vars[id]?.[prefixName]){
        delete vars[id][prefixName]
        return true
    }
    return false
}

function getPrefixAndVarname(varName: string){
        let [prefix, ...v] = varName.split(":")
        if(v[0] === "") return [prefix, ""]
        varName = v.join(":")
        if (!varName) {
            varName = prefix
            prefix = "__global__"
        }
        return [prefix, varName]
}

function setVarEasy(msg: Message, varName: string, value: string, prefix?: string) {
    if (!prefix) {
        [prefix, varName] = getPrefixAndVarname(varName)
    }
    if (prefix.match(/\d{18}/)) {
        return false
    }
    if (prefix === "%") {
        prefix = msg.author.id
    }
    return setVar(varName, value, prefix, msg.author.id)
}

function createVar<T extends VarType>(type: T, varName: string, value: VarTypeValType<T>, id?: string){
    let [prefix, name] = getPrefixAndVarname(varName)
    let path;
    if (prefix === "__global__") {
        path = vars["__global__"]
    }
    else if(prefix.match(/\d{18}/)){
        if(!vars[prefix]){
            vars[prefix] = {}
        }
        path = vars[prefix]
    }
    else if (prefix && id) {
        if (!vars[id]) {
            vars[id] = {}
        }
        if(!vars[id][prefix]){
            vars[id][prefix] = {}
        }
        path = vars[id][prefix]
    }

    if(!path) return false;
    if(path instanceof Variable) return false

    return path[name] = new Variable(type, value)
}

function setVar(varName: string, value: string, prefix?: string, id?: string) {
    if (!prefix) {
        [prefix, varName] = getPrefixAndVarname(varName)
    }
    let path;
    if (prefix === "__global__") {
        path = vars["__global__"]
    }
    else if(prefix.match(/\d{18}/)){
        if(!vars[prefix]){
            vars[prefix] = {}
        }
        path = vars[prefix]
    }
    else if (prefix && id) {
        if (!vars[id]) {
            vars[id] = {}
        }
        if(!vars[id][prefix]){
            vars[id][prefix] = {}
        }
        path = vars[id][prefix]
    }

    if(!path) return false;
    if(path instanceof Variable) return false

    //functions are builtin vars and should not be overwritten
    if(path[varName]?.type === 'function'){
        return false
    }
    path[varName] = new Variable('string', value)
    return true
}

function readVarVal(msg: Message, variableData: Variable<any> | VarPrefix) {
    if (variableData.type === 'string') {
        return variableData.value
    }
    else if (variableData.type === 'function') {
        return variableData.value(msg)
    }
    else if (variableData.type === 'number') {
        return String(variableData.value)
    }
    else if(variableData.type === 'amount'){
        return String(economy.calculateAmountFromString(msg.author.id, variableData.value))
    }
    else if (typeof variableData === 'object') {
        return JSON.stringify(variableData)
    }
    else {
        return String(variableData)
    }
}

function getVar(msg: Message, varName: string, prefix?: string, id?: string) {
    if (!prefix) {
        [prefix, varName] = getPrefixAndVarname(varName)
    }
    if (prefix === "%") {
        prefix = id ?? msg.author.id
    }

    let varPrefixObj;
    if(prefix.includes(".") && prefix.slice(0, 18).match(/\d{18}/)){
        let user;
        [user, prefix] = prefix.split(".")
        if(vars[user]?.[prefix])
            varPrefixObj = vars[user]?.[prefix]
            // return readVarVal(msg, vars[user]?.[prefix][varName])
    }

    //global vars
    else if (prefix === "__global__" && vars[prefix] !== undefined) {
        varPrefixObj = vars[prefix]
        // return readVarVal(msg, vars[prefix][varName])
    }
    //for standard user vars
    else if (prefix.match(/^\d{18}$/) && vars[prefix] !== undefined) {
        varPrefixObj = vars[prefix]
        // return readVarVal(msg, vars[prefix][varName])
    }
    //for prefixed vars
    else if (vars[id ?? msg.author.id]?.[prefix] !== undefined) {
        varPrefixObj = vars[id ?? msg.author.id][prefix]
        // return readVarVal(msg, vars[id ?? msg.author.id][prefix][varName])
    }

    if(!varPrefixObj)
        return false

    if(varPrefixObj instanceof Variable) {
        return readVarVal(msg, varPrefixObj)
    }

    if(!varName){
        return Object.entries(varPrefixObj).map(v => `${v[0]} = ${typeof v[1] === 'string' ? v[1] : v[1].value}`).join("\n")
    }
    else if(varPrefixObj[varName] === undefined)
        return false;

    return readVarVal(msg, varPrefixObj[varName])
}

export default {
    defaultVars,
    vars,
    getVar,
    setVar,
    setVarEasy,
    readVarVal,
    readVars,
    saveVars,
    delVar,
    getPrefixAndVarname,
    delPrefix,
    createVar,
    VarType
}
