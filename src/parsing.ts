import { Message } from "discord.js"

const { getOpt } = require("./user-options")
const { prefix, vars, getVar } = require('./common.js')
const { format, safeEval, getOpts, generateSafeEvalContextFromMessage, parseBracketPair } = require('./util.js')
const economy = require('./economy.js')
const timer = require("./timer.js")

enum T {
    str,
    dofirst,
    calc,
    esc,
    format,
    dofirstrepl,
    command,
    syntax,
    pipe,
}

function strToTT(str: string) {
    switch (str.toLowerCase()) {
        case "str":
            return T.str

        case "dofirst":
            return T.dofirst

        case "calc":
            return T.calc

        case "esc":
            return T.esc

        case "format":
            return T.format

        case "dofirstrepl":
            return T.dofirstrepl

        case "command":
            return T.command

        case "syntax":
            return T.syntax

        case "pipe":
            return T.pipe

        default:
            return T.str
    }
}

class Token {
    type: T
    data: string
    argNo: number
    id: number
    constructor(type: T, data: string, argNo: number) {
        this.type = type
        this.data = data
        this.argNo = argNo
        this.id = Math.random()
    }
}

enum Modifiers {
    skip = 0,
    silent = 1,
    typing = 2,
    delete = 3,
    redir = 4
}

function modifierToStr(mod: Modifiers) {
    switch (mod) {
        case 0:
            return "n:"
        case 1:
            return "s:"
        case 2:
            return "t:"
        case 3:
            return "d:"
        case 4:
            throw new Error("Cannot convert redir tot a string")
    }
}

class Modifier {
    data: RegExpMatchArray
    type: Modifiers
    constructor(data: RegExpMatchArray, type: Modifiers) {
        this.data = data
        this.type = type
    }
}

class Parser {
    tokens: Token[]
    string: string

    modifiers: Modifier[]

    IFS: string

    #isParsingCmd: boolean
    #msg: Message
    #curChar: string | undefined
    #i: number
    #curArgNo: number
    #hasCmd: boolean

    #pipeSign: string = ">pipe>"
    #defaultPipeSign: string = ">pipe>"


    get specialChars() {
        return `\\\$${this.IFS}{%>`
    }

    constructor(msg: Message, string: string, isCmd = true) {
        this.tokens = []
        this.string = string
        this.#i = -1
        this.#curChar = undefined
        this.#curArgNo = 0
        this.#hasCmd = false
        this.#msg = msg
        this.#isParsingCmd = isCmd
        this.modifiers = []
        this.IFS = getOpt(msg.author.id, "IFS", " ")
        this.#pipeSign = getOpt(msg.author.id, "pipe-symbol", ">pipe>")
    }

    advance(amount = 1) {
        this.#i += amount;
        this.#curChar = this.string[this.#i]
        if (this.#curChar === undefined) {
            return false
        }
        return true
    }
    back() {
        this.#i--;
        if (this.#i < 0) {
            return false
        }
        this.#curChar = this.string[this.#i]
        return true
    }

    async parse() {
        let lastWasspace = false
        while (this.advance()) {
            if (!this.#hasCmd && this.#isParsingCmd) {
                this.tokens.push(this.parseCmd())
                if (this.modifiers.filter(v => v.type === Modifiers.skip).length) {
                    this.tokens = this.tokens.concat(this.string.split(this.IFS).slice(1).map((v, i) => new Token(T.str, v, i)))
                    break
                }
            }
            switch (this.#curChar) {
                case this.IFS: {
                    if (!lastWasspace) {
                        this.#curArgNo++;
                    }
                    lastWasspace = true
                    break
                }
                case this.#defaultPipeSign[0]:
                case this.#pipeSign[0]: {
                    lastWasspace = false
                    this.tokens.push(this.parseGTBracket())
                    break
                }
                case "$": {
                    lastWasspace = false
                    this.tokens.push(this.parseDollar())
                    break
                }
                case "%": {
                    lastWasspace = false
                    this.tokens.push(this.parsePercent())
                    break
                }
                case "\\": {
                    lastWasspace = false
                    this.tokens.push(this.parseEscape(this.#msg))
                    break
                }
                case "{": {
                    lastWasspace = false
                    this.tokens.push(await this.parseFormat(this.#msg))
                    break
                }
                default: {
                    lastWasspace = false
                    this.tokens.push(this.parseString())
                    break
                }
            }
        }
    }

    //parsegreaterthanbracket
    parseGTBracket() {
        let builtString = this.#curChar as string
        while (this.advance() && (
            this.#pipeSign.startsWith(builtString + this.#curChar) && builtString !== this.#pipeSign) ||
            this.#defaultPipeSign.startsWith(builtString + this.#curChar) && builtString !== this.#defaultPipeSign
        ) {
            builtString += this.#curChar
        }
        if (this.#curChar !== undefined) {
            this.back()
        }
        if (builtString === this.#pipeSign || builtString === this.#defaultPipeSign) {
            this.advance()
            //ensure that the command WILL have argNo -1
            //bit hacky though
            if (this.#curChar === this.IFS) {
                this.#curArgNo = -2
            }
            else {
                //command Argno should start at -1
                this.#curArgNo = -1
            }
            this.back()
            return new Token(T.pipe, this.#defaultPipeSign, this.#curArgNo)
        }
        else {
            return new Token(T.str, builtString, this.#curArgNo)
        }
    }

    parseCmd() {
        let cmd = this.#curChar as string
        let modifiers = [/^n:/, /^s:/, /^t:/, /^d:/, /^redir(!)?\(([^:]*):([^:]+)\):/]
        while (this.advance() && !this.IFS.includes(this.#curChar as string) && this.#curChar !== "\n") {
            cmd += this.#curChar as string
        }
        while (true) {
            let foundMatch = false
            for (let modNo = 0; modNo < modifiers.length; modNo++) {
                let mod = modifiers[modNo]
                let m = cmd.match(mod)
                if (m) {
                    cmd = cmd.slice(m[0].length)
                    this.modifiers.push(new Modifier(m, modNo))
                    foundMatch = true
                }
            }
            if (!foundMatch)
                break
        }
        this.#hasCmd = true
        return new Token(T.command, cmd, -1)
    }

    get lastToken() {
        return this.tokens[this.tokens.length - 1]
    }

    parseEscape(msg: Message) {
        if (!this.advance()) {
            return new Token(T.str, "\\", this.#curArgNo)
        }
        let char = this.#curChar
        let sequence = ""
        if (this.advance()) {
            if (this.#curChar === "{") {
                if (this.advance()) {
                    sequence = parseBracketPair(this.string, "{}", this.#i)
                    this.advance(sequence.length)
                }
                else {
                    this.back()
                }
            }
            else {
                this.back()
            }
        }
        return new Token(T.esc, `${char}:${sequence}`, this.#curArgNo)
    }

    async parseFormat(msg: Message) {
        this.advance()
        let inner = parseBracketPair(this.string, "{}", this.#i)
        this.advance(inner.length)
        return new Token(T.format, inner, this.#curArgNo)
    }

    parsePercent() {
        let text = this.#curChar as string
        if (!this.advance()) {
            return new Token(T.str, text, this.#curArgNo)
        }
        if (this.#curChar === "{") {
            this.advance()
            let inner = parseBracketPair(this.string, "{}", this.#i)
            this.advance(inner.length)
            return new Token(T.dofirstrepl, inner, this.#curArgNo)
        }
        else if (this.specialChars.includes(this.#curChar as string)) {
            let tok = new Token(T.str, text, this.#curArgNo)
            this.back()
            return tok
        }
        else {
            return new Token(T.str, text + this.#curChar, this.#curArgNo)
        }

    }

    parseDollar() {
        this.advance()

        if (this.#curChar === '[') {
            this.advance()
            let inside = parseBracketPair(this.string, "[]", this.#i)
            this.advance(inside.length)
            return new Token(T.calc, inside, this.#curArgNo)
        }
        else if (this.#curChar === "(") {
            let containsDoFirstRepl = false
            for (let token of this.tokens.filter(v => v.argNo === this.#curArgNo)) {
                if (token.type === T.dofirstrepl) {
                    containsDoFirstRepl = true
                    break
                }
            }
            if (!containsDoFirstRepl) {
                this.tokens.push(new Token(T.dofirstrepl, "", this.#curArgNo))
            }

            let inside = ""

            this.advance()
            inside += parseBracketPair(this.string, "()", this.#i)
            this.advance(inside.length)

            return new Token(T.dofirst, inside, this.#curArgNo)
        }
        else if (this.#curChar === '{') {
            this.advance()
            let inner = parseBracketPair(this.string, "{}", this.#i)
            this.advance(inner.length)
            let _ifNull
            [inner, ..._ifNull] = inner.split("||")
            let ifNull = _ifNull.join("||")
            let var_ = getVar(this.#msg, inner)
            if (var_ === false) {
                if (ifNull) {
                    return new Token(T.str, ifNull, this.#curArgNo)
                }
                return new Token(T.str, `\${${inner}}`, this.#curArgNo)
            }
            return new Token(T.str, var_, this.#curArgNo)
        }
        else if (this.#curChar == ' ') {
            let tok = new Token(T.str, "$", this.#curArgNo)
            this.#curArgNo++;
            return tok
        }
        else {
            return new Token(T.str, `$${this.#curChar ?? ""}`, this.#curArgNo)
        }
    }
    parseString() {
        let str = this.#curChar as string
        while (this.advance() && !this.specialChars.includes(this.#curChar as string)) {
            str += this.#curChar
        }
        if (this.specialChars.includes(this.#curChar as string)) {
            this.back()
        }
        return new Token(T.str, str, this.#curArgNo)
    }
}

function getCommand(content: string) {
    return content.split(" ")[0]
}

function parseAliasReplacement(msg: Message, cmdContent: string, args: string[]) {
    let finalText = ""
    let isEscaped = false
    for (let i = 0; i < cmdContent.length; i++) {
        let ch = cmdContent[i]
        switch (ch) {
            case "\\": {
                isEscaped = true
                break
            }
            case "{": {
                let startingI = i
                if (isEscaped) {
                    isEscaped = false
                    finalText += "{"
                    continue
                }
                let val = ""
                for (i++; i < cmdContent.length; i++) {
                    let ch = cmdContent[i]
                    if (!"abcdefghijklmnopqrstuvwxyz".includes(ch)) {
                        i--
                        break
                    }
                    val += ch
                }
                let suffix = ""
                let dotsInARow = 0
                for (i++; i < cmdContent.length; i++) {
                    let ch = cmdContent[i]
                    if (ch === "}") {
                        break
                    }
                    if (ch == '.') {
                        dotsInARow++
                        continue
                    }
                    suffix += ch
                }
                if (val == "arg" || val == "args") {
                    if (suffix == "#") {
                        finalText += String(args.length)
                    }
                    else if (dotsInARow == 3) {
                        let startingPoint = 0
                        if (suffix) {
                            startingPoint = Number(suffix) - 1 || 0
                        }
                        finalText += String(args.slice(startingPoint).join(" "))
                    }
                    else if (dotsInARow == 2) {
                        let [n1, n2] = suffix.split("..")
                        finalText += String(args.slice(Number(n1) - 1, Number(n2) - 1).join(" "))
                    }
                    else if (Number(suffix)) {
                        finalText += args[Number(suffix) - 1]
                    }
                    else {
                        finalText += `{${cmdContent.slice(startingI, i)}}`
                    }
                }
                else if (val == "opt") {
                    let opt = suffix.replace(":", "")
                    let opts;
                    [opts, args] = getOpts(args)
                    if (opts[opt] !== undefined)
                        finalText += opts[opt]
                }
                else if (val == "sender") {
                    finalText += String(msg.author)
                }
                else if (val == "senderid") {
                    finalText += msg.author.id
                }
                else if (val == "sendername") {
                    finalText += String(msg.author.username)
                }
                else if (val == "channel") {
                    finalText += String(msg.channel)
                }
                else {
                    finalText += `{${cmdContent.slice(startingI + 1, i)}}`
                }
                break
            }
            default: {
                if (isEscaped) {
                    finalText += `\\${ch}`
                }
                else {
                    finalText += ch
                }
                isEscaped = false
            }
        }
    }
    return finalText
}

function parseDoFirstInnerBracketData(data: string) {
    if (data == "")
        return [undefined, undefined]
    let [doFirstIndex, slice] = data.split(":")
    if (doFirstIndex == data) {
        slice = doFirstIndex
        //@ts-ignore
        doFirstIndex = undefined
    }
    else {
        //@ts-ignore
        doFirstIndex = Number(doFirstIndex)
        if (slice)
            slice = slice
        else
            //@ts-ignore
            slice = undefined
    }
    return [doFirstIndex, slice]
}

function parseDoFirst(cmdData: string, doFirstCountNoToArgNo: number, args: string) {
    let finalArgs = []
    for (let i = 0; i < args.length; i++) {
        let arg = args[i]
        let argIdx = i
        let finalArg = ""
        for (let i = 0; i < arg.length; i++) {
            let ch = arg[i]
            if (ch == "%") {
                i++
                ch = arg[i]
                if (ch == "{") {
                    let data = ""
                    for (i++; i < arg.length; i++) {
                        ch = arg[i]
                        if (ch == "}") break;
                        data += ch
                    }
                    let [doFirstIndex, slice] = parseDoFirstInnerBracketData(data)
                    if (doFirstIndex !== undefined && slice === undefined) {
                        //@ts-ignore
                        finalArg += `${cmdData[doFirstCountNoToArgNo[doFirstIndex]]}`
                    }
                    else if (doFirstIndex === undefined && slice !== undefined) {
                        if (slice === "...") {
                            let splitData = cmdData[argIdx]?.split(" ")
                            if (splitData === undefined) {
                                finalArg += `%{${data}}`
                            }
                            else {
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                finalArg = ""
                                for (let splitIdx = 1; splitIdx < splitData.length; splitIdx++) {
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                        }
                        else {
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if (slice == -1) {
                                finalArg += "__BIRCLE__UNDEFINED__"
                            }
                            else {
                                let splitData = cmdData[argIdx]?.split(" ")
                                //@ts-ignore
                                if (splitData?.[slice] !== undefined) {
                                    //@ts-ignore
                                    finalArg += splitData?.[slice]
                                }
                                else {
                                    finalArg += `%{${data}}`
                                }
                            }
                        }
                    }
                    //@ts-ignore
                    else if (doFirstIndex !== argIdx && slice !== undefined) {
                        if (slice === "...") {
                            //@ts-ignore
                            if (cmdData[doFirstCountNoToArgNo[doFirstIndex]]) {
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                for (let splitIdx = 1; splitIdx < splitData.length; splitIdx++) {
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                            else {
                                finalArg += `%{${data}}`
                            }
                        }
                        else {
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if (cmdData[doFirstCountNoToArgNo[doFirstIndex]]) {
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                //@ts-ignore
                                finalArg += `${splitData[slice]}`
                            }
                            else {
                                finalArg += `%{${data}}`
                            }
                        }
                    }
                    //@ts-ignore
                    else if (isNaN(doFirstIndex)) {
                        finalArg += cmdData[argIdx]
                    }
                    else {
                        finalArg += `%{${data}}`
                    }
                }
                else {
                    finalArg += "%"
                    if (ch)
                        finalArg += ch
                }
            }
            else {
                finalArg += ch
            }
        }
        finalArgs.push(finalArg)
    }
    return finalArgs
}

function operateOnPositionValues(v1: string, op: string, v2: string, areaSize: number, objectSize?: number, numberConv: Function = Number) {
    let conversions
    if (!objectSize) {
        conversions = {
            "center": areaSize / 2,
            "right": areaSize,
            "left": 0,
            "bottom": areaSize,
            "top": 0
        }
    }
    else {
        conversions = {
            "center": areaSize / 2 - objectSize / 2,
            "right": areaSize - objectSize,
            "left": 0,
            "bottom": areaSize - objectSize,
            "top": 0
        }
    }
    if (conversions[v1] !== undefined) {
        //@ts-ignore
        v1 = conversions[v1]
        //@ts-ignore
    } else v1 = numberConv(v1)
    if (conversions[v2] !== undefined) {
        //@ts-ignore
        v2 = conversions[v2]
        //@ts-ignore
    } else v2 = numberConv(v2)
    if (v1 == undefined || v1 == null)
        return numberConv(v2)
    switch (op) {
        case "+":
            return v1 + v2;
        case "-":
            //@ts-ignore
            return v1 - v2;
        case "*":
            //@ts-ignore
            return v1 * v2;
        case "/":
            //@ts-ignore
            return Math.round(v1 / v2);
        case "%":
            //@ts-ignore
            return Math.round(areaSize * (v1 / 100))
    }
    return numberConv(v2)
}

function parsePosition(position: string, areaSize: number, objectSize?: number, numberConv?: Function) {
    if (!numberConv) numberConv = parseInt
    let firstVal, secondVal, operator
    let curValue = ""
    for (let char of position) {
        switch (char) {
            case " ": continue
            case "-":
            case "+":
            case "/":
            case "%":
            case "*":
                operator = char
                firstVal = curValue
                curValue = ""
                break
            default:
                curValue += char
        }
    }
    secondVal = curValue
    return operateOnPositionValues(firstVal as string, operator as string, secondVal, areaSize, objectSize, numberConv)
}

export {
    parsePosition,
    parseAliasReplacement,
    parseDoFirst,
    Parser,
    Token,
    T,
    Modifier,
    Modifiers,
    modifierToStr,
    strToTT
}
