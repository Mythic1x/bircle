import { MessageEmbed, Message, MessageMentionOptions, MessageCreateOptions, MessagePayload, TextChannel, DMChannel, User, Interaction, ChatInputCommandInteraction, CommandInteraction } from "discord.js"

import { ArgList, Options } from './util'

declare global {

    type ArgumentList = Array<string>

    type Opts = { [k: string]: string | boolean }

    type CommandCategory = typeof CommandCategory

    interface CommandFile {
        attachment: string,
        name?: string,
        description?: string,
        /**
            * @deprecated put inside the garbage-files folder instead
        */
        delete?: boolean,
        postPipeDelete?: boolean,
        wasContent?: string
    }

    type FileArray = Array<CommandFile>

    interface CommandReturn extends MessageCreateOptions {
        status: StatusCode
        content?: string,
        embeds?: Array<MessageEmbed>
        files?: FileArray,
        /**
            * @deprecated put inside the garbage-files folder instead
        */
        deleteFiles?: boolean
        delete?: boolean
        noSend?: boolean,
        allowedMentions?: MessageMentionOptions,
        recurse?: boolean | { categories?: CommandCategory[], commands?: string[] },
        do_change_cmd_user_expansion?: boolean
        channel?: TextChannel | DMChannel,
        sendCallback?: (data: MessageOptions | MessagePayload | string) => Promise<Message>,
        /**
        * @description The mimetype of the content
        */
        mimetype?: `${string}/${string}`,
        onOver2kLimit?: (msg: Message, rv: CommandReturn) => CommandReturn
        attachments?: Message['attachments']
        fromHandleSending?: boolean,
        reply?: boolean
    }

    interface CommandHelpArguments {
        [key: string]: {
            description: string,
            required?: boolean,
            requires?: string,
            default?: string
        }
    }

    interface CommandHelpOptions {
        [key: string]: {
            description: string,
            alternates?: string[],
            default?: string
        }
    }

    interface CommandHelp {
        info?: string,
        docs?: string,
        arguments?: CommandHelpArguments,
        options?: CommandHelpOptions,
        tags?: string[],
        /**
            * @description a string for a description, boolean if it just does/does not accept stdin
        */
        accepts_stdin?: string | boolean
    }

    interface ValidationReturn extends CommandReturn {
        invalid: string
    }

    type CommandRun = (msg: Message, args: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList, recursion_count: number, command_bans?: { categories?: CommandCategory[], commands?: string[] }) => Promise<CommandReturn>

    interface Command {
        run: CommandRun;
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        make_bot_type?: boolean,
        use_result_cache?: boolean
        cmd_std_version?: 1,
        prompt_before_run?: boolean
    }

    interface CommandV2RunArg { msg: Message<boolean>, rawArgs: ArgumentList, rawOpts: Opts, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Options, args: ArgList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] }, argList: ArgList, stdin?: CommandReturn, pipeTo?: Token[] }

    type CommandV2Run = (this: [string, CommandV2], {msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans}: CommandV2RunArg) => Promise<CommandReturn>;

    interface CommandV2 {
        run: CommandV2Run
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        make_bot_type?: boolean,
        use_result_cache?: boolean
        cmd_std_version?: 2,
        prompt_before_run?: boolean
    }

    interface SlashCommand {
        run: (interaction: CommandInteraction) => Promise<unknown>,
        description: string,
    }

    interface MatchCommand{
        run: ({msg, match}: {msg: Message, match: RegExpMatchArray}) => Promise<CommandReturn>,
        match: RegExp,
        name: string,
        category: CommandCategory.MATCH
        help?: CommandHelp
    }

    interface CommandVersions {
        1: Command,
        2: CommandV2
    }
}
export { }
